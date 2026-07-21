import { describe, it, expect } from "vitest";
import { SolanaRpcProvider } from "../solana-rpc";

describe("SolanaRpcProvider", () => {
  const provider = new SolanaRpcProvider("https://api.devnet.solana.com");

  it("has correct name", () => {
    expect(provider.name).toBe("solana-rpc");
  });

  it("returns a connection", () => {
    const connection = provider.getConnection();
    expect(connection).toBeDefined();
    expect(connection.rpcEndpoint).toBe("https://api.devnet.solana.com");
  });

  it("reports health status", async () => {
    const health = await provider.health();
    expect(health.provider).toBe("solana-rpc");
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThan(0);
  });

  it("returns null for non-existent transaction", async () => {
    const result = await provider.getTransaction("nonexistent-signature");
    expect(result).toBeNull();
  });

  it("returns null for non-existent account", async () => {
    const result = await provider.getAccountInfo("11111111111111111111111111111112");
    expect(result).toBeDefined();
  });

  it("returns empty array for invalid program accounts", async () => {
    const result = await provider.getProgramAccounts("invalid-program-id");
    expect(result).toEqual([]);
  });

  it("returns latest blockhash", async () => {
    const result = await provider.getLatestBlockhash();
    expect(result.blockhash).toBeDefined();
    expect(result.lastValidBlockHeight).toBeGreaterThan(0);
  });
});
