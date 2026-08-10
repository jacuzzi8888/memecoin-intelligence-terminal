import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  checkQueueConnection: vi.fn(),
}));

vi.mock("@memecoin/database", () => ({
  getDb: () => ({ execute: mocks.execute }),
}));

vi.mock("@memecoin/queue", () => ({
  checkQueueConnection: mocks.checkQueueConnection,
}));

import { healthRoute } from "./health.js";

describe("health route", () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  beforeEach(() => {
    mocks.execute.mockResolvedValue([]);
    mocks.checkQueueConnection.mockResolvedValue(true);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function requestHealth() {
    const app = Fastify();
    apps.push(app);
    await app.register(healthRoute, { prefix: "/api/v1" });
    return app.inject({ method: "GET", url: "/api/v1/health" });
  }

  it("reports healthy only when PostgreSQL and Redis are reachable", async () => {
    const response = await requestHealth();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "healthy",
      services: { database: "up", redis: "up", providers: "not_checked" },
    });
  });

  it.each([
    ["database", false, true],
    ["redis", true, false],
  ])("reports degraded when %s is unavailable", async (_service, databaseUp, redisUp) => {
    if (!databaseUp) mocks.execute.mockRejectedValueOnce(new Error("database unavailable"));
    mocks.checkQueueConnection.mockResolvedValueOnce(redisUp);

    const response = await requestHealth();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "degraded",
      services: {
        database: databaseUp ? "up" : "down",
        redis: redisUp ? "up" : "down",
      },
    });
  });
});
