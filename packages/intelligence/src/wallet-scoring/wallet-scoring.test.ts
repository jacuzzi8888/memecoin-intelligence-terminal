import { describe, it, expect } from "vitest";
import { WalletScorer } from "./index";
import type { WalletScoreInput } from "./index";

const baseInput: WalletScoreInput = {
  walletAddress: "TestWallet1111111111111111111111111111111",
  classification: "legitimate_trader",
  classificationConfidence: 0.85,
  totalTrades: 80,
  profitableTrades: 55,
  totalPnlSol: 35,
  avgHoldTimeMinutes: 180,
  uniqueTokensTraded: 25,
  winRate: 0.69,
  avgReturnPct: 0.12,
  lastTradeAt: Math.floor(Date.now() / 1000) - 3600,
  firstSeenAt: Math.floor(Date.now() / 1000) - 86400 * 90,
};

describe("WalletScorer", () => {
  const scorer = new WalletScorer();

  it("returns a score between 0 and 100", () => {
    const result = scorer.score(baseInput);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns the correct ruleset version", () => {
    const result = scorer.score(baseInput);
    expect(result.rulesetVersion).toBe("wallet-score-v0.1.0");
  });

  it("returns a confidence between 0 and 1", () => {
    const result = scorer.score(baseInput);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("qualifies strong legitimate wallets", () => {
    const result = scorer.score(baseInput);
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.tier).toBe("qualified");
    expect(scorer.isQualified(result)).toBe(true);
  });

  it("gives elite tier to top wallets", () => {
    const elite: WalletScoreInput = {
      ...baseInput,
      totalPnlSol: 200,
      winRate: 0.75,
      totalTrades: 150,
      avgHoldTimeMinutes: 1440,
      uniqueTokensTraded: 40,
    };
    const result = scorer.score(elite);
    expect(result.tier).toBe("elite");
  });

  it("disqualifies bots regardless of score", () => {
    const bot: WalletScoreInput = {
      ...baseInput,
      classification: "bot",
      totalPnlSol: 200,
      winRate: 0.8,
    };
    const result = scorer.score(bot);
    expect(result.tier).not.toBe("elite");
    expect(result.tier).not.toBe("qualified");
    expect(scorer.isQualified(result)).toBe(false);
  });

  it("disqualifies insiders regardless of score", () => {
    const insider: WalletScoreInput = {
      ...baseInput,
      classification: "insider",
      totalPnlSol: 200,
    };
    const result = scorer.score(insider);
    expect(scorer.isQualified(result)).toBe(false);
  });

  it("disqualifies bundlers regardless of score", () => {
    const bundler: WalletScoreInput = {
      ...baseInput,
      classification: "bundler",
      totalPnlSol: 200,
    };
    const result = scorer.score(bundler);
    expect(scorer.isQualified(result)).toBe(false);
  });

  it("rewards positive PnL", () => {
    const profitable: WalletScoreInput = { ...baseInput, totalPnlSol: 150 };
    const losing: WalletScoreInput = { ...baseInput, totalPnlSol: -50 };
    expect(scorer.score(profitable).score).toBeGreaterThan(scorer.score(losing).score);
  });

  it("rewards higher win rate", () => {
    const high: WalletScoreInput = { ...baseInput, winRate: 0.8 };
    const low: WalletScoreInput = { ...baseInput, winRate: 0.3 };
    expect(scorer.score(high).score).toBeGreaterThan(scorer.score(low).score);
  });

  it("rewards recent activity", () => {
    const recent: WalletScoreInput = {
      ...baseInput,
      lastTradeAt: Math.floor(Date.now() / 1000) - 60,
    };
    const stale: WalletScoreInput = {
      ...baseInput,
      lastTradeAt: Math.floor(Date.now() / 1000) - 86400 * 120,
    };
    expect(scorer.score(recent).score).toBeGreaterThan(scorer.score(stale).score);
  });

  it("includes calculatedAt timestamp", () => {
    const result = scorer.score(baseInput);
    expect(result.calculatedAt).toBeDefined();
    expect(new Date(result.calculatedAt).getTime()).toBeGreaterThan(0);
  });

  it("includes factors with contributions", () => {
    const result = scorer.score(baseInput);
    expect(result.factors.length).toBeGreaterThan(0);
    for (const factor of result.factors) {
      expect(Number.isFinite(factor.contribution)).toBe(true);
    }
  });
});