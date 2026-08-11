import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { and, eq, desc, gte, inArray } from "drizzle-orm";
import { resolveSourceMetadata } from "./source-metadata.js";
import { getRecentWindow, serializeRecentWindow } from "./recent-window.js";

const paramsSchema = z.object({
  address: z.string().min(32).max(44),
});

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export const tokenRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Params: z.infer<typeof paramsSchema> }>("/tokens/:address", async (request, reply) => {
    const { address } = paramsSchema.parse(request.params);
    const db = getDb();
    const since = getRecentWindow();

    const tokenRows = await db.select().from(schema.tokens).where(eq(schema.tokens.address, address)).limit(1);
    const token = tokenRows[0];

    if (!token) {
      reply.status(404);
      return { success: false, error: "Token not found", requestId: request.id, timestamp: new Date().toISOString() };
    }

    const [snapshotRows, chartRows, launchRows, signalRows, tradeRows, eventRows, alertRows] = await Promise.all([
      db.select().from(schema.tokenSnapshots).where(and(eq(schema.tokenSnapshots.tokenAddress, address), gte(schema.tokenSnapshots.snapshotAt, since))).orderBy(desc(schema.tokenSnapshots.snapshotAt)).limit(1),
      db.select().from(schema.tokenSnapshots).where(and(eq(schema.tokenSnapshots.tokenAddress, address), gte(schema.tokenSnapshots.snapshotAt, since))).orderBy(desc(schema.tokenSnapshots.snapshotAt)).limit(48),
      db.select().from(schema.tokenLaunches).where(eq(schema.tokenLaunches.tokenAddress, address)).limit(1),
      db.select().from(schema.signals).where(and(eq(schema.signals.tokenAddress, address), gte(schema.signals.detectedAt, since))).orderBy(desc(schema.signals.detectedAt)).limit(5),
      db.select().from(schema.walletTrades).where(and(eq(schema.walletTrades.tokenAddress, address), gte(schema.walletTrades.tradedAt, since))).orderBy(desc(schema.walletTrades.tradedAt)).limit(25),
      db.select().from(schema.normalisedTokenEvents).where(and(eq(schema.normalisedTokenEvents.tokenAddress, address), gte(schema.normalisedTokenEvents.createdAt, since))).orderBy(desc(schema.normalisedTokenEvents.createdAt)).limit(20),
      db.select().from(schema.alerts).where(and(eq(schema.alerts.tokenAddress, address), gte(schema.alerts.triggeredAt, since))).orderBy(desc(schema.alerts.triggeredAt)).limit(10),
    ]);

    const snapshot = snapshotRows[0];
    const launch = launchRows[0];
    const tradeWalletIds = [...new Set(tradeRows.map((trade) => trade.walletId))];
    const tradeWallets = tradeWalletIds.length > 0
      ? await db.select().from(schema.wallets).where(inArray(schema.wallets.id, tradeWalletIds))
      : [];
    const tradeWalletPerformance = tradeWalletIds.length > 0
      ? await db.select().from(schema.walletPerformance).where(inArray(schema.walletPerformance.walletId, tradeWalletIds))
      : [];
    const walletById = new Map(tradeWallets.map((wallet) => [wallet.id, wallet]));
    const latestPerformanceByWallet = new Map<string, typeof tradeWalletPerformance[number]>();
    for (const performance of tradeWalletPerformance.sort((a, b) => b.calculatedAt.getTime() - a.calculatedAt.getTime())) {
      if (!latestPerformanceByWallet.has(performance.walletId)) {
        latestPerformanceByWallet.set(performance.walletId, performance);
      }
    }

    const walletEvidenceSummary = {
      tradeCount: tradeRows.length,
      walletCount: new Set(tradeRows.map((trade) => trade.walletAddress)).size,
      qualifiedWalletCount: 0,
      latestTradeAt: tradeRows[0]?.tradedAt.toISOString() ?? null,
    };
    for (const wallet of tradeWallets) {
      const metadata = asRecord(wallet.metadata);
      const qualification = asRecord(metadata.qualification);
      const performance = latestPerformanceByWallet.get(wallet.id);
      if (qualification.isQualified === true || (performance?.score ?? 0) >= 60) {
        walletEvidenceSummary.qualifiedWalletCount += 1;
      }
    }

    const factors = signalRows.length > 0
      ? await db.select().from(schema.signalFactors).where(eq(schema.signalFactors.signalId, signalRows[0]!.id))
      : [];

    const positiveFactors = factors.filter(f => f.factorType === "positive").map(f => ({
      factorName: f.factorName,
      rawValue: f.rawValue,
      contribution: Number(f.contribution),
    }));

    const negativeFactors = factors.filter(f => f.factorType === "negative").map(f => ({
      factorName: f.factorName,
      rawValue: f.rawValue,
      contribution: Number(f.contribution),
    }));

    const latestSignal = signalRows[0];
    const sourceMetadata = resolveSourceMetadata({
      signalMetadata: latestSignal?.metadata,
      launchMetadata: launch?.metadata,
      snapshotAt: snapshot?.snapshotAt,
      detectedAt: latestSignal?.detectedAt,
      launchedAt: launch?.launchedAt,
      firstSeenAt: token.firstSeenAt,
    });

    return {
      success: true,
      data: {
        token: {
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          isVerified: token.isVerified,
          firstSeenAt: token.firstSeenAt?.toISOString(),
        },
        market: snapshot ? {
          marketCapUsd: Number(snapshot.marketCapUsd || 0),
          priceUsd: Number(snapshot.priceUsd || 0),
          volume1hUsd: Number(snapshot.volume1hUsd || 0),
          volume24hUsd: Number(snapshot.volume24hUsd || 0),
          liquidityUsd: Number(snapshot.liquidityUsd || 0),
          holderCount: snapshot.holderCount,
          priceChange1h: Number(snapshot.priceChange1h || 0),
          priceChange24h: Number(snapshot.priceChange24h || 0),
          snapshotAt: snapshot.snapshotAt.toISOString(),
        } : null,
        launch: launch ? {
          deployerAddress: launch.deployerAddress,
          launchedAt: launch.launchedAt.toISOString(),
          initialLiquidityUsd: Number(launch.initialLiquidityUsd || 0),
          launchProgram: launch.launchProgram,
        } : null,
        intelligence: latestSignal ? {
          score: latestSignal.signalScore,
          confidence: Number(latestSignal.confidence),
          rulesetVersion: latestSignal.rulesetVersion,
          priority: latestSignal.priority,
          positiveFactors,
          negativeFactors,
          detectedAt: latestSignal.detectedAt?.toISOString(),
        } : null,
        chart: chartRows
          .sort((a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime())
          .map((point) => ({
            marketCapUsd: Number(point.marketCapUsd || 0),
            priceUsd: Number(point.priceUsd || 0),
            volume1hUsd: Number(point.volume1hUsd || 0),
            volume24hUsd: Number(point.volume24hUsd || 0),
            liquidityUsd: Number(point.liquidityUsd || 0),
            holderCount: point.holderCount,
            priceChange1h: Number(point.priceChange1h || 0),
            priceChange24h: Number(point.priceChange24h || 0),
            snapshotAt: point.snapshotAt.toISOString(),
          })),
        walletEvidence: tradeRows.map((trade) => {
          const wallet = walletById.get(trade.walletId);
          const performance = latestPerformanceByWallet.get(trade.walletId);
          const metadata = asRecord(wallet?.metadata);
          const qualification = asRecord(metadata.qualification);
          const isQualified = qualification.isQualified === true || (performance?.score ?? 0) >= 60;
          return {
            id: trade.id,
            walletAddress: trade.walletAddress,
            walletLabel: wallet?.label || wallet?.classification || null,
            walletClassification: wallet?.classification || "unknown",
            isQualified,
            walletScore: performance?.score ?? (typeof qualification.walletScore === "number" ? qualification.walletScore : null),
            winRate: performance?.winRate ? Number(performance.winRate) : null,
            totalPnlUsd: performance?.totalPnlUsd ? Number(performance.totalPnlUsd) : null,
            qualificationReasons: Array.isArray(qualification.reasons) ? qualification.reasons : [],
            tradeType: trade.tradeType,
            amount: Number(trade.amount),
            priceUsd: trade.priceUsd ? Number(trade.priceUsd) : null,
            // Wallet ingestion stores the native SOL leg in this legacy database column.
            valueSol: trade.valueUsd ? Number(trade.valueUsd) : null,
            txSignature: trade.txSignature,
            tradedAt: trade.tradedAt.toISOString(),
          };
        }),
        walletEvidenceSummary,
        relatedAlerts: alertRows.map((alert) => ({
          id: alert.id,
          title: alert.title,
          message: alert.message,
          priority: alert.priority,
          status: alert.status,
          signalScore: alert.signalScore,
          triggeredAt: alert.triggeredAt.toISOString(),
        })),
        timeline: [
          ...signalRows.map((signal) => ({
            id: signal.id,
            type: "signal",
            title: `Signal score ${signal.signalScore}`,
            detail: `${signal.priority} priority via ${signal.rulesetVersion}`,
            occurredAt: signal.detectedAt.toISOString(),
          })),
          ...alertRows.map((alert) => ({
            id: alert.id,
            type: "alert",
            title: alert.title,
            detail: alert.message,
            occurredAt: alert.triggeredAt.toISOString(),
          })),
          ...tradeRows.slice(0, 10).map((trade) => ({
            id: trade.id,
            type: "wallet_trade",
            title: `${trade.tradeType} ${Number(trade.amount).toLocaleString()}`,
            detail: `${trade.walletAddress.slice(0, 8)}...${trade.walletAddress.slice(-4)} ${trade.valueUsd ? `${Number(trade.valueUsd).toLocaleString()} SOL` : ""}`.trim(),
            occurredAt: trade.tradedAt.toISOString(),
          })),
          ...eventRows.map((event) => ({
            id: event.id,
            type: event.eventType,
            title: event.eventSubtype || event.eventType,
            detail: event.txSignature || "Normalised token event",
            occurredAt: (event.blockTime || event.createdAt).toISOString(),
          })),
        ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 30),
        dataSource: sourceMetadata.dataSource,
        dataFreshness: sourceMetadata.dataFreshness,
        dataWindow: serializeRecentWindow(since),
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
