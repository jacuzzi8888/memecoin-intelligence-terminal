import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeliusProvider } from "../helius";
import { resetHeliusRequestLimiterForTests } from "../helius-rate-limit";

describe("HeliusProvider.getTokenHolders", () => {
  beforeEach(() => {
    vi.stubEnv("HELIUS_REQUEST_INTERVAL_MS", "0");
    resetHeliusRequestLimiterForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetHeliusRequestLimiterForTests();
  });

  it("aggregates token accounts by owner and calculates supply percentage", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        result: { value: [
          { address: "account-a-1", amount: "300", decimals: 6 },
          { address: "account-b", amount: "200", decimals: 6 },
          { address: "account-a-2", amount: "100", decimals: 6 },
        ] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          id: "token-supply",
          result: { value: { amount: "1000", decimals: 6 } },
        },
        {
          id: "largest-token-account-owners",
          result: { value: [
            { data: { parsed: { info: { owner: "wallet-a" } } } },
            { data: { parsed: { info: { owner: "wallet-b" } } } },
            { data: { parsed: { info: { owner: "wallet-a" } } } },
          ] },
        },
      ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HeliusProvider({ apiKey: "test-key" });
    const holders = await provider.getTokenHolders("mint-address", 25);

    expect(holders).toEqual([
      { address: "wallet-a", balance: "400", decimals: 6, percentage: 40 },
      { address: "wallet-b", balance: "200", decimals: 6, percentage: 20 },
    ]);
    const largestAccountsRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(largestAccountsRequest).toMatchObject({
      method: "getTokenLargestAccounts",
      params: ["mint-address"],
    });
    const detailsRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(detailsRequest).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "getTokenSupply" }),
      expect.objectContaining({ method: "getMultipleAccounts" }),
    ]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns no holders when a details RPC batch reports an error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        result: { value: [{ address: "account-a", amount: "300", decimals: 6 }] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: "token-supply", result: { value: { amount: "1000", decimals: 6 } } },
        { id: "largest-token-account-owners", error: { code: -32005, message: "rate limited" } },
      ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new HeliusProvider({ apiKey: "test-key" });

    await expect(provider.getTokenHolders("mint-address")).resolves.toEqual([]);
  });
});
