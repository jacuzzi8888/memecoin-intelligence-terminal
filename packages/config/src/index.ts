import { z } from "zod";

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

  ENABLE_DEV_AUTH: z.coerce.boolean().default(true),
  ENABLE_DEV_INGESTION: z.coerce.boolean().default(true),
  ENABLE_LIVE_TRADING: z.coerce.boolean().default(false),
  ENABLE_PAID_PROVIDERS: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error("Invalid environment variables:", result.error.format());
      throw new Error("Invalid environment configuration");
    }
    _env = result.data;
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
