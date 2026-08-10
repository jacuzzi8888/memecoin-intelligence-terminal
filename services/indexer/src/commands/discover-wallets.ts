import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { closeDb } from "@memecoin/database";
import { logger } from "@memecoin/logger";
import { discoverWalletsFromRecentTokens } from "../token-wallet-discovery.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

const log = logger("discover-wallets");

function readNumberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    throw new Error("HELIUS_API_KEY not set");
  }

  const result = await discoverWalletsFromRecentTokens({
    heliusApiKey,
    sinceHours: readNumberEnv("DISCOVER_WALLET_SINCE_HOURS", 24),
    tokenLimit: readNumberEnv("DISCOVER_WALLET_TOKEN_LIMIT", 12),
    transactionsPerToken: readNumberEnv("DISCOVER_WALLET_TX_LIMIT", 25),
    walletLimit: readNumberEnv("DISCOVER_WALLET_LIMIT", 8),
    minCandidateScore: readNumberEnv("DISCOVER_WALLET_MIN_SCORE", 8),
  });

  log.info(result, "Wallet discovery from recent tokens complete");
}

main()
  .catch((error) => {
    log.error({ error }, "Wallet discovery failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
