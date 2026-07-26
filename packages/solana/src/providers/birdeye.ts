import type {
  PriceData,
  MarketData,
  PricePoint,
  PoolData,
  HolderInfo,
  ProviderHealth,
} from "../types.js";
import type { IMarketDataProvider, ITokenDiscoveryProvider } from "../interfaces.js";
import { logger } from "@memecoin/logger";

const log = logger("birdeye-provider");

interface BirdeyeConfig {
  apiKey: string;
  baseUrl?: string;
}

export class BirdeyeProvider implements IMarketDataProvider {
  readonly name = "birdeye";
  private apiKey: string;
  private baseUrl: string;

  constructor(config: BirdeyeConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://public-api.birdeye.so";
    log.info("Birdeye provider initialized");
  }

  async getTokenPrice(address: string): Promise<PriceData | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/defi/price?address=${address}`,
        {
          headers: {
            "X-API-KEY": this.apiKey,
            "accept": "application/json",
          },
        },
      );
      if (!response.ok) return null;

      const data = (await response.json()) as any;
      if (!data?.data?.value) return null;

      return {
        address,
        priceUsd: data.data.value,
        timestamp: Math.floor(Date.now() / 1000),
      };
    } catch (err) {
      log.error({ error: err, address }, "Failed to get token price from Birdeye");
      return null;
    }
  }

  async getMarketData(address: string): Promise<MarketData | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/defi/token_overview?address=${address}`,
        {
          headers: {
            "X-API-KEY": this.apiKey,
            "accept": "application/json",
          },
        },
      );
      if (!response.ok) return null;

      const data = (await response.json()) as any;
      if (!data?.data) return null;

      const d = data.data;
      const now = Math.floor(Date.now() / 1000);
      return {
        address,
        priceUsd: d.price || 0,
        marketCapUsd: d.marketCap || 0,
        liquidityUsd: d.liquidity || 0,
        volume24hUsd: d.volume24hUSD || 0,
        volume1hUsd: d.volume1hUSD || 0,
        holderCount: d.holder || 0,
        priceChange24h: d.priceChange24hPercent || 0,
        priceChange1h: d.priceChange1hPercent || 0,
        timestamp: now,
      };
    } catch (err) {
      log.error({ error: err, address }, "Failed to get market data from Birdeye");
      return null;
    }
  }

  async getHistoricalPrices(
    address: string,
    start: Date,
    end: Date,
  ): Promise<PricePoint[]> {
    try {
      const url = `${this.baseUrl}/defi/history_price?address=${address}&address_type=token&timeframe=1H&from_timestamp=${Math.floor(start.getTime() / 1000)}&to_timestamp=${Math.floor(end.getTime() / 1000)}`;
      const response = await fetch(url, {
        headers: {
          "X-API-KEY": this.apiKey,
          "accept": "application/json",
        },
      });
      if (!response.ok) return [];

      const data = (await response.json()) as any;
      return (data.data || []).map((p: any) => ({
        timestamp: p.unixTime,
        priceUsd: p.value,
        volumeUsd: 0,
      }));
    } catch (err) {
      log.error({ error: err }, "Failed to get historical prices from Birdeye");
      return [];
    }
  }

  async getPoolsForToken(_address: string): Promise<PoolData[]> {
    return [];
  }

  async health(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      const response = await fetch(`${this.baseUrl}/defi/health`, {
        headers: { "X-API-KEY": this.apiKey },
      });
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