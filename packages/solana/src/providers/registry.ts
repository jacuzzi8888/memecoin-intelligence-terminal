import type { IProviderRegistry } from "../interfaces.js";
import { SolanaRpcProvider } from "./solana-rpc.js";
import { HeliusProvider } from "./helius.js";
import { DexScreenerProvider } from "./dexscreener.js";
import { BirdeyeProvider } from "./birdeye.js";
import { HeliusStreamProvider } from "./helius-stream.js";
import { logger, redactUrlCredentials } from "@memecoin/logger";

const log = logger("provider-registry");

export interface ProviderConfig {
  solanaRpcUrl?: string;
  heliusApiKey?: string;
  birdeyeApiKey?: string;
  enablePaidProviders?: boolean;
}

async function* createEmptyStream() {
  // Empty async iterable used by local development fallbacks.
}

function createDevFallback(name: string): any {
  const handler = {
    get: (_target: any, prop: string) => {
      if (prop === "name") return name;
      if (prop === "health") return async () => ({ provider: name, healthy: false, error: "Not implemented" });
      if (prop === "isConnected") return () => false;
      if (prop === "getConnection") return () => null;
      if (prop === "getRpcUrl") return () => "";
      if (prop === "subscribe") {
        return async () => ({
          subscriptionId: `dev-${name}`,
          unsubscribe: async () => {},
          [Symbol.asyncIterator]: () => createEmptyStream(),
        });
      }
      if (prop === "unsubscribe") return async () => {};
      if (prop === "getNewTokens") return async () => [];
      if (prop === "getTokenInfo") return async () => null;
      if (prop === "getTokenHolders") return async () => [];
      if (prop === "getTokenPrice") return async () => null;
      if (prop === "getMarketData") return async () => null;
      if (prop === "getHistoricalPrices") return async () => [];
      if (prop === "getPoolsForToken") return async () => [];
      if (prop === "getWalletTrades") return async () => [];
      if (prop === "getWalletPositions") return async () => [];
      if (prop === "getWalletPnl") {
        return async () => ({
          totalPnlUsd: 0,
          realizedPnlUsd: 0,
          unrealizedPnlUsd: 0,
          winRate: 0,
          totalTrades: 0,
        });
      }
      if (prop === "getQuote") return async () => null;
      if (prop === "getQuotes") return async () => [];
      if (prop === "buildSwapTransaction") return async () => null;
      if (prop === "simulateSwap") {
        return async () => ({
          success: false,
          error: "Not implemented",
          logs: [],
        });
      }
      if (typeof prop === "string" && prop.startsWith("send")) {
        return async () => null;
      }
      return undefined;
    },
  };
  return new Proxy({}, handler);
}

export function createProviderRegistry(config: ProviderConfig = {}): IProviderRegistry {
  const useHelius = !!(config.heliusApiKey || process.env.HELIUS_API_KEY);
  const rpcUrl = config.solanaRpcUrl || process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

  log.info(
    { helius: useHelius, rpcUrl: redactUrlCredentials(rpcUrl) },
    "Creating provider registry",
  );

  const solanaRpc = new SolanaRpcProvider(rpcUrl);

  let tokenDiscovery: any;
  let walletHistory: any;

  if (useHelius) {
    const helius = new HeliusProvider({
      apiKey: config.heliusApiKey || process.env.HELIUS_API_KEY || "",
    });
    tokenDiscovery = helius;
    walletHistory = helius;
    log.info("Using Helius for token discovery and wallet history");
  } else {
    tokenDiscovery = createDevFallback("dev-token-discovery");
    walletHistory = createDevFallback("dev-wallet-history");
    log.info("Using development fallback for token discovery and wallet history");
  }

  let marketData: any;
  const birdeyeApiKey = config.birdeyeApiKey || process.env.BIRDEYE_API_KEY;

  if (birdeyeApiKey) {
    marketData = new BirdeyeProvider({ apiKey: birdeyeApiKey });
    log.info("Using Birdeye for market data");
  } else {
    marketData = new DexScreenerProvider();
    log.info("Using DexScreener for market data (free tier)");
  }

  let transactionStream: any;
  if (useHelius) {
    transactionStream = new HeliusStreamProvider({ apiKey: config.heliusApiKey || process.env.HELIUS_API_KEY || "" });
    log.info("Using Helius WebSocket for transaction streaming");
  } else {
    transactionStream = createDevFallback("dev-transaction-stream");
  }
  const swapQuote = createDevFallback("dev-swap-quote");
  const swapExecution = createDevFallback("dev-swap-execution");

  return {
    blockchain: solanaRpc,
    tokenDiscovery,
    marketData,
    transactionStream,
    walletHistory,
    swapQuote,
    swapExecution,
  };
}

export { SolanaRpcProvider } from "./solana-rpc.js";
export { HeliusProvider } from "./helius.js";
export { DexScreenerProvider } from "./dexscreener.js";
export { BirdeyeProvider } from "./birdeye.js";
export { HeliusStreamProvider } from "./helius-stream.js";
