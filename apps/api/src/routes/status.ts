import type { FastifyPluginAsync } from "fastify";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { eq, sql } from "drizzle-orm";
import {
  createAlertDeliveryQueue,
  createRawEventProcessingQueue,
  createWalletSyncQueue,
  getQueueStats,
} from "@memecoin/queue";

export const statusRoute: FastifyPluginAsync = async (app) => {
  app.post("/access/verify", async (request) => ({
    success: true,
    data: { unlocked: true },
    requestId: request.id,
    timestamp: new Date().toISOString(),
  }));

  app.get("/status", async (request, reply) => {
    try {
      const db = getDb();

      const rawEventQueue = createRawEventProcessingQueue();
      const alertQueue = createAlertDeliveryQueue();
      const walletQueue = createWalletSyncQueue();

      const [
        tokenCount,
        signalCount,
        alertCount,
        walletCount,
        backgroundJobCount,
        pendingAlertCount,
        latestSnapshot,
        latestSignal,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(schema.tokens),
        db.select({ count: sql<number>`count(*)` }).from(schema.signals),
        db.select({ count: sql<number>`count(*)` }).from(schema.alerts),
        db.select({ count: sql<number>`count(*)` }).from(schema.wallets),
        db.select({ count: sql<number>`count(*)` }).from(schema.backgroundJobs),
        db.select({ count: sql<number>`count(*)` }).from(schema.alerts).where(eq(schema.alerts.status, "pending")),
        db.select({ latest: sql<Date | null>`max(${schema.tokenSnapshots.snapshotAt})` }).from(schema.tokenSnapshots),
        db.select({ latest: sql<Date | null>`max(${schema.signals.detectedAt})` }).from(schema.signals),
      ]);

      const unavailableQueue = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, deadLetter: 0, available: false };
      const queueStats = await Promise.all([
        getQueueStats(rawEventQueue),
        getQueueStats(alertQueue),
        getQueueStats(walletQueue),
      ]).then((stats) => stats.map((stat) => ({ ...stat, available: true }))).catch(() => [
        unavailableQueue,
        unavailableQueue,
        unavailableQueue,
      ]);

      return {
        success: true,
        data: {
          tokens: Number(tokenCount[0]?.count || 0),
          signals: Number(signalCount[0]?.count || 0),
          alerts: Number(alertCount[0]?.count || 0),
          pendingAlerts: Number(pendingAlertCount[0]?.count || 0),
          wallets: Number(walletCount[0]?.count || 0),
          backgroundJobs: Number(backgroundJobCount[0]?.count || 0),
          environment: process.env.NODE_ENV || "development",
          version: "0.2.0",
          dataFreshness: {
            latestSnapshotAt: latestSnapshot[0]?.latest?.toISOString?.() ?? latestSnapshot[0]?.latest ?? null,
            latestSignalAt: latestSignal[0]?.latest?.toISOString?.() ?? latestSignal[0]?.latest ?? null,
          },
          queues: {
            rawEventProcessing: queueStats[0],
            alertDelivery: queueStats[1],
            walletSync: queueStats[2],
          },
        },
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      reply.status(500);
      return {
        success: false,
        error: "Failed to fetch status",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    }
  });
};
