import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHelius, resetHeliusRequestLimiterForTests } from "./helius-rate-limit.js";

describe("fetchHelius", () => {
  beforeEach(() => resetHeliusRequestLimiterForTests());

  afterEach(() => {
    vi.unstubAllGlobals();
    resetHeliusRequestLimiterForTests();
  });

  it("retries quota responses and returns the recovered response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchHelius("https://api.helius.xyz/example", undefined, {
      intervalMs: 0,
      maxRetries: 1,
      retryBaseMs: 0,
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchHelius("https://api.helius.xyz/example", undefined, {
      intervalMs: 0,
      maxRetries: 3,
      retryBaseMs: 0,
    });

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
