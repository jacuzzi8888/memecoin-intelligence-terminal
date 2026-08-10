import { randomUUID } from "crypto";
import type { Database } from "@memecoin/database";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import {
  calculateSignalScore,
  calculateTokenRiskScore,
  StrategyEngine,
  toRuntimeStrategyConfig,
  type FactorContribution,
  type RuntimeStrategyRecord,
} from "@memecoin/intelligence";
import { logger as createLogger } from "@memecoin/logger";
import { generateDeepLinks } from "@memecoin/notifications";
import { and, asc, eq } from "drizzle-orm";

const log = createLogger("processor");

interface RawTokenLaunchPayload {
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  deployer: string;
  initialLiquidity: number;
  timestamp: string;
}

interface PendingRawEvent {
  id: string;
  provider: string;
  rawJson: Record<string, unknown>;
  txSignature: string | null;
}

interface TokenRecord {
  id: string;
}

type StrategyRecord = RuntimeStrategyRecord;

export interface RawEventProcessorRepository {
  getPendingTokenLaunchEvents(limit: number): Promise<PendingRawEvent[]>;
  findTokenByAddress(address: string): Promise<TokenRecord | null>;
  insertToken(token: {
    id: string;
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    totalSupply: string;
    firstSeenAt: Date;
  }): Promise<void>;
  insertTokenLaunch(launch: {
    id: string;
    tokenId: string;
    tokenAddress: string;
    deployerAddress: string;
    launchedAt: Date;
    initialLiquidityUsd: string;
    launchProgram: string;
    txSignature: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  insertNormalisedTokenEvent(event: {
    id: string;
    tokenId: string;
    tokenAddress: string;
    eventType: string;
    eventSubtype: string;
    rawEventId: string;
    txSignature: string | null;
    blockTime: Date;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  getActiveStrategies(): Promise<StrategyRecord[]>;
  insertSignal(signal: {
    id: string;
    strategyId: string;
    tokenAddress: string;
    tokenId: string;
    signalScore: number;
    confidence: string;
    rulesetVersion: string;
    priority: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  insertSignalFactor(factor: {
    id: string;
    signalId: string;
    factorName: string;
    factorType: string;
    rawValue: string;
    contribution: string;
    weight: string;
  }): Promise<void>;
  insertAlert(alert: {
    id: string;
    signalId: string;
    tokenAddress: string;
    priority: string;
    strategyId: string;
    title: string;
    message: string;
    signalScore: number;
    webDeepLink: string;
    telegramDeepLink: string;
    status: string;
  }): Promise<void>;
  markRawEventProcessed(eventId: string): Promise<void>;
  markRawEventFailed(eventId: string, error: unknown, payload: Record<string, unknown>): Promise<void>;
}

export interface ProcessRawEventsOptions {
  appUrl: string;
  limit?: number;
  repository: RawEventProcessorRepository;
}

export interface ProcessRawEventsResult {
  processed: number;
  failed: number;
}

export function createRawEventProcessorRepository(db: Database = getDb()): RawEventProcessorRepository {
  return {
    async getPendingTokenLaunchEvents(limit) {
      const rows = await db.select({
        id: schema.rawProviderEvents.id,
        provider: schema.rawProviderEvents.provider,
        rawJson: schema.rawProviderEvents.rawJson,
        txSignature: schema.rawProviderEvents.txSignature,
      })
        .from(schema.rawProviderEvents)
        .where(and(
          eq(schema.rawProviderEvents.processingStatus, "pending"),
          eq(schema.rawProviderEvents.eventType, "token_launch"),
        ))
        .orderBy(asc(schema.rawProviderEvents.ingestAt))
        .limit(limit);

      return rows as PendingRawEvent[];
    },
    async findTokenByAddress(address) {
      const rows = await db.select({ id: schema.tokens.id })
        .from(schema.tokens)
        .where(eq(schema.tokens.address, address))
        .limit(1);
      return rows[0] ?? null;
    },
    async insertToken(token) {
      await db.insert(schema.tokens).values(token).onConflictDoNothing();
    },
    async insertTokenLaunch(launch) {
      await db.insert(schema.tokenLaunches).values(launch).onConflictDoNothing();
    },
    async insertNormalisedTokenEvent(event) {
      await db.insert(schema.normalisedTokenEvents).values(event).onConflictDoNothing();
    },
    async getActiveStrategies() {
      const rows = await db.select({
        id: schema.strategies.id,
        name: schema.strategies.name,
        description: schema.strategies.description,
        version: schema.strategies.currentVersion,
        userId: schema.strategies.userId,
        createdAt: schema.strategies.createdAt,
        updatedAt: schema.strategies.updatedAt,
        config: schema.strategyVersions.config,
      })
        .from(schema.strategies)
        .leftJoin(schema.strategyVersions, and(
          eq(schema.strategyVersions.strategyId, schema.strategies.id),
          eq(schema.strategyVersions.version, schema.strategies.currentVersion),
        ))
        .where(eq(schema.strategies.isActive, "true"));

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        version: row.version,
        userId: row.userId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        isActive: true,
        config: isRecord(row.config) ? row.config : {},
      }));
    },
    async insertSignal(signal) {
      await db.insert(schema.signals).values(signal);
    },
    async insertSignalFactor(factor) {
      await db.insert(schema.signalFactors).values(factor);
    },
    async insertAlert(alert) {
      await db.insert(schema.alerts).values(alert);
    },
    async markRawEventProcessed(eventId) {
      await db.update(schema.rawProviderEvents)
        .set({
          processingStatus: "processed",
          processedAt: new Date(),
        })
        .where(eq(schema.rawProviderEvents.id, eventId));
    },
    async markRawEventFailed(eventId, error, payload) {
      await db.update(schema.rawProviderEvents)
        .set({
          processingStatus: "failed",
          processedAt: new Date(),
        })
        .where(eq(schema.rawProviderEvents.id, eventId));

      await db.insert(schema.processingFailures).values({
        id: randomUUID(),
        stage: "processor",
        rawEventId: eventId,
        entityType: "raw_provider_event",
        entityId: eventId,
        error: error instanceof Error ? error.message : String(error),
        stackTrace: error instanceof Error ? error.stack : undefined,
        payload,
      });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRawTokenLaunchPayload(rawJson: Record<string, unknown>): RawTokenLaunchPayload {
  const {
    tokenAddress,
    symbol,
    name,
    decimals,
    deployer,
    initialLiquidity,
    timestamp,
  } = rawJson;

  if (
    typeof tokenAddress !== "string" ||
    typeof symbol !== "string" ||
    typeof name !== "string" ||
    typeof decimals !== "number" ||
    typeof deployer !== "string" ||
    typeof initialLiquidity !== "number" ||
    typeof timestamp !== "string"
  ) {
    throw new Error("Invalid raw token launch payload");
  }

  return {
    tokenAddress,
    symbol,
    name,
    decimals,
    deployer,
    initialLiquidity,
    timestamp,
  };
}

function getPriority(score: number) {
  return score >= 80 ? "critical" : score >= 60 ? "high" : "medium";
}

function serializeFactor(signalId: string, factor: FactorContribution) {
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

function serializeNumeric(value: unknown) {
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : "0";
  }

  return "0";
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
    contribution: serializeNumeric(factor.impact === "mitigation" ? Math.abs(factor.contribution) : -Math.abs(factor.contribution)),
    weight: "0",
  };
}

export async function processPendingRawEvents(options: ProcessRawEventsOptions): Promise<ProcessRawEventsResult> {
  const limit = options.limit ?? 25;
  const events = await options.repository.getPendingTokenLaunchEvents(limit);

  let processed = 0;
  let failed = 0;

  for (const rawEvent of events) {
    try {
      const payload = parseRawTokenLaunchPayload(rawEvent.rawJson);
      const launchedAt = new Date(payload.timestamp);
      const tokenAgeMinutes = Math.max(1, Math.floor((Date.now() - launchedAt.getTime()) / 60000));

      let token = await options.repository.findTokenByAddress(payload.tokenAddress);
      if (!token) {
        await options.repository.insertToken({
          id: randomUUID(),
          address: payload.tokenAddress,
          symbol: payload.symbol,
          name: payload.name,
          decimals: payload.decimals,
          totalSupply: "0",
          firstSeenAt: launchedAt,
        });
        token = await options.repository.findTokenByAddress(payload.tokenAddress);
      }

      if (!token) {
        throw new Error("Token persistence failed");
      }

      await options.repository.insertTokenLaunch({
        id: randomUUID(),
        tokenId: token.id,
        tokenAddress: payload.tokenAddress,
        deployerAddress: payload.deployer,
        launchedAt,
        initialLiquidityUsd: String(payload.initialLiquidity),
        launchProgram: rawEvent.provider,
        txSignature: rawEvent.txSignature,
        metadata: {
          network: "development",
          discoveryProvider: rawEvent.provider,
          marketDataProvider: rawEvent.provider,
          sourceRawEventId: rawEvent.id,
        },
      });

      await options.repository.insertNormalisedTokenEvent({
        id: randomUUID(),
        tokenId: token.id,
        tokenAddress: payload.tokenAddress,
        eventType: "token_launch",
        eventSubtype: rawEvent.provider,
        rawEventId: rawEvent.id,
        txSignature: rawEvent.txSignature,
        blockTime: launchedAt,
        metadata: {
          sourceRawEventId: rawEvent.id,
          provider: rawEvent.provider,
        },
      });

      const strategies = await options.repository.getActiveStrategies();
      if (strategies.length === 0) {
        throw new Error("No active strategy available for processor");
      }

      const score = calculateSignalScore({
        tokenAge: tokenAgeMinutes,
        liquidityUsd: payload.initialLiquidity,
        volume1hUsd: null,
        holderCount: null,
        qualifiedWalletCount: null,
        bundledSupplyPct: null,
        deployerRisk: null,
        topHolderConcentration: null,
        lpLocked: null,
      });
      const risk = calculateTokenRiskScore({
        tokenAgeMinutes,
        liquidityUsd: payload.initialLiquidity,
        volume1hUsd: null,
        holderCount: null,
        bundledSupplyPct: null,
        deployerRisk: null,
        topHolderConcentration: null,
        lpLocked: null,
      });

      const fallbackPriority = getPriority(score.score);
      const engine = new StrategyEngine();
      const matchingStrategies = strategies.map((strategy) => {
        const config = toRuntimeStrategyConfig(strategy);
        const evaluation = engine.evaluate(config, {
          token_score: score.score,
          score_confidence: score.confidence,
          token_age_minutes: tokenAgeMinutes,
          liquidity_usd: payload.initialLiquidity,
          volume_1h_usd: null,
          holder_count: null,
          qualified_wallet_count: null,
          risk_score: risk.rating === "unknown" ? null : risk.riskScore,
          risk_confidence: risk.confidence,
        });
        return { strategy, config, evaluation };
      }).filter(({ evaluation }) => evaluation.matched);

      for (const { strategy, config, evaluation } of matchingStrategies) {
        const priority = config.priority || fallbackPriority;
        const signalId = randomUUID();

        await options.repository.insertSignal({
          id: signalId,
          strategyId: strategy.id,
          tokenAddress: payload.tokenAddress,
          tokenId: token.id,
          signalScore: score.score,
          confidence: String(score.confidence),
          rulesetVersion: score.rulesetVersion,
          priority,
          metadata: {
            network: "development",
            discoveryProvider: rawEvent.provider,
            marketDataProvider: rawEvent.provider,
            snapshotAvailable: false,
            sourceRawEventId: rawEvent.id,
            strategyEvaluation: evaluation,
            risk: {
              score: risk.riskScore,
              rating: risk.rating,
              confidence: risk.confidence,
              rulesetVersion: risk.rulesetVersion,
              missingFeatures: risk.missingFeatures,
            },
          },
        });

        for (const factor of [...score.positiveFactors, ...score.negativeFactors]) {
          await options.repository.insertSignalFactor(serializeFactor(signalId, factor));
        }
        for (const factor of [...risk.riskFactors, ...risk.mitigatingFactors]) {
          await options.repository.insertSignalFactor(serializeRiskFactor(signalId, factor));
        }

        const links = generateDeepLinks(payload.tokenAddress, options.appUrl);
        await options.repository.insertAlert({
          id: randomUUID(),
          signalId,
          tokenAddress: payload.tokenAddress,
          priority,
          strategyId: strategy.id,
          title: `Signal: ${score.score}/100 for ${payload.symbol}`,
          message: `${payload.name} detected from raw pipeline. Confidence: ${score.confidence}. Risk: ${risk.rating} (${risk.riskScore}/100).`,
          signalScore: score.score,
          webDeepLink: links.webUrl,
          telegramDeepLink: links.telegramUrl,
          status: "pending",
        });
      }

      await options.repository.markRawEventProcessed(rawEvent.id);
      processed++;
    } catch (error) {
      failed++;
      await options.repository.markRawEventFailed(
        rawEvent.id,
        error,
        isRecord(rawEvent.rawJson) ? rawEvent.rawJson : {},
      );
      log.error({ error, rawEventId: rawEvent.id }, "Failed to process raw event");
    }
  }

  return { processed, failed };
}
