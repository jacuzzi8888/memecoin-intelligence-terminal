import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";

const booleanEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  DATABASE_URL: z.string().url().default("postgresql://memecoin:memecoin_dev@localhost:5432/memecoin_intelligence"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().min(32).default("development-secret-change-in-production-minimum-32-chars"),

  API_URL: z.string().url().default("http://localhost:4000"),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default("0.0.0.0"),

  SOLANA_RPC_URL: z.string().default("https://api.devnet.solana.com"),
  SOLANA_WS_URL: z.string().default("wss://api.devnet.solana.com"),

  HELIUS_API_KEY: z.string().optional(),
  BIRDEYE_API_KEY: z.string().optional(),
  DEXSCREENER_API_KEY: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().optional(),

  DISCORD_WEBHOOK_URL: z.string().optional(),

  JUPITER_API_URL: z.string().url().default("https://quote-api.jup.ag/v6"),

  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),

  ENABLE_DEV_AUTH: booleanEnv.default(true),
  ENABLE_DEV_INGESTION: booleanEnv.default(true),
  ENABLE_LIVE_TRADING: booleanEnv.default(false),
  ENABLE_PAID_PROVIDERS: booleanEnv.default(false),
  PERSONAL_APP_MODE: booleanEnv.default(false),
  API_WRITE_TOKEN: z.string().min(32).optional(),
});

const DEVELOPMENT_SECRET = "development-secret-change-in-production-minimum-32-chars";

export interface ApiTokenPayload {
  principal: string;
  expiresAt: number;
}

export function createApiToken(principal: string, secret: string, ttlSeconds = 300) {
  const payload: ApiTokenPayload = {
    principal,
    expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyApiToken(token: string, secret: string): ApiTokenPayload | null {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(encodedSignature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as ApiTokenPayload;
    if (!payload.principal || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error("Invalid environment variables:", result.error.format());
      throw new Error("Invalid environment configuration");
    }
    const env = result.data;
    if (env.NODE_ENV === "production" && (!env.PERSONAL_APP_MODE && env.ENABLE_DEV_AUTH || env.NEXTAUTH_SECRET === DEVELOPMENT_SECRET)) {
      throw new Error("Production requires a non-default NEXTAUTH_SECRET and either disabled dev auth or explicit personal app mode");
    }
    if (env.NODE_ENV === "production" && env.PERSONAL_APP_MODE && !env.API_WRITE_TOKEN) {
      throw new Error("Personal production mode requires API_WRITE_TOKEN to protect mutation endpoints");
    }
    _env = env;
  }
  return _env;
}

export function isDev(): boolean {
  return getEnv().NODE_ENV === "development";
}

export function isProd(): boolean {
  return getEnv().NODE_ENV === "production";
}

export function isTest(): boolean {
  return getEnv().NODE_ENV === "test";
}

export { envSchema };
