import type { FastifyPluginAsync } from "fastify";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { sql } from "drizzle-orm";
import {
  createAlertDeliveryQueue,
  createRawEventProcessingQueue,
  createWalletSyncQueue,
  getQueueStats,
} from "@memecoin/queue";

export const statusRoute: FastifyPluginAsync = async (app) => {
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
        queueStats,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(schema.tokens),
        db.select({ count: sql<number>`count(*)` }).from(schema.signals),
        db.select({ count: sql<number>`count(*)` }).from(schema.alerts),
        db.select({ count: sql<number>`count(*)` }).from(schema.wallets),
        db.select({ count: sql<number>`count(*)` }).from(schema.backgroundJobs),
        Promise.all([
          getQueueStats(rawEventQueue),
          getQueueStats(alertQueue),
          getQueueStats(walletQueue),
        ]),
      ]);

      return {
        success: true,
        data: {
          tokens: Number(tokenCount[0]?.count || 0),
          signals: Number(signalCount[0]?.count || 0),
          alerts: Number(alertCount[0]?.count || 0),
          wallets: Number(walletCount[0]?.count || 0),
          backgroundJobs: Number(backgroundJobCount[0]?.count || 0),
          environment: process.env.NODE_ENV || "development",
          version: "0.1.0",
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
