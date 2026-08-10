import type { FastifyPluginAsync } from "fastify";
import { getDb } from "@memecoin/database";
import { checkQueueConnection } from "@memecoin/queue";
import { sql } from "drizzle-orm";

const startTime = Date.now();

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get("/health", async (_request, reply) => {
    const [database, redis] = await Promise.all([
      getDb().execute(sql`select 1`).then(() => true).catch(() => false),
      checkQueueConnection(),
    ]);
    const healthy = database && redis;
    if (!healthy) reply.status(503);

    return {
      status: healthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      version: "0.2.0",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      services: {
        database: database ? "up" : "down",
        redis: redis ? "up" : "down",
        providers: "not_checked",
      },
    };
  });
};
