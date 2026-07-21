export interface MarketDataService {
  getTokenMetrics(address: string): Promise<TokenMetrics>;
}

export interface TokenMetrics {
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number;
  volume1hUsd: number;
  volume24hUsd: number;
  holderCount: number;
  priceChange1h: number;
  priceChange24h: number;
}

export class DevMarketDataService implements MarketDataService {
  async getTokenMetrics(_address: string): Promise<TokenMetrics> {
    return {
      priceUsd: 0.0005,
      marketCapUsd: 500000,
      liquidityUsd: 25000,
      volume1hUsd: 125000,
      volume24hUsd: 1500000,
      holderCount: 350,
      priceChange1h: 0.05,
      priceChange24h: 0.25,
    };
  }
}