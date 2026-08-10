import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@memecoin/database/schema";

const getDb = vi.fn();
const VALID_WALLET_ADDRESS = "GcETuWju2zbxZcEBf1iVH4XWpwfDjm2YUq6bFQnQwXVE";
const FLAGGED_WALLET_ADDRESS = "F4BFjm8zfVni6GKsEn5ryu2mTesFugctZUn8b2ZxGuud";
const enqueueWalletSyncJob = vi.fn().mockResolvedValue({
  queue: "wallet-sync",
  jobId: "wallet-job-1",
  walletAddress: VALID_WALLET_ADDRESS,
  trigger: "api",
});

vi.mock("@memecoin/database", async () => {
  const actual = await vi.importActual<typeof import("@memecoin/database")>("@memecoin/database");
  return {
    ...actual,
    getDb,
  };
});

vi.mock("@memecoin/indexer", async () => {
  const actual = await vi.importActual<typeof import("@memecoin/indexer")>("@memecoin/indexer");
  return {
    ...actual,
    enqueueWalletSyncJob,
  };
});

vi.mock("@memecoin/config", () => ({
  getEnv: () => ({
    CORS_ORIGIN: "http://localhost:3000",
    ENABLE_DEV_INGESTION: false,
    NODE_ENV: "test",
    API_PORT: 4000,
    API_HOST: "127.0.0.1",
  }),
}));

interface Fixtures {
  users?: Array<Record<string, unknown>>;
  watchlists?: Array<Record<string, unknown>>;
  watchlistItems?: Array<Record<string, unknown>>;
  wallets?: Array<Record<string, unknown>>;
  walletLabels?: Array<Record<string, unknown>>;
  walletPerformance?: Array<Record<string, unknown>>;
  walletPositions?: Array<Record<string, unknown>>;
  backgroundJobs?: Array<Record<string, unknown>>;
  userSettings?: Array<Record<string, unknown>>;
  notificationDestinations?: Array<Record<string, unknown>>;
  strategies?: Array<Record<string, unknown>>;
  strategyVersions?: Array<Record<string, unknown>>;
}

class FakeQuery implements PromiseLike<Array<Record<string, unknown>>> {
  private baseTable: unknown;

  constructor(
    private readonly fixtures: Fixtures,
  ) {}

  from(table: unknown) {
    this.baseTable = table;
    return this;
  }

  where() {
    return this;
  }

  orderBy() {
    return this;
  }

  limit() {
    return this;
  }

  then<TResult1 = Array<Record<string, unknown>>, TResult2 = never>(
    onfulfilled?: ((value: Array<Record<string, unknown>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    if (this.baseTable === schema.users) return this.fixtures.users ?? [];
    if (this.baseTable === schema.watchlists) return this.fixtures.watchlists ?? [];
    if (this.baseTable === schema.watchlistItems) return this.fixtures.watchlistItems ?? [];
    if (this.baseTable === schema.wallets) return this.fixtures.wallets ?? [];
    if (this.baseTable === schema.walletLabels) return this.fixtures.walletLabels ?? [];
    if (this.baseTable === schema.walletPerformance) return this.fixtures.walletPerformance ?? [];
    if (this.baseTable === schema.walletPositions) return this.fixtures.walletPositions ?? [];
    if (this.baseTable === schema.backgroundJobs) return this.fixtures.backgroundJobs ?? [];
    if (this.baseTable === schema.userSettings) return this.fixtures.userSettings ?? [];
    if (this.baseTable === schema.notificationDestinations) return this.fixtures.notificationDestinations ?? [];
    if (this.baseTable === schema.strategies) return this.fixtures.strategies ?? [];
    if (this.baseTable === schema.strategyVersions) return this.fixtures.strategyVersions ?? [];
    return [];
  }
}

function createFakeDb(fixtures: Fixtures) {
  return {
    select() {
      return new FakeQuery(fixtures);
    },
    insert() {
      return {
        values: vi.fn().mockResolvedValue(undefined),
      };
    },
    update() {
      return {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
    },
    delete() {
      return {
        where: vi.fn().mockResolvedValue(undefined),
      };
    },
  };
}

const fixtures: Fixtures = {
  users: [{
    id: "user-1",
    name: "Dev Admin",
    email: "admin@memecoin.dev",
    role: "admin",
  }],
  watchlists: [{
    id: "watchlist-1",
    userId: "user-1",
    name: "Alpha Radar",
    description: "High-conviction names",
    isDefault: false,
    createdAt: new Date("2026-07-26T12:00:00.000Z"),
    updatedAt: new Date("2026-07-26T12:00:00.000Z"),
  }],
  watchlistItems: [{
    id: "item-1",
    watchlistId: "watchlist-1",
    itemType: "token",
    itemAddress: "Mint111111111111111111111111111111111111111",
    note: "Fresh launch",
    addedAt: new Date("2026-07-26T12:05:00.000Z"),
  }],
  wallets: [{
    id: "wallet-1",
    address: VALID_WALLET_ADDRESS,
    label: "Fast Money",
    classification: "early_buyer",
    totalTrades: 12,
    firstSeenAt: new Date("2026-07-25T10:00:00.000Z"),
    lastSeenAt: new Date("2026-07-26T10:00:00.000Z"),
    metadata: { qualification: { isQualified: true, walletScore: 77 } },
  }, {
    id: "wallet-2",
    address: FLAGGED_WALLET_ADDRESS,
    label: "Automated Risk",
    classification: "bot",
    totalTrades: 140,
    firstSeenAt: new Date("2026-07-24T10:00:00.000Z"),
    lastSeenAt: new Date("2026-07-25T10:00:00.000Z"),
    metadata: { qualification: { isQualified: false, walletScore: 25 } },
  }],
  walletLabels: [{
    id: "label-1",
    walletId: "wallet-1",
    walletAddress: VALID_WALLET_ADDRESS,
    label: "early_buyer",
    confidence: "0.82",
    source: "wallet-classifier-v0.1.0",
    rulesetVersion: "wallet-classifier-v0.1.0",
    assignedAt: new Date("2026-07-26T10:00:00.000Z"),
  }],
  walletPerformance: [{
    id: "performance-1",
    walletId: "wallet-1",
    walletAddress: VALID_WALLET_ADDRESS,
    rulesetVersion: "wallet-classifier-v0.1.0",
    totalPnlUsd: "1500",
    realizedPnlUsd: "500",
    winRate: "0.65",
    totalTrades: 12,
    profitableTrades: 8,
    score: 77,
    calculatedAt: new Date("2026-07-26T10:05:00.000Z"),
  }, {
    id: "performance-2",
    walletId: "wallet-2",
    walletAddress: FLAGGED_WALLET_ADDRESS,
    rulesetVersion: "wallet-classifier-v0.1.0",
    totalPnlUsd: "-500",
    realizedPnlUsd: "-500",
    winRate: "0.2",
    totalTrades: 140,
    profitableTrades: 28,
    score: 25,
    calculatedAt: new Date("2026-07-25T10:05:00.000Z"),
  }],
  walletPositions: [{
    id: "position-1",
    walletId: "wallet-1",
    walletAddress: VALID_WALLET_ADDRESS,
    tokenAddress: "Mint111111111111111111111111111111111111111",
    amount: "1200",
    avgEntryPrice: "0.001",
    currentValueUsd: "1250",
    realizedPnlUsd: "100",
    unrealizedPnlUsd: "50",
    openedAt: new Date("2026-07-26T09:00:00.000Z"),
    status: "open",
  }],
  backgroundJobs: [{
    id: "job-1",
    queueName: "wallet-sync",
    jobType: "sync-wallet",
    bullJobId: "wallet-job-0",
    status: "completed",
    payload: { walletAddress: VALID_WALLET_ADDRESS },
    result: {},
    error: null,
    attempts: 1,
    maxAttempts: 3,
    startedAt: new Date("2026-07-26T10:01:00.000Z"),
    completedAt: new Date("2026-07-26T10:02:00.000Z"),
    createdAt: new Date("2026-07-26T10:00:00.000Z"),
  }],
  userSettings: [{
    userId: "user-1",
    preferences: { density: "compact" },
    notificationPrefs: { telegram: true },
    displayPrefs: { theme: "system" },
    tradingPrefs: { slippageBps: 100 },
  }],
  notificationDestinations: [{
    id: "destination-1",
    userId: "user-1",
    channel: "telegram",
    destination: "@dev_outbox",
    enabled: true,
    priorityMin: "high",
  }],
  strategies: [{
    id: "strategy-1",
    name: "Alpha Alert",
    description: "High score plus qualified wallets",
    isActive: "true",
    currentVersion: "v0.1.0",
  }],
  strategyVersions: [{
    id: "version-1",
    strategyId: "strategy-1",
    version: "v0.1.0",
    isActive: "true",
    config: { minScore: 70 },
    createdAt: new Date("2026-07-26T09:30:00.000Z"),
  }],
};

describe("API live surfaces routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    getDb.mockReturnValue(createFakeDb(fixtures));
    const { buildApp } = await import("../index.js");
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns watchlists with persisted items", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/watchlists",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data[0]).toMatchObject({
      id: "watchlist-1",
      name: "Alpha Radar",
      itemCount: 1,
    });
    expect(payload.data[0].items[0]).toMatchObject({
      itemType: "token",
      itemAddress: "Mint111111111111111111111111111111111111111",
    });
  });

  it("returns wallets with classification and performance data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/wallets?limit=10",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data[0]).toMatchObject({
      address: VALID_WALLET_ADDRESS,
      classification: "early_buyer",
    });
    expect(payload.data[0].latestLabel).toMatchObject({
      label: "early_buyer",
      confidence: 0.82,
    });
    expect(payload.data[0].performance).toMatchObject({
      score: 77,
      totalTrades: 12,
    });
    expect(payload.data[0].latestSyncJob).toMatchObject({
      status: "completed",
    });
    expect(payload.pagination).toMatchObject({ total: 2, scanned: 2 });
  });

  it("filters wallet intelligence by score, PnL, and legitimacy", async () => {
    const trustedResponse = await app.inject({
      method: "GET",
      url: "/api/v1/wallets?scoreBand=strong&pnlBand=profitable&legitimacy=trusted",
    });
    const trustedPayload = trustedResponse.json();

    expect(trustedResponse.statusCode).toBe(200);
    expect(trustedPayload.data).toHaveLength(1);
    expect(trustedPayload.data[0]).toMatchObject({
      address: VALID_WALLET_ADDRESS,
      classification: "early_buyer",
      performance: { score: 77, totalPnlUsd: 1500 },
    });
    expect(trustedPayload.pagination).toMatchObject({ total: 1, scanned: 2 });

    const flaggedResponse = await app.inject({
      method: "GET",
      url: "/api/v1/wallets?scoreBand=weak&pnlBand=losing&legitimacy=flagged",
    });
    const flaggedPayload = flaggedResponse.json();

    expect(flaggedResponse.statusCode).toBe(200);
    expect(flaggedPayload.data).toHaveLength(1);
    expect(flaggedPayload.data[0]).toMatchObject({
      address: FLAGGED_WALLET_ADDRESS,
      classification: "bot",
      performance: { score: 25, totalPnlUsd: -500 },
    });
  });

  it("returns settings, destinations, and strategies", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/settings",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.settings.notificationPrefs).toMatchObject({ telegram: true });
    expect(payload.data.destinations[0]).toMatchObject({
      channel: "telegram",
      priorityMin: "high",
    });
    expect(payload.data.strategies[0]).toMatchObject({
      name: "Alpha Alert",
      currentVersion: "v0.1.0",
    });
  });

  it("queues wallet sync through the shared wallet pipeline", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/wallets/${VALID_WALLET_ADDRESS}/sync`,
      headers: { "content-type": "application/json" },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(enqueueWalletSyncJob).toHaveBeenCalledWith(VALID_WALLET_ADDRESS, "api");
    expect(payload.data).toMatchObject({
      mode: "queue",
      jobId: "wallet-job-1",
    });
  });

  it("rejects invalid wallet sync addresses before queueing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/wallets/DevWallet111111111111111111111111111111/sync",
      headers: { "content-type": "application/json" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const payload = response.json();
    expect(payload).toMatchObject({
      success: false,
      error: "Invalid Solana wallet address",
    });
  });

  it("rejects known non-wallet program addresses before queueing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/wallets/11111111111111111111111111111111/sync",
      headers: { "content-type": "application/json" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const payload = response.json();
    expect(payload).toMatchObject({
      success: false,
      error: "Invalid Solana wallet address",
    });
  });
});
