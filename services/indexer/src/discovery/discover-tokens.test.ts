import type { DiscoverTokensOptions } from "../index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverTokens, type TokenDiscoveryRepository } from "./discover-tokens.js";

function createRepository(): TokenDiscoveryRepository {
  return {
    findTokenByAddress: vi.fn().mockResolvedValue(null),
    insertRawProviderEvent: vi.fn().mockResolvedValue(undefined),
    upsertToken: vi.fn().mockResolvedValue({ id: "token-id" }),
    updateTokenMetadata: vi.fn().mockResolvedValue(undefined),
    insertTokenLaunch: vi.fn().mockResolvedValue(undefined),
    insertTokenSnapshot: vi.fn().mockResolvedValue(undefined),
    getActiveStrategies: vi.fn().mockResolvedValue([{ id: "strategy-id", config: {} }]),
    findLatestSignal: vi.fn().mockResolvedValue(null),
    insertSignal: vi.fn().mockResolvedValue("signal-id"),
    insertSignalFactor: vi.fn().mockResolvedValue(undefined),
    insertAlert: vi.fn().mockResolvedValue("alert-id"),
    insertAlertDelivery: vi.fn().mockResolvedValue(undefined),
  };
}

describe("discoverTokens", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists provider metadata from discovery and market data services", async () => {
    const repository = createRepository();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    })));

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
        getTokenHolders: vi.fn().mockResolvedValue([
          { address: "Holder1111111111111111111111111111111111111", balance: "700", decimals: 9, percentage: 70 },
          { address: "Holder2222222222222222222222222222222222222", balance: "300", decimals: 9, percentage: 30 },
        ]),
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
      signalsCreated: 1,
      alertsCreated: 0,
    });

    expect(repository.insertTokenLaunch).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        network: "mainnet",
        discoveryProvider: "helius",
        marketDataProvider: "birdeye",
      }),
    }));

    expect(repository.insertSignal).toHaveBeenCalledWith(expect.objectContaining({
      strategyId: "system-market-scan",
      metadata: expect.objectContaining({
        network: "mainnet",
        discoveryProvider: "helius",
        marketDataProvider: "birdeye",
        snapshotAvailable: true,
        holderEvidence: {
          provider: "helius",
          sampledHolders: 2,
          topHolderConcentrationPct: 70,
        },
      }),
    }));

    expect(repository.insertAlert).not.toHaveBeenCalled();
    expect(repository.insertAlertDelivery).not.toHaveBeenCalled();
  });

  it("falls back to DexScreener latest Solana profiles when registry discovery returns no tokens", async () => {
    const repository = createRepository();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/token-profiles/latest")) {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue([
            {
              chainId: "solana",
              tokenAddress: "ProfileMint1111111111111111111111111111111",
              url: "https://dexscreener.com/solana/ProfileMint1111111111111111111111111111111",
              description: "fresh profile",
              updatedAt: new Date().toISOString(),
            },
            {
              chainId: "ethereum",
              tokenAddress: "0x0000000000000000000000000000000000000000",
              updatedAt: new Date().toISOString(),
            },
          ]),
        };
      }

      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          pairs: [
            {
              baseToken: {
                address: "ProfileMint1111111111111111111111111111111",
                symbol: "DEXP",
                name: "Dex Profile Token",
              },
            },
          ],
        }),
      };
    }));

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
        getNewTokens: vi.fn().mockResolvedValue([]),
        getTokenInfo: vi.fn().mockResolvedValue({
          address: "ProfileMint1111111111111111111111111111111",
          symbol: "UNKNOWN",
          name: "Unknown Token",
          decimals: 6,
          totalSupply: null,
          logoUri: null,
          isVerified: false,
        }),
        getTokenHolders: vi.fn(),
        health: vi.fn(),
      },
      marketData: {
        name: "dexscreener",
        getTokenPrice: vi.fn(),
        getMarketData: vi.fn().mockResolvedValue({
          marketCapUsd: 50_000,
          priceUsd: 0.001,
          volume1hUsd: 10_000,
          volume24hUsd: 40_000,
          liquidityUsd: 20_000,
          holderCount: 0,
          priceChange1h: 1,
          priceChange24h: 5,
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
      launchProgram: "DexScreener Profile",
      metadata: expect.objectContaining({
        discoveryProvider: "helius",
        source: "dexscreener-profile",
        dexSymbol: "DEXP",
        dexName: "Dex Profile Token",
      }),
    }));
    expect(repository.upsertToken).toHaveBeenCalledWith(expect.objectContaining({
      symbol: "DEXP",
      name: "Dex Profile Token",
    }));
  });
});
