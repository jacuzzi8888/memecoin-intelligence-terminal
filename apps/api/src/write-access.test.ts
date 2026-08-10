import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const writeKey = "test-personal-write-key-that-is-at-least-32-characters";

vi.mock("@memecoin/config", () => ({
  getEnv: () => ({
    CORS_ORIGIN: "http://localhost:3000",
    ENABLE_DEV_INGESTION: false,
    NODE_ENV: "production",
    PERSONAL_APP_MODE: true,
    API_WRITE_TOKEN: writeKey,
    NEXTAUTH_SECRET: "test-nextauth-secret-that-is-long-enough",
    API_PORT: 4000,
    API_HOST: "127.0.0.1",
  }),
  verifyApiToken: () => null,
}));

describe("personal write access", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { buildApp } = await import("./index.js");
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects a mutation without the personal key", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/access/verify" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects an incorrect personal key", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/access/verify",
      headers: { "x-aegis-write-key": `${writeKey}-wrong` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("accepts the configured personal key", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/access/verify",
      headers: { "x-aegis-write-key": writeKey },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.unlocked).toBe(true);
  });

  it("leaves read-only routes public", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/access/verify" });
    expect(response.statusCode).not.toBe(401);
  });

  it("protects sensitive configuration reads", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/settings" });
    expect(response.statusCode).toBe(401);
  });
});
