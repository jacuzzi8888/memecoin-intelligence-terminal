import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@memecoin/database/schema";

const getDb = vi.fn();

vi.mock("@memecoin/database", async () => {
  const actual = await vi.importActual<typeof import("@memecoin/database")>("@memecoin/database");
  return {
    ...actual,
    getDb,
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
  tokens?: Array<Record<string, unknown>>;
  wallets?: Array<Record<string, unknown>>;
  tokenSnapshots?: Array<Record<string, unknown>>;
  tokenLaunches?: Array<Record<string, unknown>>;
  rawProviderEvents?: Array<Record<string, unknown>>;
  tokenSignals?: Array<Record<string, unknown>>;
  signalFactors?: Array<Record<string, unknown>>;
  scannerResults?: Array<Record<string, unknown>>;
  alertsResults?: Array<Record<string, unknown>>;
  alertDeliveries?: Array<Record<string, unknown>>;
  processingFailures?: Array<Record<string, unknown>>;
}

class FakeQuery implements PromiseLike<Array<Record<string, unknown>>> {
  private baseTable: unknown;
  private joins: unknown[] = [];
  private limitValue: number | undefined;
  private offsetValue = 0;

  constructor(
    private readonly fixtures: Fixtures,
    private readonly selection?: Record<string, unknown>,
  ) {}

  from(table: unknown) {
    this.baseTable = table;
    return this;
  }

  leftJoin(table: unknown) {
    this.joins.push(table);
    return this;
  }

  where() {
    return this;
  }

  orderBy() {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  offset(value: number) {
    this.offsetValue = value;
    return this;
  }

  then<TResult1 = Array<Record<string, unknown>>, TResult2 = never>(
    onfulfilled?: ((value: Array<Record<string, unknown>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    let rows = this.resolveRows();
    rows = rows.slice(this.offsetValue);
    if (this.limitValue !== undefined) {
      rows = rows.slice(0, this.limitValue);
    }
    return rows;
  }

  private resolveRows() {
    const selectionKeys = Object.keys(this.selection ?? {});

    if (this.baseTable === schema.tokens) {
      if (selectionKeys.includes("count")) {
        return [{ count: this.fixtures.tokens?.length ?? 0 }];
      }

      return this.fixtures.tokens ?? [];
    }

    if (this.baseTable === schema.wallets) {
      if (selectionKeys.includes("count")) {
        return [{ count: this.fixtures.wallets?.length ?? 0 }];
      }

      return this.fixtures.wallets ?? [];
    }

    if (this.baseTable === schema.tokenSnapshots) {
      return this.fixtures.tokenSnapshots ?? [];
    }

    if (this.baseTable === schema.tokenLaunches) {
      return this.fixtures.tokenLaunches ?? [];
    }

    if (this.baseTable === schema.rawProviderEvents) {
      return this.fixtures.rawProviderEvents ?? [];
    }

    if (this.baseTable === schema.signalFactors) {
      return this.fixtures.signalFactors ?? [];
    }

    if (this.baseTable === schema.alerts) {
      if (selectionKeys.includes("count")) {
        return [{ count: this.fixtures.alertsResults?.length ?? 0 }];
      }

      return this.fixtures.alertsResults ?? [];
    }

    if (this.baseTable === schema.alertDeliveries) {
      return this.fixtures.alertDeliveries ?? [];
    }

    if (this.baseTable === schema.processingFailures) {
      return this.fixtures.processingFailures ?? [];
    }

    if (this.baseTable === schema.signals) {
      if (selectionKeys.includes("count")) {
        return [{ count: this.fixtures.scannerResults?.length ?? 0 }];
      }

      if (this.joins.includes(schema.tokens)) {
        return this.fixtures.scannerResults ?? [];
      }

      return this.fixtures.tokenSignals ?? [];
    }

    return [];
  }
}

function createFakeDb(fixtures: Fixtures) {
  return {
    select(selection?: Record<string, unknown>) {
      return new FakeQuery(fixtures, selection);
    },
  };
}

const tokenAddress = "Mint111111111111111111111111111111111111111";
const snapshotAt = new Date("2026-07-26T10:00:00.000Z");
const launchedAt = new Date("2026-07-26T09:55:00.000Z");
const detectedAt = new Date("2026-07-26T09:58:00.000Z");
const firstSeenAt = new Date("2026-07-26T09:55:30.000Z");

const fixtures: Fixtures = {
  tokens: [{
    id: "token-1",
    address: tokenAddress,
    symbol: "TEST",
    name: "Test Token",
    decimals: 9,
    isVerified: false,
    firstSeenAt,
  }],
  wallets: [{
    id: "wallet-1",
    address: "Wallet11111111111111111111111111111111111111",
  }],
  tokenSnapshots: [{
    tokenId: "token-1",
    tokenAddress,
    marketCapUsd: "250000",
    priceUsd: "0.25",
    volume1hUsd: "50000",
    volume24hUsd: "125000",
    liquidityUsd: "90000",
    holderCount: 123,
    priceChange1h: "4.2",
    priceChange24h: "12.4",
    snapshotAt,
  }],
  tokenLaunches: [{
    tokenId: "token-1",
    tokenAddress,
    deployerAddress: "Deployer11111111111111111111111111111111111",
    launchedAt,
    initialLiquidityUsd: "10000",
    launchProgram: "Token Program",
    metadata: {
      discoveryProvider: "helius",
      marketDataProvider: "birdeye",
    },
  }],
  rawProviderEvents: [
    {
      id: "raw-1",
      processingStatus: "processed",
    },
    {
      id: "raw-2",
      processingStatus: "pending",
    },
    {
      id: "raw-3",
      processingStatus: "failed",
    },
  ],
  tokenSignals: [{
    id: "signal-1",
    tokenAddress,
    tokenId: "token-1",
    signalScore: 88,
    confidence: "0.91",
    rulesetVersion: "token-signal-v0.1.0",
    priority: "critical",
    metadata: {
      discoveryProvider: "helius",
      marketDataProvider: "birdeye",
      snapshotAvailable: true,
    },
    detectedAt,
  }],
  signalFactors: [
    { signalId: "signal-1", factorType: "positive", factorName: "liquidity", rawValue: "90000", contribution: "15" },
    { signalId: "signal-1", factorType: "negative", factorName: "concentration", rawValue: "40", contribution: "-5" },
  ],
  scannerResults: [{
    id: "signal-1",
    tokenAddress,
    signalScore: 88,
    confidence: "0.91",
    priority: "critical",
    rulesetVersion: "token-signal-v0.1.0",
    metadata: {
      discoveryProvider: "helius",
      marketDataProvider: "birdeye",
      snapshotAvailable: true,
    },
    detectedAt,
    tokenSymbol: "TEST",
    tokenName: "Test Token",
    tokenFirstSeenAt: firstSeenAt,
  }],
  alertsResults: [{
    id: "alert-1",
    tokenAddress,
    priority: "critical",
    title: "New Token: TEST",
    message: "Signal generated",
    signalScore: 88,
    webDeepLink: `http://localhost:3000/tokens/${tokenAddress}`,
    telegramDeepLink: `https://t.me/example?start=${tokenAddress}`,
    status: "pending",
    triggeredAt: detectedAt,
    strategyName: "Alpha Alert",
    signalMetadata: {
      discoveryProvider: "helius",
      marketDataProvider: "birdeye",
      snapshotAvailable: true,
    },
    detectedAt,
    tokenFirstSeenAt: firstSeenAt,
  }],
  alertDeliveries: [
    {
      id: "delivery-1",
      alertId: "alert-1",
      status: "delivered",
    },
    {
      id: "delivery-2",
      alertId: "alert-2",
      status: "failed",
    },
  ],
  processingFailures: [
    {
      id: "failure-1",
      isResolved: "false",
    },
    {
      id: "failure-2",
      isResolved: "true",
    },
  ],
};

describe("API metadata routes", () => {
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

  it("returns source metadata on scanner rows", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/scanner?limit=5",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.success).toBe(true);
    expect(payload.data[0]).toMatchObject({
      tokenAddress,
      dataSource: "birdeye",
      dataFreshness: snapshotAt.toISOString(),
    });
    expect(payload.pagination.total).toBe(1);
  });

  it("returns source metadata on token detail responses", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/tokens/${tokenAddress}`,
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({
      dataSource: "birdeye",
      dataFreshness: snapshotAt.toISOString(),
    });
    expect(payload.data.intelligence.score).toBe(88);
    expect(payload.data.launch.launchProgram).toBe("Token Program");
  });

  it("returns source metadata on alert responses", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/alerts?limit=5",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.success).toBe(true);
    expect(payload.data[0]).toMatchObject({
      id: "alert-1",
      dataSource: "birdeye",
      dataFreshness: snapshotAt.toISOString(),
    });
  });

  it("returns live dashboard pipeline and recent activity data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard?signalLimit=5&alertLimit=5",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload.success).toBe(true);
    expect(payload.data.overview).toMatchObject({
      tokens: 1,
      signals: 1,
      alerts: 1,
      wallets: 1,
    });
    expect(payload.data.pipeline).toMatchObject({
      rawEventsPending: 1,
      rawEventsFailed: 1,
      alertsPending: 1,
      alertsDelivered: 0,
      deliveriesDelivered: 1,
      deliveriesFailed: 1,
      failuresOpen: 1,
    });
    expect(payload.data.system).toMatchObject({
      environment: "test",
      version: "0.1.0",
      dataSourceSummary: "birdeye",
    });
    expect(payload.data.recentSignals[0]).toMatchObject({
      tokenAddress,
      dataSource: "birdeye",
      dataFreshness: snapshotAt.toISOString(),
    });
    expect(payload.data.recentAlerts[0]).toMatchObject({
      id: "alert-1",
      dataSource: "birdeye",
      dataFreshness: snapshotAt.toISOString(),
    });
  });
});
