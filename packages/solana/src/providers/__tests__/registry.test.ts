import { describe, it, expect } from "vitest";
import { createProviderRegistry } from "../registry";

describe("ProviderRegistry", () => {
  it("creates registry with dev fallbacks when no API key", () => {
    const registry = createProviderRegistry({});
    expect(registry.blockchain.name).toBe("solana-rpc");
    expect(registry.tokenDiscovery.name).toBe("dev-token-discovery");
    expect(registry.marketData.name).toBe("dexscreener");
    expect(registry.transactionStream.name).toBe("dev-transaction-stream");
    expect(registry.walletHistory.name).toBe("dev-wallet-history");
  });

  it("creates registry with Helius when API key provided", () => {
    const registry = createProviderRegistry({ heliusApiKey: "test-key" });
    expect(registry.blockchain.name).toBe("solana-rpc");
    expect(registry.tokenDiscovery.name).toBe("helius");
    expect(registry.transactionStream.name).toBe("helius-stream");
    expect(registry.walletHistory.name).toBe("helius");
  });

  it("uses Birdeye market data when API key provided", () => {
    const registry = createProviderRegistry({ birdeyeApiKey: "bird-key" });
    expect(registry.marketData.name).toBe("birdeye");
  });

  it("uses custom RPC URL when provided", () => {
    const registry = createProviderRegistry({ solanaRpcUrl: "https://custom-rpc.com" });
    expect(registry.blockchain.name).toBe("solana-rpc");
  });

  it("dev fallback returns null for get methods", async () => {
    const registry = createProviderRegistry({});
    const result = await registry.tokenDiscovery.getTokenInfo("test");
    expect(result).toBeNull();
  });

  it("dev fallback returns empty arrays for list-returning methods", async () => {
    const registry = createProviderRegistry({});
    const result = await registry.tokenDiscovery.getNewTokens(new Date());
    expect(result).toEqual([]);
  });

  it("dev stream fallback returns a subscription object", async () => {
    const registry = createProviderRegistry({});
    const subscription = await registry.transactionStream.subscribe({});
    expect(subscription.subscriptionId).toBe("dev-dev-transaction-stream");
    await expect(subscription.unsubscribe()).resolves.toBeUndefined();
  });

  it("dev fallback reports unhealthy", async () => {
    const registry = createProviderRegistry({});
    const health = await registry.tokenDiscovery.health();
    expect(health.healthy).toBe(false);
  });
});
