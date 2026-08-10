import { randomUUID } from "crypto";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import {
  calculateSignalScore,
  calculateTokenRiskScore,
  getSignalPriority,
  RULESET_VERSION,
  type FactorContribution,
  type ScoreInput,
} from "@memecoin/intelligence";
import { logger } from "@memecoin/logger";
import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";

const log = logger("signal-score-backfill");

interface SnapshotEvidence {
  liquidityUsd: string | null;
  volume1hUsd: string | null;
  holderCount: number | null;
  qualifiedWalletCount: number | null;
}

export interface BackfillScoreEvidence {
  detectedAt: Date;
  firstSeenAt: Date | null;
  snapshot: SnapshotEvidence;
  metadata: unknown;
}

export interface SignalScoreBackfillResult {
  signalsScanned: number;
  signalsUpdated: number;
  signalsRecalculatedWithoutSnapshot: number;
  alertsUpdated: number;
  dryRun: boolean;
  scoreDistribution: Record<string, number>;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildBackfillScoreInput(evidence: BackfillScoreEvidence): ScoreInput {
  const metadata = asRecord(evidence.metadata);
  const holderEvidence = asRecord(metadata.holderEvidence);
  const walletEvidence = asRecord(metadata.walletEvidence);
  const tokenAge = evidence.firstSeenAt
    ? Math.max(1, Math.floor((evidence.detectedAt.getTime() - evidence.firstSeenAt.getTime()) / 60_000))
    : null;

  return {
    tokenAge,
    liquidityUsd: readNumber(evidence.snapshot.liquidityUsd),
    volume1hUsd: readNumber(evidence.snapshot.volume1hUsd),
    holderCount: evidence.snapshot.holderCount,
    qualifiedWalletCount: evidence.snapshot.qualifiedWalletCount
      ?? readNumber(walletEvidence.qualifiedWalletCount),
    bundledSupplyPct: readNumber(metadata.bundledSupplyPct),
    deployerRisk: readNumber(metadata.deployerRisk),
    topHolderConcentration: readNumber(holderEvidence.topHolderConcentrationPct),
    lpLocked: typeof metadata.lpLocked === "boolean" ? metadata.lpLocked : null,
  };
}

function serializeNumeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "0";
}

function serializeSignalFactor(signalId: string, factor: FactorContribution) {
  return {
    id: randomUUID(),
    signalId,
    factorName: factor.factorName,
    factorType: factor.factorType,
    rawValue: serializeNumeric(factor.rawValue),
    contribution: serializeNumeric(factor.contribution),
    weight: serializeNumeric(factor.weight),
  };
}

function serializeRiskFactor(
  signalId: string,
  factor: {
    factorName: string;
    impact: "risk" | "mitigation";
    value: number | string | boolean | null;
    contribution: number;
  },
) {
  return {
    id: randomUUID(),
    signalId,
    factorName: factor.factorName,
    factorType: factor.impact === "mitigation" ? "positive" : "negative",
    rawValue: serializeNumeric(factor.value),
    contribution: serializeNumeric(
      factor.impact === "mitigation" ? Math.abs(factor.contribution) : -Math.abs(factor.contribution),
    ),
    weight: "0",
  };
}

function updateAlertMessage(message: string, score: number, riskRating: string, riskScore: number) {
  return message
    .replace(/Score:\s*\d+\/100\./i, `Score: ${score}/100.`)
    .replace(/Risk:\s*[^.]+\(\d+\/100\)\./i, `Risk: ${riskRating} (${riskScore}/100).`);
}

function distributionBucket(score: number) {
  if (score >= 80) return "80-100";
  if (score >= 60) return "60-79";
  if (score >= 40) return "40-59";
  if (score >= 20) return "20-39";
  return "0-19";
}

export async function backfillSignalScores(options?: {
  limit?: number;
  sinceDays?: number;
  dryRun?: boolean;
}): Promise<SignalScoreBackfillResult> {
  const limit = Math.min(Math.max(options?.limit ?? 1000, 1), 5000);
  const sinceDays = Math.min(Math.max(options?.sinceDays ?? 7, 1), 30);
  const dryRun = options?.dryRun ?? false;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const db = getDb();
  const candidates = await db.select({
    id: schema.signals.id,
    tokenAddress: schema.signals.tokenAddress,
    signalScore: schema.signals.signalScore,
    rulesetVersion: schema.signals.rulesetVersion,
    metadata: schema.signals.metadata,
    detectedAt: schema.signals.detectedAt,
    firstSeenAt: schema.tokens.firstSeenAt,
  })
    .from(schema.signals)
    .leftJoin(schema.tokens, eq(schema.signals.tokenAddress, schema.tokens.address))
    .where(and(
      gte(schema.signals.detectedAt, since),
      ne(schema.signals.rulesetVersion, RULESET_VERSION),
    ))
    .orderBy(asc(schema.signals.detectedAt))
    .limit(limit);

  const result: SignalScoreBackfillResult = {
    signalsScanned: candidates.length,
    signalsUpdated: 0,
    signalsRecalculatedWithoutSnapshot: 0,
    alertsUpdated: 0,
    dryRun,
    scoreDistribution: {},
  };

  for (const signal of candidates) {
    const snapshots = await db.select({
      liquidityUsd: schema.tokenSnapshots.liquidityUsd,
      volume1hUsd: schema.tokenSnapshots.volume1hUsd,
      holderCount: schema.tokenSnapshots.holderCount,
      qualifiedWalletCount: schema.tokenSnapshots.qualifiedWalletCount,
    })
      .from(schema.tokenSnapshots)
      .where(and(
        eq(schema.tokenSnapshots.tokenAddress, signal.tokenAddress),
        lte(schema.tokenSnapshots.snapshotAt, signal.detectedAt),
      ))
      .orderBy(desc(schema.tokenSnapshots.snapshotAt))
      .limit(1);

    let snapshot = snapshots[0];
    if (!snapshot) {
      const subsequentSnapshots = await db.select({
        liquidityUsd: schema.tokenSnapshots.liquidityUsd,
        volume1hUsd: schema.tokenSnapshots.volume1hUsd,
        holderCount: schema.tokenSnapshots.holderCount,
        qualifiedWalletCount: schema.tokenSnapshots.qualifiedWalletCount,
      })
        .from(schema.tokenSnapshots)
        .where(and(
          eq(schema.tokenSnapshots.tokenAddress, signal.tokenAddress),
          gte(schema.tokenSnapshots.snapshotAt, signal.detectedAt),
        ))
        .orderBy(asc(schema.tokenSnapshots.snapshotAt))
        .limit(1);
      snapshot = subsequentSnapshots[0];
    }

    if (!snapshot) {
      result.signalsRecalculatedWithoutSnapshot++;
      snapshot = {
        liquidityUsd: null,
        volume1hUsd: null,
        holderCount: null,
        qualifiedWalletCount: null,
      };
    }

    const scoreInput = buildBackfillScoreInput({
      detectedAt: signal.detectedAt,
      firstSeenAt: signal.firstSeenAt,
      snapshot,
      metadata: signal.metadata,
    });
    const score = calculateSignalScore(scoreInput);
    const risk = calculateTokenRiskScore({
      tokenAgeMinutes: scoreInput.tokenAge ?? 0,
      liquidityUsd: scoreInput.liquidityUsd,
      volume1hUsd: scoreInput.volume1hUsd,
      holderCount: scoreInput.holderCount,
      bundledSupplyPct: scoreInput.bundledSupplyPct,
      deployerRisk: scoreInput.deployerRisk,
      topHolderConcentration: scoreInput.topHolderConcentration,
      lpLocked: scoreInput.lpLocked,
    });
    const priority = getSignalPriority(score.score);
    const bucket = distributionBucket(score.score);
    result.scoreDistribution[bucket] = (result.scoreDistribution[bucket] ?? 0) + 1;

    if (dryRun) {
      result.signalsUpdated++;
      continue;
    }

    await db.transaction(async (tx) => {
      const metadata = asRecord(signal.metadata);
      await tx.update(schema.signals).set({
        signalScore: score.score,
        confidence: String(score.confidence),
        rulesetVersion: score.rulesetVersion,
        priority,
        metadata: {
          ...metadata,
          risk: {
            score: risk.riskScore,
            rating: risk.rating,
            confidence: risk.confidence,
            rulesetVersion: risk.rulesetVersion,
            missingFeatures: risk.missingFeatures,
          },
          scoreRepair: {
            previousScore: signal.signalScore,
            previousRulesetVersion: signal.rulesetVersion,
            repairedAt: new Date().toISOString(),
          },
        },
      }).where(eq(schema.signals.id, signal.id));

      await tx.delete(schema.signalFactors).where(eq(schema.signalFactors.signalId, signal.id));
      const factors = [
        ...score.positiveFactors.map((factor) => serializeSignalFactor(signal.id, factor)),
        ...score.negativeFactors.map((factor) => serializeSignalFactor(signal.id, factor)),
        ...risk.riskFactors.map((factor) => serializeRiskFactor(signal.id, factor)),
        ...risk.mitigatingFactors.map((factor) => serializeRiskFactor(signal.id, factor)),
      ];
      if (factors.length > 0) {
        await tx.insert(schema.signalFactors).values(factors);
      }

      const alerts = await tx.select({
        id: schema.alerts.id,
        message: schema.alerts.message,
      }).from(schema.alerts).where(eq(schema.alerts.signalId, signal.id));
      for (const alert of alerts) {
        await tx.update(schema.alerts).set({
          signalScore: score.score,
          priority,
          message: updateAlertMessage(alert.message, score.score, risk.rating, risk.riskScore),
        }).where(eq(schema.alerts.id, alert.id));
      }
      result.alertsUpdated += alerts.length;
    });

    result.signalsUpdated++;
  }

  log.info(result, "Signal score backfill complete");
  return result;
}
