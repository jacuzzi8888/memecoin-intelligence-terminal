import { describe, expect, it } from "vitest";
import { createApiToken, envSchema, verifyApiToken } from "./index.js";

describe("API token bridge", () => {
  it("round-trips a signed principal", () => {
    const token = createApiToken("trader@example.com", "test-secret", 60);
    expect(verifyApiToken(token, "test-secret")?.principal).toBe("trader@example.com");
  });

  it("rejects a token signed with another secret", () => {
    const token = createApiToken("trader@example.com", "test-secret", 60);
    expect(verifyApiToken(token, "wrong-secret")).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = createApiToken("trader@example.com", "test-secret", -1);
    expect(verifyApiToken(token, "test-secret")).toBeNull();
  });

  it("parses production feature flags from environment strings", () => {
    const env = envSchema.parse({
      NODE_ENV: "production",
      NEXTAUTH_SECRET: "production-secret-that-is-long-enough-123",
      ENABLE_DEV_AUTH: "false",
      ENABLE_DEV_INGESTION: "false",
      ENABLE_LIVE_TRADING: "false",
      ENABLE_PAID_PROVIDERS: "true",
      PERSONAL_APP_MODE: "true",
    });

    expect(env.ENABLE_DEV_AUTH).toBe(false);
    expect(env.ENABLE_DEV_INGESTION).toBe(false);
    expect(env.ENABLE_LIVE_TRADING).toBe(false);
    expect(env.ENABLE_PAID_PROVIDERS).toBe(true);
    expect(env.PERSONAL_APP_MODE).toBe(true);
  });
});
