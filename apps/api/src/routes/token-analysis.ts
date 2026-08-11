import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import {
  enqueueTokenAnalysisJob,
  getLatestTokenAnalysisJob,
  isValidTokenAddress,
} from "@memecoin/indexer";

const paramsSchema = z.object({ address: z.string().min(32).max(44) });

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function serializeJob(job: Awaited<ReturnType<typeof getLatestTokenAnalysisJob>>) {
  return job ? {
    id: job.id,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  } : null;
}

export const tokenAnalysisRoute: FastifyPluginAsync = async (app) => {
  app.post<{ Params: z.infer<typeof paramsSchema> }>("/tokens/:address/analyze", async (request, reply) => {
    const { address } = paramsSchema.parse(request.params);
    if (!isValidTokenAddress(address)) {
      reply.status(400);
      return { success: false, error: "Invalid Solana token address", requestId: request.id };
    }

    const latest = await getLatestTokenAnalysisJob(address);
    if (latest && ["pending", "running", "retrying"].includes(latest.status)) {
      reply.status(202);
      return {
        success: true,
        data: { tokenAddress: address, job: serializeJob(latest), reused: true },
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    }

    const queued = await enqueueTokenAnalysisJob(address, "api");
    reply.status(202);
    return {
      success: true,
      data: { ...queued, reused: false },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.get<{ Params: z.infer<typeof paramsSchema> }>("/tokens/:address/analysis", async (request, reply) => {
    const { address } = paramsSchema.parse(request.params);
    if (!isValidTokenAddress(address)) {
      reply.status(400);
      return { success: false, error: "Invalid Solana token address", requestId: request.id };
    }
    const [tokenRows, latestJob] = await Promise.all([
      getDb().select({ id: schema.tokens.id }).from(schema.tokens)
        .where(eq(schema.tokens.address, address)).limit(1),
      getLatestTokenAnalysisJob(address),
    ]);
    return {
      success: true,
      data: {
        tokenAddress: address,
        tokenIndexed: tokenRows.length > 0,
        job: serializeJob(latestJob),
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.get<{ Params: z.infer<typeof paramsSchema> }>("/tokens/:address/graph", async (request, reply) => {
    const { address } = paramsSchema.parse(request.params);
    const db = getDb();
    const tokenRows = await db.select().from(schema.tokens).where(eq(schema.tokens.address, address)).limit(1);
    const token = tokenRows[0];
    if (!token) {
      reply.status(404);
      return { success: false, error: "Token has not been indexed", requestId: request.id };
    }

    const [latestHolderRows, tradeRows, launchRows, latestJob] = await Promise.all([
      db.select({ snapshotAt: schema.tokenHolderSnapshots.snapshotAt })
        .from(schema.tokenHolderSnapshots)
        .where(eq(schema.tokenHolderSnapshots.tokenAddress, address))
        .orderBy(desc(schema.tokenHolderSnapshots.snapshotAt))
        .limit(1),
      db.select().from(schema.walletTrades)
        .where(eq(schema.walletTrades.tokenAddress, address))
        .orderBy(asc(schema.walletTrades.tradedAt))
        .limit(2_000),
      db.select().from(schema.tokenLaunches)
        .where(eq(schema.tokenLaunches.tokenAddress, address))
        .limit(1),
      getLatestTokenAnalysisJob(address),
    ]);
    const latestHolderAt = latestHolderRows[0]?.snapshotAt;
    const holderRows = latestHolderAt
      ? await db.select().from(schema.tokenHolderSnapshots).where(and(
        eq(schema.tokenHolderSnapshots.tokenAddress, address),
        eq(schema.tokenHolderSnapshots.snapshotAt, latestHolderAt),
      )).orderBy(asc(schema.tokenHolderSnapshots.rank))
      : [];
    const launch = launchRows[0];

    const tradeWalletIds = [...new Set(tradeRows.map((trade) => trade.walletId))];
    const holderWalletIds = [...new Set(holderRows.map((holder) => holder.walletId))];
    const entityWalletIds = [...new Set([...tradeWalletIds, ...holderWalletIds])];
    const [entityWallets, entityPerformance] = await Promise.all([
      entityWalletIds.length > 0
        ? db.select().from(schema.wallets).where(inArray(schema.wallets.id, entityWalletIds))
        : Promise.resolve([]),
      entityWalletIds.length > 0
        ? db.select().from(schema.walletPerformance).where(inArray(schema.walletPerformance.walletId, entityWalletIds))
        : Promise.resolve([]),
    ]);
    const walletById = new Map(entityWallets.map((wallet) => [wallet.id, wallet]));
    const performanceByWallet = new Map<string, typeof entityPerformance[number]>();
    for (const performance of entityPerformance.sort((left, right) => right.calculatedAt.getTime() - left.calculatedAt.getTime())) {
      if (!performanceByWallet.has(performance.walletId)) performanceByWallet.set(performance.walletId, performance);
    }

    const traderByWalletId = new Map<string, {
      walletId: string;
      walletAddress: string;
      buys: number;
      sells: number;
      totalValueSol: number;
      firstBuyAt: Date | null;
      lastTradeAt: Date;
    }>();
    for (const trade of tradeRows) {
      const aggregate = traderByWalletId.get(trade.walletId) ?? {
        walletId: trade.walletId,
        walletAddress: trade.walletAddress,
        buys: 0,
        sells: 0,
        totalValueSol: 0,
        firstBuyAt: null,
        lastTradeAt: trade.tradedAt,
      };
      if (trade.tradeType.toLowerCase().includes("buy")) {
        aggregate.buys++;
        if (!aggregate.firstBuyAt || trade.tradedAt < aggregate.firstBuyAt) aggregate.firstBuyAt = trade.tradedAt;
      } else if (trade.tradeType.toLowerCase().includes("sell")) {
        aggregate.sells++;
      }
      // Wallet history stores the native swap leg in this legacy column.
      aggregate.totalValueSol += Number(trade.valueUsd ?? 0);
      if (trade.tradedAt > aggregate.lastTradeAt) aggregate.lastTradeAt = trade.tradedAt;
      traderByWalletId.set(trade.walletId, aggregate);
    }
    const traders = [...traderByWalletId.values()]
      .sort((left, right) => right.totalValueSol - left.totalValueSol || right.buys - left.buys);
    const serializeTrader = (trader: typeof traders[number]) => {
      const wallet = walletById.get(trader.walletId);
      const performance = performanceByWallet.get(trader.walletId);
      return {
        ...trader,
        firstBuyAt: trader.firstBuyAt?.toISOString() ?? null,
        lastTradeAt: trader.lastTradeAt.toISOString(),
        delayFromLaunchSeconds: launch && trader.firstBuyAt
          ? Math.max(0, Math.round((trader.firstBuyAt.getTime() - launch.launchedAt.getTime()) / 1_000))
          : null,
        classification: wallet?.classification ?? "unknown",
        walletScore: performance?.score ?? null,
        winRate: performance?.winRate ? Number(performance.winRate) : null,
        totalPnlUsd: performance?.totalPnlUsd ? Number(performance.totalPnlUsd) : null,
      };
    };
    const topTraders = traders.slice(0, 25).map(serializeTrader);
    const earliestObservedBuyers = traders
      .filter((trader) => trader.firstBuyAt)
      .sort((left, right) => left.firstBuyAt!.getTime() - right.firstBuyAt!.getTime())
      .slice(0, 25)
      .map(serializeTrader);

    const holders = holderRows.map((holder) => {
      const wallet = walletById.get(holder.walletId);
      const performance = performanceByWallet.get(holder.walletId);
      return {
        rank: holder.rank,
        walletId: holder.walletId,
        walletAddress: holder.walletAddress,
        balance: holder.balance,
        percentage: holder.percentage ? Number(holder.percentage) : null,
        classification: wallet?.classification ?? "unknown",
        walletScore: performance?.score ?? null,
        totalPnlUsd: performance?.totalPnlUsd ? Number(performance.totalPnlUsd) : null,
        source: holder.source,
        snapshotAt: holder.snapshotAt.toISOString(),
      };
    });

    const seedWalletIds = [...new Set([
      ...holders.slice(0, 12).map((holder) => holder.walletId),
      ...topTraders.slice(0, 12).map((trader) => trader.walletId),
    ])];
    const firstHop = seedWalletIds.length > 0
      ? await db.select().from(schema.walletRelationships).where(or(
        inArray(schema.walletRelationships.walletAId, seedWalletIds),
        inArray(schema.walletRelationships.walletBId, seedWalletIds),
      )).limit(500)
      : [];
    const connectedIds = [...new Set(firstHop.flatMap((relationship) => [
      relationship.walletAId,
      relationship.walletBId,
    ]))];
    const secondHop = connectedIds.length > 0
      ? await db.select().from(schema.walletRelationships).where(or(
        inArray(schema.walletRelationships.walletAId, connectedIds),
        inArray(schema.walletRelationships.walletBId, connectedIds),
      )).limit(500)
      : [];
    const relationshipById = new Map([...firstHop, ...secondHop].map((relationship) => [relationship.id, relationship]));
    const relationships = [...relationshipById.values()];
    const graphWalletIds = [...new Set([
      ...seedWalletIds,
      ...relationships.flatMap((relationship) => [
        relationship.walletAId,
        relationship.walletBId,
      ]),
    ])];
    const [graphWallets, graphPerformance] = await Promise.all([
      graphWalletIds.length > 0
        ? db.select().from(schema.wallets).where(inArray(schema.wallets.id, graphWalletIds))
        : Promise.resolve([]),
      graphWalletIds.length > 0
        ? db.select().from(schema.walletPerformance).where(inArray(schema.walletPerformance.walletId, graphWalletIds))
        : Promise.resolve([]),
    ]);
    const graphPerformanceByWallet = new Map<string, typeof graphPerformance[number]>();
    for (const performance of graphPerformance.sort((left, right) => right.calculatedAt.getTime() - left.calculatedAt.getTime())) {
      if (!graphPerformanceByWallet.has(performance.walletId)) graphPerformanceByWallet.set(performance.walletId, performance);
    }

    const relatedLaunches = launch?.deployerAddress
      ? await db.select({
        tokenAddress: schema.tokenLaunches.tokenAddress,
        launchedAt: schema.tokenLaunches.launchedAt,
        launchProgram: schema.tokenLaunches.launchProgram,
      }).from(schema.tokenLaunches)
        .where(eq(schema.tokenLaunches.deployerAddress, launch.deployerAddress))
        .orderBy(desc(schema.tokenLaunches.launchedAt))
        .limit(50)
      : [];
    const relatedTokens = relatedLaunches.length > 0
      ? await db.select({ address: schema.tokens.address, symbol: schema.tokens.symbol, name: schema.tokens.name })
        .from(schema.tokens)
        .where(inArray(schema.tokens.address, relatedLaunches.map((item) => item.tokenAddress)))
      : [];
    const relatedTokenByAddress = new Map(relatedTokens.map((item) => [item.address, item]));

    const latestResult = asRecord(latestJob?.result);
    const coverage = asRecord(latestResult.coverage);
    return {
      success: true,
      data: {
        tokenAddress: address,
        analysisVersion: typeof latestResult.analysisVersion === "string" ? latestResult.analysisVersion : null,
        analysisJob: serializeJob(latestJob),
        coverage: {
          holders: typeof coverage.holders === "string" ? coverage.holders : (holders.length ? "top_20" : "unavailable"),
          buyers: typeof coverage.buyers === "string" ? coverage.buyers : (tradeRows.length ? "indexed_and_observed" : "unavailable"),
          relationships: typeof coverage.relationships === "string"
            ? coverage.relationships
            : relationships.length ? "persisted_evidence" : "unavailable",
          funding: typeof coverage.funding === "string" ? coverage.funding : "unavailable",
        },
        holders,
        topTraders,
        earliestObservedBuyers,
        graph: {
          nodes: graphWallets.map((wallet) => {
            const performance = graphPerformanceByWallet.get(wallet.id);
            return {
              id: wallet.id,
              address: wallet.address,
              label: wallet.label,
              classification: wallet.classification,
              score: performance?.score ?? null,
              pnlUsd: performance?.totalPnlUsd ? Number(performance.totalPnlUsd) : null,
              isSeed: seedWalletIds.includes(wallet.id),
            };
          }),
          edges: relationships.map((relationship) => ({
            id: relationship.id,
            source: relationship.walletAId,
            target: relationship.walletBId,
            type: relationship.relationshipType,
            confidence: Number(relationship.confidence),
            evidence: relationship.evidence,
            detectedAt: relationship.detectedAt.toISOString(),
          })),
        },
        deploymentCircle: {
          deployerAddress: launch?.deployerAddress ?? null,
          launches: relatedLaunches.map((item) => ({
            ...item,
            symbol: relatedTokenByAddress.get(item.tokenAddress)?.symbol ?? item.tokenAddress.slice(0, 6),
            name: relatedTokenByAddress.get(item.tokenAddress)?.name ?? "Unknown token",
            launchedAt: item.launchedAt.toISOString(),
          })),
          repeatEarlyBuyerCount: relationships.filter((relationship) => (
            relationship.relationshipType === "deployer_circle"
            && asRecord(relationship.evidence).deployerAddress === launch?.deployerAddress
          )).length,
        },
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
