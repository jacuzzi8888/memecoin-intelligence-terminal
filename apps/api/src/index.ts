import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "dotenv";
import { logger } from "@memecoin/logger";
import { getEnv, verifyApiToken } from "@memecoin/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { timingSafeEqual } from "node:crypto";
import { healthRoute } from "./routes/health.js";
import { statusRoute } from "./routes/status.js";
import { scannerRoute } from "./routes/scanner.js";
import { tokenRoute } from "./routes/tokens.js";
import { tokenAnalysisRoute } from "./routes/token-analysis.js";
import { alertsRoute } from "./routes/alerts.js";
import { strategiesRoute } from "./routes/strategies.js";
import { dashboardRoute } from "./routes/dashboard.js";
import { watchlistsRoute } from "./routes/watchlists.js";
import { walletsRoute } from "./routes/wallets.js";
import { settingsRoute } from "./routes/settings.js";
import { terminalRoute } from "./routes/terminal.js";
import { devIngestRoute } from "./routes/dev-ingest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

const log = logger("api");

const developmentUserRoutePrefixes = [
  "/api/v1/alerts",
  "/api/v1/strategies",
  "/api/v1/watchlists",
  "/api/v1/wallets",
  "/api/v1/settings",
  "/api/v1/terminal",
];

function usesDevelopmentUser(url: string) {
  const path = url.split("?", 1)[0] ?? url;
  return developmentUserRoutePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function containsSensitiveConfiguration(url: string) {
  const path = url.split("?", 1)[0] ?? url;
  return path === "/api/v1/settings" || path.startsWith("/api/v1/settings/");
}

function isMutation(method: string) {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

function secretsMatch(candidate: string | undefined, expected: string | undefined) {
  if (!candidate || !expected) return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

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

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX ?? 100,
    timeWindow: env.RATE_LIMIT_WINDOW_MS ?? 60_000,
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
  });

  app.addHook("onRequest", async (request) => {
    request.headers["x-request-id"] = request.id;
  });

  app.addHook("onRequest", async (request, reply) => {
    const authorization = request.headers.authorization;
    const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    const tokenPayload = bearerToken ? verifyApiToken(bearerToken, env.NEXTAUTH_SECRET) : null;
    if (tokenPayload) {
      (request as typeof request & { userPrincipal?: string }).userPrincipal = tokenPayload.principal;
    }

    const rawWriteKey = request.headers["x-aegis-write-key"];
    const writeKey = Array.isArray(rawWriteKey) ? rawWriteKey[0] : rawWriteKey;
    const hasPersonalWriteAccess = secretsMatch(writeKey, env.API_WRITE_TOKEN);

    if (isMutation(request.method) && env.API_WRITE_TOKEN && !hasPersonalWriteAccess && !tokenPayload) {
      return reply.status(401).send({
        success: false,
        error: "Personal write access is required. Unlock this browser in Settings.",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      });
    }

    if (env.API_WRITE_TOKEN && containsSensitiveConfiguration(request.url) && !hasPersonalWriteAccess && !tokenPayload) {
      return reply.status(401).send({
        success: false,
        error: "Personal access is required to view configuration.",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      });
    }

    if (env.NODE_ENV === "production" && !env.PERSONAL_APP_MODE && usesDevelopmentUser(request.url) && !tokenPayload) {
      return reply.status(401).send({
        success: false,
        error: "Authentication is required for this surface.",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      });
    }
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
  await app.register(dashboardRoute, { prefix: "/api/v1" });
  await app.register(scannerRoute, { prefix: "/api/v1" });
  await app.register(tokenRoute, { prefix: "/api/v1" });
  await app.register(tokenAnalysisRoute, { prefix: "/api/v1" });
  await app.register(alertsRoute, { prefix: "/api/v1" });
  await app.register(strategiesRoute, { prefix: "/api/v1" });
  await app.register(watchlistsRoute, { prefix: "/api/v1" });
  await app.register(walletsRoute, { prefix: "/api/v1" });
  await app.register(settingsRoute, { prefix: "/api/v1" });
  await app.register(terminalRoute, { prefix: "/api/v1" });

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

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  startServer();
}
