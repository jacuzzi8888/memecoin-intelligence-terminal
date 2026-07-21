import { describe, it, expect } from "vitest";
import { WalletClassifier } from "./index";
import type { ClassificationInput } from "./index";

const baseInput: ClassificationInput = {
  walletAddress: "TestWallet1111111111111111111111111111111",
  totalTrades: 50,
  avgTradesPerDay: 5,
  uniqueTokensTraded: 20,
  avgHoldTimeMinutes: 120,
  firstSeenAt: 1700000000,
  lastTradeAt: 1700086400,
  fundedBy: null,
  fundedAt: null,
  firstBuyTime: 1700000600,
  tokenLaunchTime: 1700000000,
  tradesInFirst5Min: 2,
  tradesInFirst1Min: 1,
  avgTradeIntervalSeconds: 600,
  weekendTradeRatio: 0.3,
  nighttimeTradeRatio: 0.2,
  totalVolumeSol: 50,
  largestTxRatio: 0.15,
  sameTokenTrades: 5,
};

describe("WalletClassifier", () => {
  const classifier = new WalletClassifier();

  it("returns the correct ruleset version", () => {
    const result = classifier.classify(baseInput);
    expect(result.rulesetVersion).toBe("wallet-classifier-v0.1.0");
  });

  it("returns a confidence between 0 and 1", () => {
    const result = classifier.classify(baseInput);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("flags high-frequency traders as bots", () => {
    const botInput: ClassificationInput = {
      ...baseInput,
      totalTrades: 150,
      avgTradesPerDay: 100,
      avgTradeIntervalSeconds: 30,
      weekendTradeRatio: 0.05,
      nighttimeTradeRatio: 0.9,
      largestTxRatio: 0.6,
    };
    const result = classifier.classify(botInput);
    expect(result.flags).toContain("high_frequency_trading");
    expect(result.flags).toContain("sub_minute_intervals");
  });

  it("flags early buyers", () => {
    const earlyInput: ClassificationInput = {
      ...baseInput,
      firstBuyTime: 1700000005,
      tokenLaunchTime: 1700000000,
    };
    const result = classifier.classify(earlyInput);
    expect(result.flags).toContain("bought_within_10s_of_launch");
  });

  it("flags bundlers with multiple trades in first minute", () => {
    const bundlerInput: ClassificationInput = {
      ...baseInput,
      tradesInFirst1Min: 5,
      tradesInFirst5Min: 10,
      avgTradeIntervalSeconds: 5,
    };
    const result = classifier.classify(bundlerInput);
    expect(result.flags).toContain("multiple_trades_in_first_minute");
  });

  it("flags whales with high volume", () => {
    const whaleInput: ClassificationInput = {
      ...baseInput,
      totalVolumeSol: 2000,
    };
    const result = classifier.classify(whaleInput);
    expect(result.flags).toContain("high_volume_trader");
  });

  it("flags diamond hands with long hold times", () => {
    const diamondInput: ClassificationInput = {
      ...baseInput,
      avgHoldTimeMinutes: 2880,
    };
    const result = classifier.classify(diamondInput);
    expect(result.flags).toContain("long_hold_times");
  });

  it("flags paper hands with short hold times", () => {
    const paperInput: ClassificationInput = {
      ...baseInput,
      avgHoldTimeMinutes: 2,
      totalTrades: 30,
    };
    const result = classifier.classify(paperInput);
    expect(result.flags).toContain("very_short_hold_times");
  });

  it("classifies a normal wallet as legitimate_trader", () => {
    const normalInput: ClassificationInput = {
      ...baseInput,
      fundedBy: null,
      fundedAt: null,
      firstBuyTime: 1700100000,
      tokenLaunchTime: 1700000000,
      avgTradesPerDay: 5,
      avgTradeIntervalSeconds: 600,
      avgHoldTimeMinutes: 120,
      totalVolumeSol: 30,
      largestTxRatio: 0.15,
      tradesInFirst1Min: 1,
      tradesInFirst5Min: 2,
    };
    const result = classifier.classify(normalInput);
    expect(result.classification).toBe("legitimate_trader");
  });

  it("includes classifiedAt timestamp", () => {
    const result = classifier.classify(baseInput);
    expect(result.classifiedAt).toBeDefined();
    expect(new Date(result.classifiedAt).getTime()).toBeGreaterThan(0);
  });

  it("calculateBotScore returns 0-100", () => {
    const score = classifier.calculateBotScore(baseInput);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("calculateInsiderScore returns 0-100", () => {
    const score = classifier.calculateInsiderScore(baseInput);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("calculateBundlerScore returns 0-100", () => {
    const score = classifier.calculateBundlerScore(baseInput);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});