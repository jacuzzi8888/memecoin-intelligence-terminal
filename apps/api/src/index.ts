import Fastify from "fastify";
import cors from "@fastify/cors";
import { logger } from "@memecoin/logger";
import { getEnv } from "@memecoin/config";
import { healthRoute } from "./routes/health.js";
import { statusRoute } from "./routes/status.js";
import { scannerRoute } from "./routes/scanner.js";
import { tokenRoute } from "./routes/tokens.js";
import { alertsRoute } from "./routes/alerts.js";
import { devIngestRoute } from "./routes/dev-ingest.js";

const log = logger("api");

export async function buildApp() {
  const env = getEnv();

  const app = Fastify({
    logger: false,
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  app.addHook("onRequest", async (request) => {
    request.headers["x-request-id"] = request.id;
  });

  app.addHook("onResponse", async (request, reply) => {
    log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      requestId: request.id,
      duration: reply.elapsedTime,
    }, "Request completed");
  });

  app.setErrorHandler((error: unknown, request: any, reply: any) => {
    const err = error as { message?: string; statusCode?: number };
    const message = err?.message || "Internal server error";
    const statusCode = err?.statusCode || 500;
    log.error({ error: message, requestId: request.id }, "Request error");
    reply.status(statusCode).send({
      success: false,
      error: message,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    });
  });

  await app.register(healthRoute);
  await app.register(statusRoute, { prefix: "/api/v1" });
  await app.register(scannerRoute, { prefix: "/api/v1" });
  await app.register(tokenRoute, { prefix: "/api/v1" });
  await app.register(alertsRoute, { prefix: "/api/v1" });

  if (env.ENABLE_DEV_INGESTION && env.NODE_ENV === "development") {
    await app.register(devIngestRoute, { prefix: "/api/v1" });
  }

  return app;
}

export async function startServer() {
  const env = getEnv();
  const app = await buildApp();

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    log.info({ port: env.API_PORT, host: env.API_HOST }, "API server started");
  } catch (err) {
    log.error({ error: err }, "Failed to start server");
    process.exit(1);
  }
}

startServer();
