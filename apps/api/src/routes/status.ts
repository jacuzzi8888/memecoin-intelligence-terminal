import type { FastifyPluginAsync } from "fastify";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { sql } from "drizzle-orm";

export const statusRoute: FastifyPluginAsync = async (app) => {
  app.get("/status", async (request, reply) => {
    try {
      const db = getDb();

      const tokenCount = await db.select({ count: sql<number>`count(*)` }).from(schema.tokens);
      const signalCount = await db.select({ count: sql<number>`count(*)` }).from(schema.signals);
      const alertCount = await db.select({ count: sql<number>`count(*)` }).from(schema.alerts);
      const walletCount = await db.select({ count: sql<number>`count(*)` }).from(schema.wallets);

      return {
        success: true,
        data: {
          tokens: Number(tokenCount[0]?.count || 0),
          signals: Number(signalCount[0]?.count || 0),
          alerts: Number(alertCount[0]?.count || 0),
          wallets: Number(walletCount[0]?.count || 0),
          environment: process.env.NODE_ENV || "development",
          version: "0.1.0",
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
