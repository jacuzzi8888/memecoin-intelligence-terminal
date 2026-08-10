import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { and, eq, desc, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { logger } from "@memecoin/logger";
import { replayStrategy, type StrategyConfig, type StrategyCondition } from "@memecoin/intelligence";
import { getRecentWindow, serializeRecentWindow } from "./recent-window.js";
import { resolveRequestUser } from "./dev-user.js";

const log = logger("api:strategies");

const strategySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  alertThreshold: z.number().min(0).max(100).default(70),
  cooldownMinutes: z.number().min(0).max(1440).default(60),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(["gt", "lt", "eq", "gte", "lte", "between", "in"]),
    value: z.union([z.number(), z.string(), z.boolean(), z.array(z.number()), z.array(z.string())]),
    weight: z.number().min(0).max(1),
  })),
  priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  channels: z.array(z.string()).default(["web"]),
  isActive: z.boolean().default(true),
});

const updateSchema = strategySchema.partial();
const listQuerySchema = z.object({
  sinceDays: z.coerce.number().min(1).max(30).default(1),
});

const performanceQuerySchema = z.object({
  sinceDays: z.coerce.number().min(1).max(30).default(7),
});

const backtestQuerySchema = z.object({
  strategyId: z.string().min(1).optional(),
  sinceDays: z.coerce.number().min(1).max(30).default(30),
  horizonMinutes: z.coerce.number().min(5).max(10080).default(1440),
  maxEntriesPerToken: z.coerce.number().min(1).max(50).default(10),
});

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toBacktestConfig(strategy: typeof schema.strategies.$inferSelect, version: typeof schema.strategyVersions.$inferSelect): StrategyConfig {
  const config = asRecord(version.config);
  const conditions = Array.isArray(config.conditions) ? config.conditions as StrategyCondition[] : [];
  const priority = config.priority === "critical" || config.priority === "high" || config.priority === "medium" || config.priority === "low"
    ? config.priority
    : "medium";

  return {
    id: strategy.id,
    name: strategy.name,
    description: strategy.description ?? "",
    version: version.version,
    isActive: strategy.isActive === "true",
    alertThreshold: readNumber(config.alertThreshold, 70),
    cooldownMinutes: readNumber(config.cooldownMinutes, 60),
    conditions,
    channels: Array.isArray(config.channels) ? config.channels.filter((channel): channel is string => typeof channel === "string") : ["web"],
    priority,
    userId: strategy.userId,
    createdAt: strategy.createdAt.toISOString(),
    updatedAt: strategy.updatedAt.toISOString(),
  };
}

export const strategiesRoute: FastifyPluginAsync = async (app) => {
  app.get("/strategies", async (request) => {
    const query = listQuerySchema.parse(request.query);
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const since = getRecentWindow(query.sinceDays);
    const rows = await db.select()
      .from(schema.strategies)
      .where(and(
        or(eq(schema.strategies.userId, user.id), isNull(schema.strategies.userId)),
        sql`${schema.strategies.id} <> 'system-market-scan'`,
      ))
      .orderBy(desc(schema.strategies.createdAt));
    const strategyIds = rows.map((strategy) => strategy.id);
    const versionRows = strategyIds.length > 0
      ? await db.select().from(schema.strategyVersions).where(inArray(schema.strategyVersions.strategyId, strategyIds))
      : [];
    const currentVersionByStrategy = new Map(
      versionRows.map((version) => [`${version.strategyId}:${version.version}`, version]),
    );
    const signalRows = strategyIds.length > 0
      ? await db.select().from(schema.signals).where(and(
        inArray(schema.signals.strategyId, strategyIds),
        gte(schema.signals.detectedAt, since),
        sql`${schema.signals.metadata} ? 'strategyEvaluation'`,
      )).orderBy(desc(schema.signals.detectedAt)).limit(100)
      : [];
    const tokenAddresses = [...new Set(signalRows.map((signal) => signal.tokenAddress))];
    const tokenRows = tokenAddresses.length > 0
      ? await db.select().from(schema.tokens).where(inArray(schema.tokens.address, tokenAddresses))
      : [];
    const tokenByAddress = new Map(tokenRows.map((token) => [token.address, token]));

    return {
      success: true,
      data: rows.map((strategy) => {
        const currentVersion = currentVersionByStrategy.get(`${strategy.id}:${strategy.currentVersion}`);
        return {
        ...strategy,
        currentConfig: currentVersion ? asRecord(currentVersion.config) : {},
        recentMatches: signalRows
          .filter((signal) => signal.strategyId === strategy.id)
          .slice(0, 8)
          .map((signal) => {
            const token = tokenByAddress.get(signal.tokenAddress);
            return {
              id: signal.id,
              tokenAddress: signal.tokenAddress,
              tokenSymbol: token?.symbol || signal.tokenAddress.slice(0, 6),
              tokenName: token?.name || null,
              signalScore: signal.signalScore,
              confidence: Number(signal.confidence),
              priority: signal.priority,
              detectedAt: signal.detectedAt.toISOString(),
            };
          }),
      };
      }),
      requestId: request.id,
      timestamp: new Date().toISOString(),
      dataWindow: serializeRecentWindow(since),
    };
  });

  app.get("/strategies/backtest", { config: { rateLimit: { max: 4, timeWindow: "1 minute" } } }, async (request, reply) => {
    const query = backtestQuerySchema.parse(request.query);
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const since = getRecentWindow(query.sinceDays);
    const strategyRows = await db.select()
      .from(schema.strategies)
      .where(and(
        or(eq(schema.strategies.userId, user.id), isNull(schema.strategies.userId)),
        sql`${schema.strategies.id} <> 'system-market-scan'`,
      ))
      .orderBy(desc(schema.strategies.createdAt));
    const selectedStrategies = query.strategyId
      ? strategyRows.filter((strategy) => strategy.id === query.strategyId)
      : strategyRows;

    if (query.strategyId && selectedStrategies.length === 0) {
      reply.status(404);
      return { success: false, error: "Strategy not found", requestId: request.id, timestamp: new Date().toISOString() };
    }

    const strategyIds = selectedStrategies.map((strategy) => strategy.id);
    const versionRows = strategyIds.length > 0
      ? await db.select().from(schema.strategyVersions).where(inArray(schema.strategyVersions.strategyId, strategyIds))
      : [];
    const versionByStrategy = new Map(versionRows.map((version) => [`${version.strategyId}:${version.version}`, version]));
    const snapshotRows = await db.select({
      tokenAddress: schema.tokenSnapshots.tokenAddress,
      snapshotAt: schema.tokenSnapshots.snapshotAt,
      firstSeenAt: schema.tokens.firstSeenAt,
      priceUsd: schema.tokenSnapshots.priceUsd,
      marketCapUsd: schema.tokenSnapshots.marketCapUsd,
      volume1hUsd: schema.tokenSnapshots.volume1hUsd,
      volume24hUsd: schema.tokenSnapshots.volume24hUsd,
      liquidityUsd: schema.tokenSnapshots.liquidityUsd,
      holderCount: schema.tokenSnapshots.holderCount,
      walletCount: schema.tokenSnapshots.walletCount,
      qualifiedWalletCount: schema.tokenSnapshots.qualifiedWalletCount,
      cohortEntryCount: schema.tokenSnapshots.cohortEntryCount,
      cohortQualityScore: schema.tokenSnapshots.cohortQualityScore,
      walletEvidenceAvailable: schema.tokenSnapshots.walletEvidenceAvailable,
    })
      .from(schema.tokenSnapshots)
      .leftJoin(schema.tokens, eq(schema.tokenSnapshots.tokenAddress, schema.tokens.address))
      .where(gte(schema.tokenSnapshots.snapshotAt, since))
      .orderBy(schema.tokenSnapshots.snapshotAt)
      .limit(20_000);

    const toNumber = (value: string | null) => {
      const parsed = value === null ? NaN : Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const snapshots = snapshotRows.map((snapshot) => ({
      tokenAddress: snapshot.tokenAddress,
      snapshotAt: snapshot.snapshotAt,
      firstSeenAt: snapshot.firstSeenAt,
      priceUsd: toNumber(snapshot.priceUsd),
      marketCapUsd: toNumber(snapshot.marketCapUsd),
      volume1hUsd: toNumber(snapshot.volume1hUsd),
      volume24hUsd: toNumber(snapshot.volume24hUsd),
      liquidityUsd: toNumber(snapshot.liquidityUsd),
      holderCount: snapshot.holderCount,
      walletCount: snapshot.walletCount,
      qualifiedWalletCount: snapshot.qualifiedWalletCount,
      cohortEntryCount: snapshot.cohortEntryCount,
      cohortQualityScore: toNumber(snapshot.cohortQualityScore),
      walletEvidenceAvailable: snapshot.walletEvidenceAvailable,
    }));

    const reviewRows = strategyIds.length > 0
      ? await db.select({
        strategyId: schema.alerts.strategyId,
        verdict: schema.alertReviews.verdict,
      })
        .from(schema.alerts)
        .leftJoin(schema.alertReviews, eq(schema.alertReviews.alertId, schema.alerts.id))
        .where(and(inArray(schema.alerts.strategyId, strategyIds), gte(schema.alerts.triggeredAt, since)))
      : [];
    const reviewEvidenceByStrategy = new Map<string, { totalAlerts: number; reviewedAlerts: number; falsePositives: number }>();
    for (const row of reviewRows) {
      const current = reviewEvidenceByStrategy.get(row.strategyId) ?? { totalAlerts: 0, reviewedAlerts: 0, falsePositives: 0 };
      current.totalAlerts++;
      if (row.verdict !== null) current.reviewedAlerts++;
      if (row.verdict === "false_positive") current.falsePositives++;
      reviewEvidenceByStrategy.set(row.strategyId, current);
    }

    const results = selectedStrategies.map((strategy) => {
      const version = versionByStrategy.get(`${strategy.id}:${strategy.currentVersion}`)
        ?? versionRows.find((candidate) => candidate.strategyId === strategy.id);
      if (!version) {
        return {
          strategyId: strategy.id,
          strategyName: strategy.name,
          error: "No versioned configuration is available for replay.",
        };
      }

      return replayStrategy(toBacktestConfig(strategy, version), snapshots, {
        horizonMinutes: query.horizonMinutes,
        maxEntriesPerToken: query.maxEntriesPerToken,
        reviewEvidence: (() => {
          const evidence = reviewEvidenceByStrategy.get(strategy.id);
          return evidence
            ? {
              totalAlerts: evidence.totalAlerts,
              reviewedAlerts: evidence.reviewedAlerts,
              falsePositiveRate: evidence.reviewedAlerts > 0 ? evidence.falsePositives / evidence.reviewedAlerts : null,
            }
            : undefined;
        })(),
      });
    });

    return {
      success: true,
      data: {
        results,
        snapshotCount: snapshots.length,
        dataWindow: serializeRecentWindow(since),
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/strategies/performance", async (request) => {
    const query = performanceQuerySchema.parse(request.query);
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const since = getRecentWindow(query.sinceDays);
    const strategies = await db.select()
      .from(schema.strategies)
      .where(and(
        or(eq(schema.strategies.userId, user.id), isNull(schema.strategies.userId)),
        sql`${schema.strategies.id} <> 'system-market-scan'`,
      ))
      .orderBy(desc(schema.strategies.createdAt));
    const strategyIds = strategies.map((strategy) => strategy.id);
    const alertRows = strategyIds.length > 0
      ? await db.select({
        id: schema.alerts.id,
        strategyId: schema.alerts.strategyId,
        signalScore: schema.alerts.signalScore,
        triggeredAt: schema.alerts.triggeredAt,
      })
        .from(schema.alerts)
        .innerJoin(schema.signals, eq(schema.alerts.signalId, schema.signals.id))
        .where(and(
          inArray(schema.alerts.strategyId, strategyIds),
          gte(schema.alerts.triggeredAt, since),
          sql`${schema.alerts.status} <> 'superseded'`,
          sql`${schema.signals.metadata} ? 'strategyEvaluation'`,
        ))
      : [];
    const alertIds = alertRows.map((alert) => alert.id);
    const outcomeRows = alertIds.length > 0
      ? await db.select({
        alertId: schema.alertOutcomes.alertId,
        outcomeType: schema.alertOutcomes.outcomeType,
        outcomeValue: schema.alertOutcomes.outcomeValue,
      })
        .from(schema.alertOutcomes)
        .where(inArray(schema.alertOutcomes.alertId, alertIds))
      : [];
    const outcomesByAlert = new Map<string, typeof outcomeRows>();
    for (const outcome of outcomeRows) {
      const outcomes = outcomesByAlert.get(outcome.alertId) ?? [];
      outcomes.push(outcome);
      outcomesByAlert.set(outcome.alertId, outcomes);
    }

    return {
      success: true,
      data: strategies.map((strategy) => {
        const alerts = alertRows.filter((alert) => alert.strategyId === strategy.id);
        const returns: number[] = [];
        const maes: number[] = [];
        const maxReturns: number[] = [];
        const failureClasses = {
          winner: 0,
          no_follow_through: 0,
          deep_drawdown: 0,
          incomplete: 0,
        };

        for (const alert of alerts) {
          const outcomes = outcomesByAlert.get(alert.id) ?? [];
          const return24h = outcomes.find((outcome) => outcome.outcomeType === "return_24h_pct");
          const mae = outcomes.find((outcome) => outcome.outcomeType === "mae_24h_pct");
          const maxReturn = outcomes.find((outcome) => outcome.outcomeType === "max_return_24h_pct");
          const returnValue = return24h?.outcomeValue ? Number(return24h.outcomeValue) : null;
          const maeValue = mae?.outcomeValue ? Number(mae.outcomeValue) : null;
          const maxReturnValue = maxReturn?.outcomeValue ? Number(maxReturn.outcomeValue) : null;

          if (returnValue === null || !Number.isFinite(returnValue)) {
            failureClasses.incomplete++;
          } else {
            returns.push(returnValue);
            if (maeValue !== null && Number.isFinite(maeValue)) maes.push(maeValue);
            if (maxReturnValue !== null && Number.isFinite(maxReturnValue)) maxReturns.push(maxReturnValue);
            if (maeValue !== null && maeValue <= -25) failureClasses.deep_drawdown++;
            else if (returnValue > 0) failureClasses.winner++;
            else failureClasses.no_follow_through++;
          }
        }

        const average = (values: number[]) => values.length > 0
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null;

        return {
          strategyId: strategy.id,
          strategyName: strategy.name,
          signals: alerts.length,
          completed24h: returns.length,
          pending24h: failureClasses.incomplete,
          winRate24h: returns.length > 0 ? returns.filter((value) => value > 0).length / returns.length : null,
          averageReturn24hPct: average(returns),
          averageMae24hPct: average(maes),
          worstMae24hPct: maes.length > 0 ? Math.min(...maes) : null,
          averageMaxReturn24hPct: average(maxReturns),
          failureClasses,
        };
      }),
      requestId: request.id,
      timestamp: new Date().toISOString(),
      dataWindow: serializeRecentWindow(since),
    };
  });

  app.post("/strategies", async (request, reply) => {
    const body = strategySchema.parse(request.body);
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const id = crypto.randomUUID();

    await db.insert(schema.strategies).values({
      id,
      name: body.name,
      description: body.description || null,
      userId: user.id,
      currentVersion: "v0.1.0",
      isActive: body.isActive ? "true" : "false",
    });

    await db.insert(schema.strategyVersions).values({
      id: crypto.randomUUID(),
      strategyId: id,
      version: "v0.1.0",
      isActive: "true",
      config: {
        alertThreshold: body.alertThreshold,
        cooldownMinutes: body.cooldownMinutes,
        conditions: body.conditions,
        priority: body.priority,
        channels: body.channels,
      },
    });

    log.info({ strategyId: id, name: body.name }, "Strategy created");

    reply.status(201);
    return {
      success: true,
      data: { id, ...body },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.get<{ Params: { id: string } }>("/strategies/:id", async (request, reply) => {
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const { id } = request.params;

    const rows = await db.select().from(schema.strategies).where(eq(schema.strategies.id, id)).limit(1);
    const strategy = rows[0];

    if (!strategy || (strategy.userId && strategy.userId !== user.id)) {
      reply.status(404);
      return { success: false, error: "Strategy not found", requestId: request.id, timestamp: new Date().toISOString() };
    }

    const versions = await db.select().from(schema.strategyVersions).where(eq(schema.strategyVersions.strategyId, id));

    return {
      success: true,
      data: { ...strategy, versions },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.patch<{ Params: { id: string } }>("/strategies/:id", async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const { id } = request.params;

    const rows = await db.select().from(schema.strategies).where(eq(schema.strategies.id, id)).limit(1);
    const existing = rows[0];

    if (!existing || (existing.userId && existing.userId !== user.id) || !existing.userId) {
      reply.status(404);
      return { success: false, error: "Strategy not found", requestId: request.id, timestamp: new Date().toISOString() };
    }

    await db.update(schema.strategies)
      .set({
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        isActive: body.isActive !== undefined ? (body.isActive ? "true" : "false") : existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(schema.strategies.id, id));

    if (body.conditions || body.alertThreshold !== undefined || body.priority) {
      await db.insert(schema.strategyVersions).values({
        id: crypto.randomUUID(),
        strategyId: id,
        version: "v0.1.1",
        isActive: "true",
        config: {
          alertThreshold: body.alertThreshold ?? 70,
          cooldownMinutes: body.cooldownMinutes ?? 60,
          conditions: body.conditions ?? [],
          priority: body.priority ?? "medium",
          channels: body.channels ?? ["web"],
        },
      });

      await db.update(schema.strategies)
        .set({ currentVersion: "v0.1.1", updatedAt: new Date() })
        .where(eq(schema.strategies.id, id));
    }

    log.info({ strategyId: id }, "Strategy updated");

    return {
      success: true,
      data: { id, ...body },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.delete<{ Params: { id: string } }>("/strategies/:id", async (request, reply) => {
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const { id } = request.params;

    const rows = await db.select().from(schema.strategies).where(eq(schema.strategies.id, id)).limit(1);
    if (!rows[0] || (rows[0].userId && rows[0].userId !== user.id) || !rows[0].userId) {
      reply.status(404);
      return { success: false, error: "Strategy not found", requestId: request.id, timestamp: new Date().toISOString() };
    }

    await db.update(schema.strategies)
      .set({ isActive: "false", updatedAt: new Date() })
      .where(eq(schema.strategies.id, id));

    log.info({ strategyId: id }, "Strategy deactivated");

    return {
      success: true,
      data: { id, deactivated: true },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
