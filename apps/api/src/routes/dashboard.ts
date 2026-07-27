import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { resolveSourceMetadata } from "./source-metadata.js";

const querySchema = z.object({
  signalLimit: z.coerce.number().min(1).max(10).default(5),
  alertLimit: z.coerce.number().min(1).max(10).default(5),
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

    const [
      tokenCount,
      signalCount,
      alertStatusRows,
      walletCount,
      rawEventStatusRows,
      deliveryStatusRows,
      processingFailureRows,
      recentSignals,
      recentAlertRows,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(schema.tokens),
      db.select({ count: sql<number>`count(*)` }).from(schema.signals),
      db.select({
        id: schema.alerts.id,
        status: schema.alerts.status,
      }).from(schema.alerts),
      db.select({ count: sql<number>`count(*)` }).from(schema.wallets),
      db.select({
        id: schema.rawProviderEvents.id,
        processingStatus: schema.rawProviderEvents.processingStatus,
      }).from(schema.rawProviderEvents),
      db.select({
        id: schema.alertDeliveries.id,
        status: schema.alertDeliveries.status,
      }).from(schema.alertDeliveries),
      db.select({
        id: schema.processingFailures.id,
        isResolved: schema.processingFailures.isResolved,
      }).from(schema.processingFailures),
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
        .orderBy(desc(schema.alerts.triggeredAt))
        .limit(query.alertLimit),
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
          .where(inArray(schema.tokenSnapshots.tokenAddress, tokenAddresses))
          .orderBy(desc(schema.tokenSnapshots.snapshotAt)),
        db.select({
          tokenAddress: schema.tokenLaunches.tokenAddress,
          launchedAt: schema.tokenLaunches.launchedAt,
          metadata: schema.tokenLaunches.metadata,
        })
          .from(schema.tokenLaunches)
          .where(inArray(schema.tokenLaunches.tokenAddress, tokenAddresses))
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
          alerts: alertStatusRows.length,
          wallets: Number(walletCount[0]?.count || 0),
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
          version: "0.1.0",
          dataSourceSummary: summarizeSources([...dashboardSignals, ...dashboardAlerts]),
        },
        recentSignals: dashboardSignals,
        recentAlerts: dashboardAlerts,
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
