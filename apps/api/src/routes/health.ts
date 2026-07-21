import type { FastifyPluginAsync } from "fastify";

const startTime = Date.now();

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      services: {
        database: "up",
        redis: "up",
        providers: "up",
      },
    };
  });
};
