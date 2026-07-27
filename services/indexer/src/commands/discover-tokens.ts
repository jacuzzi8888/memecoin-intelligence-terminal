import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });
import { getDb } from "@memecoin/database";
import { createProviderRegistry } from "@memecoin/solana";
import { logger } from "@memecoin/logger";
import { createTokenDiscoveryRepository, discoverTokens } from "../discovery/discover-tokens.js";

const log = logger("discover-tokens");

async function main() {
  log.info("Starting real token discovery scan...");
  const db = getDb();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const useHelius = !!heliusApiKey;
  const isMainnet = useHelius;

  const rpcUrl = isMainnet
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

  const providers = createProviderRegistry({
    solanaRpcUrl: rpcUrl,
    heliusApiKey,
    birdeyeApiKey: process.env.BIRDEYE_API_KEY,
  });

  const marketHealth = await providers.marketData.health();
  log.info({ marketHealth, provider: providers.marketData.name }, "Market data health check");

  const health = await providers.blockchain.health();
  log.info({ health, network: isMainnet ? "mainnet" : "devnet", helius: useHelius }, "RPC health check");

  if (!health.healthy) {
    log.error("RPC is not healthy. Aborting.");
    return;
  }

  if (useHelius) {
    const discoveryHealth = await providers.tokenDiscovery.health();
    log.info({ discoveryHealth, provider: providers.tokenDiscovery.name }, "Token discovery health check");
  }

  const result = await discoverTokens({
    appUrl,
    isMainnet,
    providers,
    repository: createTokenDiscoveryRepository(db),
  });

  log.info({ ...result, helius: useHelius }, "Token discovery scan complete");
}

main().catch((err) => {
  log.error({ error: err }, "Token discovery failed");
  process.exit(1);
});
