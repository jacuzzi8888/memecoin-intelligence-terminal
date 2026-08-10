import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, clearPersonalWriteKey, getPersonalWriteKey, setPersonalWriteKey } from "./api-client";

describe("personal API client", () => {
  const values = new Map<string, string>();
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

  beforeEach(() => {
    values.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("stores and clears the browser-only write key", () => {
    setPersonalWriteKey("secret");
    expect(getPersonalWriteKey()).toBe("secret");
    clearPersonalWriteKey();
    expect(getPersonalWriteKey()).toBeNull();
  });

  it("adds the key to requests without exposing it in the URL", async () => {
    setPersonalWriteKey("secret");
    await apiFetch("https://api.example.test/write", { method: "POST" });
    await apiFetch("https://api.example.test/read");

    const mutationHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    const readHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(mutationHeaders.get("x-aegis-write-key")).toBe("secret");
    expect(readHeaders.get("x-aegis-write-key")).toBe("secret");
  });
});
