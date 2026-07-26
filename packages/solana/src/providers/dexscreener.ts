import type {
  PriceData,
  MarketData,
  PricePoint,
  PoolData,
  ProviderHealth,
} from "../types.js";
import type { IMarketDataProvider } from "../interfaces.js";
import { logger } from "@memecoin/logger";

const log = logger("dexscreener-provider");

const DEXSCREENER_API = "https://api.dexscreener.com/latest";

interface DexScreenerResponse {
  pairs: Array<{
    pairAddress: string;
    baseToken: { address: string; name: string; symbol: string };
    quoteToken: { address: string; name: string; symbol: string };
    priceUsd?: string;
    marketCap?: number;
    liquidity?: { usd?: number };
    volume?: { h1?: number; h24?: number };
    priceChange?: { h1?: number; h24?: number };
    dexId?: string;
  }>;
}

export class DexScreenerProvider implements IMarketDataProvider {
  readonly name = "dexscreener";

  async getTokenPrice(address: string): Promise<PriceData | null> {
    try {
      const response = await fetch(`${DEXSCREENER_API}/dex/tokens/${address}`);
      if (!response.ok) return null;

      const data = (await response.json()) as DexScreenerResponse;
      const pair = data.pairs?.[0];
      if (!pair?.priceUsd) return null;

      return {
        address,
        priceUsd: parseFloat(pair.priceUsd),
        timestamp: Math.floor(Date.now() / 1000),
      };
    } catch (err) {
      log.error({ error: err, address }, "Failed to get token price from DexScreener");
      return null;
    }
  }

  async getMarketData(address: string): Promise<MarketData | null> {
    try {
      const response = await fetch(`${DEXSCREENER_API}/dex/tokens/${address}`);
      if (!response.ok) return null;

      const data = (await response.json()) as DexScreenerResponse;
      const pair = data.pairs?.[0];
      if (!pair) return null;

      const now = Math.floor(Date.now() / 1000);
      return {
        address,
        priceUsd: parseFloat(pair.priceUsd || "0"),
        marketCapUsd: pair.marketCap || 0,
        liquidityUsd: pair.liquidity?.usd || 0,
        volume24hUsd: pair.volume?.h24 || 0,
        volume1hUsd: pair.volume?.h1 || 0,
        holderCount: 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        priceChange1h: pair.priceChange?.h1 || 0,
        timestamp: now,
      };
    } catch (err) {
      log.error({ error: err, address }, "Failed to get market data from DexScreener");
      return null;
    }
  }

  async getHistoricalPrices(
    _address: string,
    _start: Date,
    _end: Date,
  ): Promise<PricePoint[]> {
    return [];
  }

  async getPoolsForToken(address: string): Promise<PoolData[]> {
    try {
      const response = await fetch(`${DEXSCREENER_API}/dex/tokens/${address}`);
      if (!response.ok) return [];

      const data = (await response.json()) as DexScreenerResponse;
      return (data.pairs || []).map((pair) => ({
        address: pair.pairAddress,
        baseMint: pair.baseToken.address,
        quoteMint: pair.quoteToken.address,
        dexProgram: pair.dexId || "unknown",
        liquidityUsd: pair.liquidity?.usd || 0,
        volume24hUsd: pair.volume?.h24 || 0,
      }));
    } catch (err) {
      log.error({ error: err, address }, "Failed to get pools from DexScreener");
      return [];
    }
  }

  async health(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      const response = await fetch(`${DEXSCREENER_API}/dex/tokens/So11111111111111111111111111111111111111112`);
      const healthy = response.ok;
      return {
        provider: this.name,
        healthy,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        provider: this.name,
        healthy: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}