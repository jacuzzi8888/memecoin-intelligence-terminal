import { describe, expect, it } from "vitest";
import { redactUrlCredentials } from "./index.js";

describe("redactUrlCredentials", () => {
  it("removes sensitive query values while preserving non-sensitive diagnostics", () => {
    expect(redactUrlCredentials("https://rpc.example.test/path?api-key=secret&network=mainnet")).toBe(
      "https://rpc.example.test/path?api-key=%5BREDACTED%5D&network=mainnet",
    );
  });

  it("does not echo malformed values", () => {
    expect(redactUrlCredentials("not a url?api-key=secret")).toBe("[INVALID_URL]");
  });
});
