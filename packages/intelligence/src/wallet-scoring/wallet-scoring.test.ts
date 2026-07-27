import { describe, expect, it } from "vitest";
import { calculateWalletScore } from "./index.js";

describe("calculateWalletScore", () => {
  it("qualifies strong legitimate wallets", () => {
    const result = calculateWalletScore({
      classification: "legitimate_trader",
      classificationConfidence: 0.88,
      totalTrades: 120,
      winRate: 0.69,
      totalPnlUsd: 4200,
      avgHoldTimeMinutes: 180,
      uniqueTokensTraded: 18,
      avgTradesPerDay: 12,
      flags: [],
    });

    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.isQualified).toBe(true);
    expect(result.positiveFactors.length).toBeGreaterThan(0);
  });

  it("disqualifies risky bot-like wallets", () => {
    const result = calculateWalletScore({
      classification: "bot",
      classificationConfidence: 0.92,
      totalTrades: 250,
      winRate: 0.31,
      totalPnlUsd: -1400,
      avgHoldTimeMinutes: 2,
      uniqueTokensTraded: 240,
      avgTradesPerDay: 180,
      flags: ["multiple_trades_in_first_minute"],
    });

    expect(result.score).toBeLessThan(65);
    expect(result.isQualified).toBe(false);
    expect(result.negativeFactors.length).toBeGreaterThan(0);
  });
});
