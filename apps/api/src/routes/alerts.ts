import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { desc, eq } from "drizzle-orm";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(20),
});

export const alertsRoute: FastifyPluginAsync = async (app) => {
  app.get("/alerts", async (request) => {
    const query = querySchema.parse(request.query);
    const db = getDb();

    const alertRows = await db.select({
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
    })
      .from(schema.alerts)
      .leftJoin(schema.strategies, eq(schema.alerts.strategyId, schema.strategies.id))
      .orderBy(desc(schema.alerts.triggeredAt))
      .limit(query.limit);

    return {
      success: true,
      data: alertRows.map((a) => ({
        id: a.id,
        tokenAddress: a.tokenAddress,
        priority: a.priority,
        title: a.title,
        message: a.message,
        signalScore: a.signalScore,
        strategyName: a.strategyName || "Unknown",
        webDeepLink: a.webDeepLink,
        telegramDeepLink: a.telegramDeepLink,
        status: a.status,
        triggeredAt: a.triggeredAt?.toISOString() || new Date().toISOString(),
      })),
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
