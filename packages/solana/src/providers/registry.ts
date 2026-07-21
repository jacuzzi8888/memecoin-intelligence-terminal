import type { IProviderRegistry } from "../interfaces.js";
import { SolanaRpcProvider } from "./solana-rpc.js";
import { HeliusProvider } from "./helius.js";
import { logger } from "@memecoin/logger";

const log = logger("provider-registry");

export interface ProviderConfig {
  solanaRpcUrl?: string;
  heliusApiKey?: string;
  enablePaidProviders?: boolean;
}

function createDevFallback(name: string): any {
  const handler = {
    get: (_target: any, prop: string) => {
      if (prop === "name") return name;
      if (prop === "health") return async () => ({ provider: name, healthy: false, error: "Not implemented" });
      if (prop === "isConnected") return () => false;
      if (prop === "getConnection") return () => null;
      if (prop === "getRpcUrl") return () => "";
      if (prop === "subscribe") return async function* () { /* empty */ };
      if (prop === "unsubscribe") return async () => {};
      if (typeof prop === "string" && prop.startsWith("get")) {
        return async () => (name.includes("List") || name.includes("Trades") || name.includes("Positions") || name.includes("Holders") || name.includes("Pools") || name.includes("Multiple") || name.includes("History") || name.includes("Quotes") || name.includes("Prices") ? [] : null);
      }
      if (typeof prop === "string" && (prop.startsWith("build") || prop.startsWith("simulate") || prop.startsWith("send"))) {
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
    { helius: useHelius, rpcUrl },
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

  const marketData = createDevFallback("dev-market-data");
  const transactionStream = createDevFallback("dev-transaction-stream");
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
