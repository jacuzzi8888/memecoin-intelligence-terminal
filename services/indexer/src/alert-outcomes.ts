import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { logger } from "@memecoin/logger";

const log = logger("alert-outcomes");

const OUTCOME_WINDOWS = [
  { label: "5m", minutes: 5, maxDelayMinutes: 15 },
  { label: "15m", minutes: 15, maxDelayMinutes: 30 },
  { label: "1h", minutes: 60, maxDelayMinutes: 120 },
  { label: "4h", minutes: 240, maxDelayMinutes: 360 },
  { label: "24h", minutes: 1440, maxDelayMinutes: 2160 },
] as const;

type OutcomeWindow = typeof OUTCOME_WINDOWS[number];

interface SnapshotRecord {
  tokenAddress: string;
  priceUsd: string | null;
  marketCapUsd: string | null;
  snapshotAt: Date;
}

export interface AlertOutcomeBackfillResult {
  alertsScanned: number;
  outcomesInserted: number;
  outcomesSkippedExisting: number;
  outcomesPending: number;
  alertsWithoutBaseline: number;
  windows: Record<string, {
    inserted: number;
    pending: number;
    skippedExisting: number;
  }>;
}

const PATH_OUTCOME_TYPES = ["mae_24h_pct", "max_return_24h_pct"] as const;

function outcomeType(window: OutcomeWindow) {
  return `return_${window.label}_pct`;
}

function parseMetric(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function calculateReturnPct(baseline: number, outcome: number) {
  if (baseline <= 0) return null;
  const value = ((outcome - baseline) / baseline) * 100;
  return Number.isFinite(value) ? value : null;
}

async function findBaselineSnapshot(tokenAddress: string, triggeredAt: Date): Promise<SnapshotRecord | null> {
  const db = getDb();
  const before = await db.select({
    tokenAddress: schema.tokenSnapshots.tokenAddress,
    priceUsd: schema.tokenSnapshots.priceUsd,
    marketCapUsd: schema.tokenSnapshots.marketCapUsd,
    snapshotAt: schema.tokenSnapshots.snapshotAt,
  })
    .from(schema.tokenSnapshots)
    .where(and(
      eq(schema.tokenSnapshots.tokenAddress, tokenAddress),
      lte(schema.tokenSnapshots.snapshotAt, triggeredAt),
    ))
    .orderBy(desc(schema.tokenSnapshots.snapshotAt))
    .limit(1);

  if (before[0]) return before[0];

  const after = await db.select({
    tokenAddress: schema.tokenSnapshots.tokenAddress,
    priceUsd: schema.tokenSnapshots.priceUsd,
    marketCapUsd: schema.tokenSnapshots.marketCapUsd,
    snapshotAt: schema.tokenSnapshots.snapshotAt,
  })
    .from(schema.tokenSnapshots)
    .where(and(
      eq(schema.tokenSnapshots.tokenAddress, tokenAddress),
      gte(schema.tokenSnapshots.snapshotAt, triggeredAt),
    ))
    .orderBy(asc(schema.tokenSnapshots.snapshotAt))
    .limit(1);

  return after[0] ?? null;
}

async function findOutcomeSnapshot(
  tokenAddress: string,
  targetAt: Date,
  maxDelayMinutes: number,
): Promise<SnapshotRecord | null> {
  const maxSnapshotAt = new Date(targetAt.getTime() + maxDelayMinutes * 60_000);
  const rows = await getDb().select({
    tokenAddress: schema.tokenSnapshots.tokenAddress,
    priceUsd: schema.tokenSnapshots.priceUsd,
    marketCapUsd: schema.tokenSnapshots.marketCapUsd,
    snapshotAt: schema.tokenSnapshots.snapshotAt,
  })
    .from(schema.tokenSnapshots)
    .where(and(
      eq(schema.tokenSnapshots.tokenAddress, tokenAddress),
      gte(schema.tokenSnapshots.snapshotAt, targetAt),
      lte(schema.tokenSnapshots.snapshotAt, maxSnapshotAt),
    ))
    .orderBy(asc(schema.tokenSnapshots.snapshotAt))
    .limit(1);

  return rows[0] ?? null;
}

async function findSnapshotsBetween(tokenAddress: string, startAt: Date, endAt: Date): Promise<SnapshotRecord[]> {
  return getDb().select({
    tokenAddress: schema.tokenSnapshots.tokenAddress,
    priceUsd: schema.tokenSnapshots.priceUsd,
    marketCapUsd: schema.tokenSnapshots.marketCapUsd,
    snapshotAt: schema.tokenSnapshots.snapshotAt,
  })
    .from(schema.tokenSnapshots)
    .where(and(
      eq(schema.tokenSnapshots.tokenAddress, tokenAddress),
      gte(schema.tokenSnapshots.snapshotAt, startAt),
      lte(schema.tokenSnapshots.snapshotAt, endAt),
    ))
    .orderBy(asc(schema.tokenSnapshots.snapshotAt));
}

async function hasExistingOutcome(alertId: string, type: string) {
  const rows = await getDb().select({ id: schema.alertOutcomes.id })
    .from(schema.alertOutcomes)
    .where(and(eq(schema.alertOutcomes.alertId, alertId), eq(schema.alertOutcomes.outcomeType, type)))
    .limit(1);
  return rows.length > 0;
}

function getOutcomeReturnPct(baseline: SnapshotRecord, outcome: SnapshotRecord) {
  const baselinePrice = parseMetric(baseline.priceUsd);
  const outcomePrice = parseMetric(outcome.priceUsd);
  const priceReturnPct = baselinePrice && outcomePrice
    ? calculateReturnPct(baselinePrice, outcomePrice)
    : null;
  if (priceReturnPct !== null) {
    return {
      returnPct: priceReturnPct,
      metric: "priceUsd",
      baselineValue: baselinePrice,
      outcomeValue: outcomePrice,
    };
  }

  const baselineMarketCap = parseMetric(baseline.marketCapUsd);
  const outcomeMarketCap = parseMetric(outcome.marketCapUsd);
  const marketCapReturnPct = baselineMarketCap && outcomeMarketCap
    ? calculateReturnPct(baselineMarketCap, outcomeMarketCap)
    : null;
  if (marketCapReturnPct === null) return null;

  return {
    returnPct: marketCapReturnPct,
    metric: "marketCapUsd",
    baselineValue: baselineMarketCap,
    outcomeValue: outcomeMarketCap,
  };
}

export function getPathOutcome(baseline: SnapshotRecord, snapshots: SnapshotRecord[]) {
  const baselinePrice = parseMetric(baseline.priceUsd);
  const metric = baselinePrice ? "priceUsd" : "marketCapUsd";
  const baselineValue = baselinePrice ?? parseMetric(baseline.marketCapUsd);
  if (!baselineValue) return null;

  const returns = snapshots
    .map((snapshot) => {
      const value = parseMetric(metric === "priceUsd" ? snapshot.priceUsd : snapshot.marketCapUsd);
      return value ? calculateReturnPct(baselineValue, value) : null;
    })
    .filter((value): value is number => value !== null);

  if (returns.length === 0) return null;

  return {
    metric,
    baselineValue,
    maePct: Math.min(0, ...returns),
    maxReturnPct: Math.max(...returns),
  };
}

export async function backfillAlertOutcomes(options?: {
  limit?: number;
  sinceDays?: number;
}): Promise<AlertOutcomeBackfillResult> {
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 1000);
  const sinceDays = Math.min(Math.max(options?.sinceDays ?? 7, 1), 30);
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const alerts = await getDb().select({
    id: schema.alerts.id,
    tokenAddress: schema.alerts.tokenAddress,
    signalId: schema.alerts.signalId,
    strategyId: schema.alerts.strategyId,
    signalScore: schema.alerts.signalScore,
    triggeredAt: schema.alerts.triggeredAt,
  })
    .from(schema.alerts)
    .where(and(gte(schema.alerts.triggeredAt, since), ne(schema.alerts.status, "superseded")))
    .orderBy(desc(schema.alerts.triggeredAt))
    .limit(limit);

  const result: AlertOutcomeBackfillResult = {
    alertsScanned: alerts.length,
    outcomesInserted: 0,
    outcomesSkippedExisting: 0,
    outcomesPending: 0,
    alertsWithoutBaseline: 0,
    windows: Object.fromEntries(OUTCOME_WINDOWS.map((window) => [
      window.label,
      { inserted: 0, pending: 0, skippedExisting: 0 },
    ])),
  };

  for (const alert of alerts) {
    const baseline = await findBaselineSnapshot(alert.tokenAddress, alert.triggeredAt);
    if (!baseline) {
      result.alertsWithoutBaseline++;
      continue;
    }

    for (const window of OUTCOME_WINDOWS) {
      const type = outcomeType(window);
      const targetAt = new Date(alert.triggeredAt.getTime() + window.minutes * 60_000);
      if (targetAt > new Date()) {
        result.outcomesPending++;
        result.windows[window.label]!.pending++;
        continue;
      }

      if (await hasExistingOutcome(alert.id, type)) {
        result.outcomesSkippedExisting++;
        result.windows[window.label]!.skippedExisting++;
        continue;
      }

      const outcome = await findOutcomeSnapshot(alert.tokenAddress, targetAt, window.maxDelayMinutes);
      if (!outcome) {
        result.outcomesPending++;
        result.windows[window.label]!.pending++;
        continue;
      }

      const measured = getOutcomeReturnPct(baseline, outcome);
      if (!measured) {
        result.outcomesPending++;
        result.windows[window.label]!.pending++;
        continue;
      }

      await getDb().insert(schema.alertOutcomes).values({
        id: randomUUID(),
        alertId: alert.id,
        outcomeType: type,
        outcomeValue: measured.returnPct.toString(),
        recordedAt: new Date(),
        metadata: {
          version: "alert-outcome-v0.1.0",
          window: window.label,
          windowMinutes: window.minutes,
          metric: measured.metric,
          baselineValue: measured.baselineValue,
          outcomeValue: measured.outcomeValue,
          baselineSnapshotAt: baseline.snapshotAt.toISOString(),
          targetAt: targetAt.toISOString(),
          outcomeSnapshotAt: outcome.snapshotAt.toISOString(),
          tokenAddress: alert.tokenAddress,
          signalId: alert.signalId,
          strategyId: alert.strategyId,
          signalScore: alert.signalScore,
        },
      });

      result.outcomesInserted++;
      result.windows[window.label]!.inserted++;
    }

    const pathTargetAt = new Date(alert.triggeredAt.getTime() + 24 * 60 * 60_000);
    if (pathTargetAt <= new Date()) {
      const pathSnapshots = await findSnapshotsBetween(alert.tokenAddress, baseline.snapshotAt, pathTargetAt);
      const path = getPathOutcome(baseline, pathSnapshots);

      if (path) {
        for (const type of PATH_OUTCOME_TYPES) {
          if (await hasExistingOutcome(alert.id, type)) {
            result.outcomesSkippedExisting++;
            continue;
          }

          const value = type === "mae_24h_pct" ? path.maePct : path.maxReturnPct;
          await getDb().insert(schema.alertOutcomes).values({
            id: randomUUID(),
            alertId: alert.id,
            outcomeType: type,
            outcomeValue: value.toString(),
            recordedAt: new Date(),
            metadata: {
              version: "alert-outcome-v0.2.0",
              metric: path.metric,
              baselineValue: path.baselineValue,
              baselineSnapshotAt: baseline.snapshotAt.toISOString(),
              targetAt: pathTargetAt.toISOString(),
              outcomeSnapshotAt: pathSnapshots.at(-1)?.snapshotAt.toISOString() ?? null,
              tokenAddress: alert.tokenAddress,
              signalId: alert.signalId,
              strategyId: alert.strategyId,
              signalScore: alert.signalScore,
            },
          });
          result.outcomesInserted++;
        }
      } else {
        result.outcomesPending += PATH_OUTCOME_TYPES.length;
      }
    } else {
      result.outcomesPending += PATH_OUTCOME_TYPES.length;
    }
  }

  log.info(result, "Alert outcome backfill complete");
  return result;
}

export async function getAlertOutcomeSummary(options?: {
  sinceDays?: number;
}) {
  const sinceDays = Math.min(Math.max(options?.sinceDays ?? 7, 1), 30);
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await getDb().select({
    outcomeType: schema.alertOutcomes.outcomeType,
    count: sql<number>`count(*)`,
    avgReturnPct: sql<number>`avg(${schema.alertOutcomes.outcomeValue})`,
    winCount: sql<number>`sum(case when ${schema.alertOutcomes.outcomeValue} > 0 then 1 else 0 end)`,
    maxReturnPct: sql<number>`max(${schema.alertOutcomes.outcomeValue})`,
    minReturnPct: sql<number>`min(${schema.alertOutcomes.outcomeValue})`,
  })
    .from(schema.alertOutcomes)
    .where(gte(schema.alertOutcomes.recordedAt, since))
    .groupBy(schema.alertOutcomes.outcomeType);

  return rows.map((row) => ({
    outcomeType: row.outcomeType,
    count: Number(row.count || 0),
    avgReturnPct: Number(row.avgReturnPct || 0),
    winRate: Number(row.count || 0) > 0 ? Number(row.winCount || 0) / Number(row.count || 1) : 0,
    maxReturnPct: Number(row.maxReturnPct || 0),
    minReturnPct: Number(row.minReturnPct || 0),
  }));
}
