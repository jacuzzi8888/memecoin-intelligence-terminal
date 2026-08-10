import { afterEach, describe, expect, it, vi } from "vitest";
import { DexScreenerProvider, fetchDexScreenerTokenData } from "../dexscreener.js";

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
});
