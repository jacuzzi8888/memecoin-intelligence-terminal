import type { DiscoverTokensOptions } from "../index.js";
import { describe, expect, it, vi } from "vitest";
import { discoverTokens, type TokenDiscoveryRepository } from "./discover-tokens.js";

function createRepository(): TokenDiscoveryRepository {
  return {
    findTokenByAddress: vi.fn().mockResolvedValue(null),
    insertRawProviderEvent: vi.fn().mockResolvedValue(undefined),
    upsertToken: vi.fn().mockResolvedValue({ id: "token-id" }),
    insertTokenLaunch: vi.fn().mockResolvedValue(undefined),
    insertTokenSnapshot: vi.fn().mockResolvedValue(undefined),
    getActiveStrategies: vi.fn().mockResolvedValue([{ id: "strategy-id", config: {} }]),
    insertSignal: vi.fn().mockResolvedValue("signal-id"),
    insertSignalFactor: vi.fn().mockResolvedValue(undefined),
    insertAlert: vi.fn().mockResolvedValue("alert-id"),
    insertAlertDelivery: vi.fn().mockResolvedValue(undefined),
  };
}

describe("discoverTokens", () => {
  it("persists provider metadata from discovery and market data services", async () => {
    const repository = createRepository();
    const providers: DiscoverTokensOptions["providers"] = {
      blockchain: {
        name: "solana-rpc",
        getTransaction: vi.fn(),
        getAccountInfo: vi.fn(),
        getMultipleAccounts: vi.fn(),
        getProgramAccounts: vi.fn(),
        getLatestBlockhash: vi.fn(),
        health: vi.fn(),
        getConnection: vi.fn(),
      },
      tokenDiscovery: {
        name: "helius",
        getNewTokens: vi.fn().mockResolvedValue([
          {
            tokenAddress: "Mint111111111111111111111111111111111111111",
            deployer: "Deployer11111111111111111111111111111111111",
            timestamp: Math.floor(Date.now() / 1000) - 300,
            slot: 12345,
            signature: "signature-1",
          },
        ]),
        getTokenInfo: vi.fn().mockResolvedValue({
          address: "Mint111111111111111111111111111111111111111",
          symbol: "TEST",
          name: "Test Token",
          decimals: 9,
          supply: "1000",
        }),
        getTokenHolders: vi.fn(),
        health: vi.fn(),
      },
      marketData: {
        name: "birdeye",
        getTokenPrice: vi.fn(),
        getMarketData: vi.fn().mockResolvedValue({
          marketCapUsd: 250000,
          priceUsd: 0.25,
          volume1hUsd: 50000,
          volume24hUsd: 125000,
          liquidityUsd: 90000,
          holderCount: 123,
          priceChange1h: 4.2,
          priceChange24h: 12.4,
        }),
        getHistoricalPrices: vi.fn(),
        getPoolsForToken: vi.fn(),
        health: vi.fn(),
      },
    };

    const result = await discoverTokens({
      appUrl: "http://localhost:3000",
      isMainnet: true,
      providers,
      repository,
    });

    expect(result).toMatchObject({
      network: "mainnet",
      eventsFound: 1,
      tokensFound: 1,
      tokensProcessed: 1,
    });

    expect(repository.insertTokenLaunch).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        network: "mainnet",
        discoveryProvider: "helius",
        marketDataProvider: "birdeye",
      }),
    }));

    expect(repository.insertSignal).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        network: "mainnet",
        discoveryProvider: "helius",
        marketDataProvider: "birdeye",
        snapshotAvailable: true,
      }),
    }));

    expect(repository.insertAlertDelivery).toHaveBeenCalledWith(expect.objectContaining({
      alertId: "alert-id",
      channel: "dev_outbox",
      destination: "log",
      status: "delivered",
    }));
  });
});
