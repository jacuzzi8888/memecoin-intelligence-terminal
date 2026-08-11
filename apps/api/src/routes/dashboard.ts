import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { resolveSourceMetadata } from "./source-metadata.js";
import { getRecentWindow, serializeRecentWindow } from "./recent-window.js";
import { isValidSolanaWalletAddress } from "./solana-address.js";

const MARKET_OBSERVATION_STRATEGY_ID = "system-market-scan";

const querySchema = z.object({
  signalLimit: z.coerce.number().min(1).max(10).default(5),
  alertLimit: z.coerce.number().min(1).max(10).default(5),
  sinceDays: z.coerce.number().min(1).max(30).default(1),
});

function summarizeSources(items: Array<{ dataSource?: string }>) {
  const unique = [...new Set(items.map((item) => item.dataSource).filter(Boolean))];

  if (unique.length === 0) {
    return "No live metadata yet";
  }

  if (unique.length === 1) {
    return unique[0]!;
  }

  if (unique.length === 2) {
    return `${unique[0]}, ${unique[1]}`;
  }

  return `${unique[0]}, ${unique[1]} +${unique.length - 2} more`;
}

export const dashboardRoute: FastifyPluginAsync = async (app) => {
  app.get("/dashboard", async (request) => {
    const query = querySchema.parse(request.query);
    const db = getDb();
    const since = getRecentWindow(query.sinceDays);

    const [
      tokenCount,
      signalCount,
      alertStatusRows,
      walletRows,
      rawEventStatusRows,
      deliveryStatusRows,
      processingFailureRows,
      recentSignals,
      recentAlertRows,
      recentWalletTrades,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(schema.tokens).where(or(gte(schema.tokens.firstSeenAt, since), gte(schema.tokens.createdAt, since))),
      db.select({ count: sql<number>`count(distinct ${schema.signals.tokenAddress})` })
        .from(schema.signals)
        .where(and(gte(schema.signals.detectedAt, since), eq(schema.signals.strategyId, MARKET_OBSERVATION_STRATEGY_ID))),
      db.select({
        id: schema.alerts.id,
        status: schema.alerts.status,
      }).from(schema.alerts).where(and(
        gte(schema.alerts.triggeredAt, since),
        sql`${schema.alerts.status} <> 'superseded'`,
      )),
      db.select({
        address: schema.wallets.address,
      }).from(schema.wallets).where(or(gte(schema.wallets.lastSeenAt, since), gte(schema.wallets.createdAt, since))),
      db.select({
        id: schema.rawProviderEvents.id,
        processingStatus: schema.rawProviderEvents.processingStatus,
      }).from(schema.rawProviderEvents).where(gte(schema.rawProviderEvents.ingestAt, since)),
      db.select({
        id: schema.alertDeliveries.id,
        status: schema.alertDeliveries.status,
      }).from(schema.alertDeliveries).where(gte(schema.alertDeliveries.createdAt, since)),
      db.select({
        id: schema.processingFailures.id,
        isResolved: schema.processingFailures.isResolved,
      }).from(schema.processingFailures).where(gte(schema.processingFailures.createdAt, since)),
      db.select({
        id: schema.signals.id,
        tokenAddress: schema.signals.tokenAddress,
        signalScore: schema.signals.signalScore,
        confidence: schema.signals.confidence,
        priority: schema.signals.priority,
        rulesetVersion: schema.signals.rulesetVersion,
        metadata: schema.signals.metadata,
        detectedAt: schema.signals.detectedAt,
        tokenSymbol: schema.tokens.symbol,
        tokenName: schema.tokens.name,
        tokenFirstSeenAt: schema.tokens.firstSeenAt,
      })
        .from(schema.signals)
        .leftJoin(schema.tokens, sql`${schema.signals.tokenAddress} = ${schema.tokens.address}`)
        .where(and(
          gte(schema.signals.detectedAt, since),
          eq(schema.signals.strategyId, MARKET_OBSERVATION_STRATEGY_ID),
        ))
        .orderBy(desc(schema.signals.detectedAt))
        .limit(query.signalLimit),
      db.select({
        id: schema.alerts.id,
        tokenAddress: schema.alerts.tokenAddress,
        priority: schema.alerts.priority,
        title: schema.alerts.title,
        message: schema.alerts.message,
        signalScore: schema.alerts.signalScore,
        webDeepLink: schema.alerts.webDeepLink,
        telegramDeepLink: schema.alerts.telegramDeepLink,
        status: schema.alerts.status,
        triggeredAt: schema.alerts.triggeredAt,
        strategyName: schema.strategies.name,
        signalMetadata: schema.signals.metadata,
        detectedAt: schema.signals.detectedAt,
        tokenFirstSeenAt: schema.tokens.firstSeenAt,
      })
        .from(schema.alerts)
        .leftJoin(schema.strategies, eq(schema.alerts.strategyId, schema.strategies.id))
        .leftJoin(schema.signals, eq(schema.alerts.signalId, schema.signals.id))
        .leftJoin(schema.tokens, eq(schema.alerts.tokenAddress, schema.tokens.address))
        .where(and(
          gte(schema.alerts.triggeredAt, since),
          sql`${schema.alerts.status} <> 'superseded'`,
        ))
        .orderBy(desc(schema.alerts.triggeredAt))
        .limit(query.alertLimit),
      db.select({
        id: schema.walletTrades.id,
        walletAddress: schema.walletTrades.walletAddress,
        tokenAddress: schema.walletTrades.tokenAddress,
        tradeType: schema.walletTrades.tradeType,
        amount: schema.walletTrades.amount,
        valueSol: schema.walletTrades.valueUsd,
        tradedAt: schema.walletTrades.tradedAt,
        tokenSymbol: schema.tokens.symbol,
      })
        .from(schema.walletTrades)
        .leftJoin(schema.tokens, eq(schema.walletTrades.tokenAddress, schema.tokens.address))
        .where(gte(schema.walletTrades.tradedAt, since))
        .orderBy(desc(schema.walletTrades.tradedAt))
        .limit(5),
    ]);

    const tokenAddresses = [...new Set([
      ...recentSignals.map((signal) => signal.tokenAddress),
      ...recentAlertRows.map((alert) => alert.tokenAddress),
    ])];

    const [snapshotRows, launchRows] = tokenAddresses.length > 0
      ? await Promise.all([
        db.select({
          tokenAddress: schema.tokenSnapshots.tokenAddress,
          snapshotAt: schema.tokenSnapshots.snapshotAt,
        })
          .from(schema.tokenSnapshots)
          .where(and(inArray(schema.tokenSnapshots.tokenAddress, tokenAddresses), gte(schema.tokenSnapshots.snapshotAt, since)))
          .orderBy(desc(schema.tokenSnapshots.snapshotAt)),
        db.select({
          tokenAddress: schema.tokenLaunches.tokenAddress,
          launchedAt: schema.tokenLaunches.launchedAt,
          metadata: schema.tokenLaunches.metadata,
        })
          .from(schema.tokenLaunches)
          .where(and(inArray(schema.tokenLaunches.tokenAddress, tokenAddresses), gte(schema.tokenLaunches.launchedAt, since)))
          .orderBy(desc(schema.tokenLaunches.launchedAt)),
      ])
      : [[], []];

    const snapshotByToken = new Map<string, { snapshotAt: Date }>();
    for (const snapshot of snapshotRows) {
      if (!snapshotByToken.has(snapshot.tokenAddress)) {
        snapshotByToken.set(snapshot.tokenAddress, snapshot);
      }
    }

    const launchByToken = new Map<string, { launchedAt: Date; metadata: unknown }>();
    for (const launch of launchRows) {
      if (!launchByToken.has(launch.tokenAddress)) {
        launchByToken.set(launch.tokenAddress, launch);
      }
    }

    const dashboardSignals = recentSignals.map((signal) => ({
      ...resolveSourceMetadata({
        signalMetadata: signal.metadata,
        launchMetadata: launchByToken.get(signal.tokenAddress)?.metadata,
        snapshotAt: snapshotByToken.get(signal.tokenAddress)?.snapshotAt,
        detectedAt: signal.detectedAt,
        launchedAt: launchByToken.get(signal.tokenAddress)?.launchedAt,
        firstSeenAt: signal.tokenFirstSeenAt,
      }),
      id: signal.id,
      tokenAddress: signal.tokenAddress,
      tokenSymbol: signal.tokenSymbol || "UNKNOWN",
      tokenName: signal.tokenName || "Unknown Token",
      signalScore: signal.signalScore,
      confidence: Number(signal.confidence),
      priority: signal.priority,
      rulesetVersion: signal.rulesetVersion,
      detectedAt: signal.detectedAt?.toISOString() || new Date().toISOString(),
    }));

    const dashboardAlerts = recentAlertRows.map((alert) => ({
      ...resolveSourceMetadata({
        signalMetadata: alert.signalMetadata,
        launchMetadata: launchByToken.get(alert.tokenAddress)?.metadata,
        snapshotAt: snapshotByToken.get(alert.tokenAddress)?.snapshotAt,
        detectedAt: alert.detectedAt,
        launchedAt: launchByToken.get(alert.tokenAddress)?.launchedAt,
        firstSeenAt: alert.tokenFirstSeenAt,
      }),
      id: alert.id,
      tokenAddress: alert.tokenAddress,
      priority: alert.priority,
      title: alert.title,
      message: alert.message,
      signalScore: alert.signalScore,
      strategyName: alert.strategyName || "Unknown",
      webDeepLink: alert.webDeepLink,
      telegramDeepLink: alert.telegramDeepLink,
      status: alert.status,
      triggeredAt: alert.triggeredAt?.toISOString() || new Date().toISOString(),
    }));

    return {
      success: true,
      data: {
        overview: {
          tokens: Number(tokenCount[0]?.count || 0),
          signals: Number(signalCount[0]?.count || 0),
          alerts: alertStatusRows.filter((row) => row.status === "pending").length,
          wallets: walletRows.filter((wallet) => isValidSolanaWalletAddress(wallet.address)).length,
        },
        pipeline: {
          rawEventsPending: rawEventStatusRows.filter((row) => row.processingStatus === "pending").length,
          rawEventsFailed: rawEventStatusRows.filter((row) => row.processingStatus === "failed").length,
          alertsPending: alertStatusRows.filter((row) => row.status === "pending").length,
          alertsDelivered: alertStatusRows.filter((row) => row.status === "delivered").length,
          deliveriesDelivered: deliveryStatusRows.filter((row) => row.status === "delivered").length,
          deliveriesFailed: deliveryStatusRows.filter((row) => row.status === "failed").length,
          failuresOpen: processingFailureRows.filter((row) => row.isResolved !== "true").length,
        },
        system: {
          environment: process.env.NODE_ENV || "development",
          version: "0.2.0",
          dataSourceSummary: summarizeSources([...dashboardSignals, ...dashboardAlerts]),
        },
        recentSignals: dashboardSignals,
        recentAlerts: dashboardAlerts,
        recentWalletTrades: recentWalletTrades.map((trade) => ({
          id: trade.id,
          walletAddress: trade.walletAddress,
          tokenAddress: trade.tokenAddress,
          tokenSymbol: trade.tokenSymbol || trade.tokenAddress.slice(0, 6),
          tradeType: trade.tradeType,
          amount: trade.amount,
          valueSol: trade.valueSol,
          tradedAt: trade.tradedAt.toISOString(),
        })),
        dataWindow: serializeRecentWindow(since),
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
