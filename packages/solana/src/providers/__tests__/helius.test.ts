import { afterEach, describe, expect, it, vi } from "vitest";
import { HeliusProvider } from "../helius";

describe("HeliusProvider.getTokenHolders", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("aggregates token accounts by owner and calculates supply percentage", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        result: { value: [
          { address: "account-a-1", amount: "300", decimals: 6 },
          { address: "account-b", amount: "200", decimals: 6 },
          { address: "account-a-2", amount: "100", decimals: 6 },
        ] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        result: { value: { amount: "1000", decimals: 6 } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        result: { value: [
          { data: { parsed: { info: { owner: "wallet-a" } } } },
          { data: { parsed: { info: { owner: "wallet-b" } } } },
          { data: { parsed: { info: { owner: "wallet-a" } } } },
        ] },
      }), { status: 200 }));
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
  });
});
