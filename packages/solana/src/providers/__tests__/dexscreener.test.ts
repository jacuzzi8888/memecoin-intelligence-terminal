import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DexScreenerProvider,
  fetchDexScreenerTokenData,
  fetchDexScreenerTokenDataBatch,
} from "../dexscreener.js";

describe("DexScreenerProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deduplicates pair lookups shared by metadata and market data consumers", async () => {
    const address = "CacheMint11111111111111111111111111111111111";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: vi.fn().mockResolvedValue({
        pairs: [{
          pairAddress: "pair-1",
          baseToken: { address, name: "Cache Token", symbol: "CACHE" },
          quoteToken: { address: "quote-1", name: "USD Coin", symbol: "USDC" },
          priceUsd: "0.25",
          marketCap: 250_000,
          liquidity: { usd: 75_000 },
          volume: { h1: 10_000, h24: 90_000 },
        }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DexScreenerProvider();
    const [raw, marketData, pools] = await Promise.all([
      fetchDexScreenerTokenData(address),
      provider.getMarketData(address),
      provider.getPoolsForToken(address),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(raw?.pairs?.[0]?.baseToken.symbol).toBe("CACHE");
    expect(marketData?.liquidityUsd).toBe(75_000);
    expect(pools).toHaveLength(1);
  });

  it("fetches large token sets in batches of no more than 30 addresses", async () => {
    const addresses = Array.from({ length: 31 }, (_, index) => `BatchMint${index}`);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const requested = String(input).split("/").at(-1)?.split(",") ?? [];
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          pairs: requested.map((address) => ({
            pairAddress: `pair-${address}`,
            baseToken: { address, name: address, symbol: "BATCH" },
            quoteToken: { address: "quote-1", name: "USD Coin", symbol: "USDC" },
          })),
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDexScreenerTokenDataBatch(addresses);
    const lastAddress = addresses.at(-1);
    if (!lastAddress) throw new Error("Expected a final batch address");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(31);
    expect(result.get(lastAddress)?.pairs?.[0]?.baseToken.address).toBe(lastAddress);
  });
});
