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

export interface DexScreenerResponse {
  pairs?: Array<{
    pairAddress: string;
    baseToken: { address: string; name: string; symbol: string };
    quoteToken: { address: string; name: string; symbol: string };
    priceUsd?: string;
    marketCap?: number;
    liquidity?: { usd?: number };
    volume?: { h1?: number; h24?: number };
    priceChange?: { h1?: number; h24?: number };
    dexId?: string;
    pairCreatedAt?: number;
  }>;
}

interface DexScreenerCacheEntry {
  data: DexScreenerResponse;
  expiresAt: number;
  staleUntil: number;
}

const tokenResponseCache = new Map<string, DexScreenerCacheEntry>();
const tokenResponseRequests = new Map<string, Promise<DexScreenerResponse | null>>();
const tokenResponseBackoff = new Map<string, number>();

function readDuration(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : fallback;
}

function readRetryAfter(response: Response) {
  const retryAfter = response.headers?.get("retry-after");
  if (!retryAfter) return 60_000;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(seconds * 1_000, 1_000);

  const retryAt = Date.parse(retryAfter);
  return Number.isNaN(retryAt) ? 60_000 : Math.max(retryAt - Date.now(), 1_000);
}

export async function fetchDexScreenerTokenData(address: string): Promise<DexScreenerResponse | null> {
  const now = Date.now();
  const cached = tokenResponseCache.get(address);
  if (cached && now < cached.expiresAt) return cached.data;
  if ((tokenResponseBackoff.get(address) ?? 0) > now) {
    return cached && now < cached.staleUntil ? cached.data : null;
  }

  const pending = tokenResponseRequests.get(address);
  if (pending) return pending;

  const request = (async () => {
    try {
      const response = await fetch(`${DEXSCREENER_API}/dex/tokens/${address}`);
      if (!response.ok) {
        const retryMs = response.status === 429 ? readRetryAfter(response) : 30_000;
        tokenResponseBackoff.set(address, Date.now() + retryMs);
        log.warn({ address, status: response.status, retryMs }, "DexScreener token request failed");
        return cached && Date.now() < cached.staleUntil ? cached.data : null;
      }

      const data = (await response.json()) as DexScreenerResponse;
      const cachedAt = Date.now();
      tokenResponseCache.set(address, {
        data,
        expiresAt: cachedAt + readDuration("DEXSCREENER_TOKEN_CACHE_MS", 15_000),
        staleUntil: cachedAt + readDuration("DEXSCREENER_TOKEN_STALE_MS", 5 * 60_000),
      });
      tokenResponseBackoff.delete(address);
      return data;
    } catch (err) {
      tokenResponseBackoff.set(address, Date.now() + 30_000);
      log.warn({ address, error: err }, "DexScreener token request failed");
      return cached && Date.now() < cached.staleUntil ? cached.data : null;
    } finally {
      tokenResponseRequests.delete(address);
    }
  })();

  tokenResponseRequests.set(address, request);
  return request;
}

export class DexScreenerProvider implements IMarketDataProvider {
  readonly name = "dexscreener";

  async getTokenPrice(address: string): Promise<PriceData | null> {
    try {
      const data = await fetchDexScreenerTokenData(address);
      if (!data) return null;
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
      const data = await fetchDexScreenerTokenData(address);
      if (!data) return null;
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
      const data = await fetchDexScreenerTokenData(address);
      if (!data) return [];
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
