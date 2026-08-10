import { describe, expect, it } from "vitest";
import { replayStrategy, type BacktestSnapshot } from "./index.js";
import type { StrategyConfig } from "../strategy-engine/index.js";

const strategy: StrategyConfig = {
  id: "replay-strategy",
  name: "Replay Strategy",
  description: "Market-only replay",
  version: "v1",
  isActive: true,
  alertThreshold: 50,
  cooldownMinutes: 60,
  conditions: [
    { field: "liquidity_usd", operator: "gte", value: 10_000, weight: 1 },
  ],
  channels: ["web"],
  priority: "high",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function snapshot(minutes: number, priceUsd: number): BacktestSnapshot {
  const firstSeenAt = new Date(Date.UTC(2026, 7, 1, 0, 0));
  return {
    tokenAddress: "token-1",
    snapshotAt: new Date(firstSeenAt.getTime() + minutes * 60_000),
    firstSeenAt,
    priceUsd,
    marketCapUsd: priceUsd * 1_000_000,
    volume1hUsd: 50_000,
    volume24hUsd: 250_000,
    liquidityUsd: 25_000,
    holderCount: 250,
    walletCount: null,
    qualifiedWalletCount: null,
    cohortEntryCount: null,
    cohortQualityScore: null,
    walletEvidenceAvailable: false,
  };
}

describe("replayStrategy", () => {
  it("replays entries, cooldowns, and completed outcomes", () => {
    const result = replayStrategy(
      strategy,
      [snapshot(0, 1), snapshot(30, 1.2), snapshot(60, 0.8), snapshot(120, 1.5), snapshot(1_440, 1.5)],
      { horizonMinutes: 1_440, maxEntriesPerToken: 2 },
    );

    expect(result.entries).toBe(2);
    expect(result.completed).toBe(1);
    expect(result.pending).toBe(1);
    expect(result.winRate).toBe(1);
    expect(result.averageReturnPct).toBeCloseTo(50, 5);
  });

  it("reports strategy fields that cannot be replayed from token snapshots", () => {
    const result = replayStrategy(
      {
        ...strategy,
        alertThreshold: 75,
        conditions: [
          ...strategy.conditions,
          { field: "qualified_wallet_count", operator: "gte", value: 1, weight: 1 },
        ],
      },
      [snapshot(0, 1), snapshot(1_440, 1.1)],
      { horizonMinutes: 1_440, maxEntriesPerToken: 1 },
    );

    expect(result.coverage.unavailableFields).toContain("qualified_wallet_count");
    expect(result.entries).toBe(0);
  });

  it("replays wallet conditions when historical wallet evidence exists", () => {
    const result = replayStrategy(
      {
        ...strategy,
        alertThreshold: 100,
        conditions: [
          { field: "qualified_wallet_count", operator: "gte", value: 1, weight: 1 },
        ],
      },
      [
        { ...snapshot(0, 1), walletCount: 2, qualifiedWalletCount: 1, walletEvidenceAvailable: true },
        { ...snapshot(1_440, 1.2), walletCount: 2, qualifiedWalletCount: 1, walletEvidenceAvailable: true },
      ],
      { horizonMinutes: 1_440, maxEntriesPerToken: 1 },
    );

    expect(result.entries).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.coverage.unavailableFields).not.toContain("qualified_wallet_count");
    expect(result.coverage.walletEvidenceCoveragePct).toBe(100);
  });
});
