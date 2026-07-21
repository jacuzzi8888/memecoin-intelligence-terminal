import { describe, it, expect } from "vitest";
import { createProviderRegistry } from "../registry";

describe("ProviderRegistry", () => {
  it("creates registry with dev fallbacks when no API key", () => {
    const registry = createProviderRegistry({});
    expect(registry.blockchain.name).toBe("solana-rpc");
    expect(registry.tokenDiscovery.name).toBe("dev-token-discovery");
    expect(registry.walletHistory.name).toBe("dev-wallet-history");
  });

  it("creates registry with Helius when API key provided", () => {
    const registry = createProviderRegistry({ heliusApiKey: "test-key" });
    expect(registry.blockchain.name).toBe("solana-rpc");
    expect(registry.tokenDiscovery.name).toBe("helius");
    expect(registry.walletHistory.name).toBe("helius");
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

  it("dev fallback returns null for unknown get methods", async () => {
    const registry = createProviderRegistry({});
    const result = await registry.tokenDiscovery.getNewTokens(new Date());
    expect(result).toBeNull();
  });

  it("dev fallback reports unhealthy", async () => {
    const registry = createProviderRegistry({});
    const health = await registry.tokenDiscovery.health();
    expect(health.healthy).toBe(false);
  });
});
