import { describe, it, expect } from "vitest";
import { calculateSignalScore } from "./index";
import type { ScoreInput } from "./index";

const baseInput: ScoreInput = {
  tokenAge: 10,
  liquidityUsd: 50000,
  volume1hUsd: 200000,
  holderCount: 500,
  qualifiedWalletCount: 4,
  bundledSupplyPct: 8,
  deployerRisk: 15,
  topHolderConcentration: 30,
  lpLocked: true,
};

describe("calculateSignalScore", () => {
  it("returns a score between 0 and 100", () => {
    const result = calculateSignalScore(baseInput);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns the correct ruleset version", () => {
    const result = calculateSignalScore(baseInput);
    expect(result.rulesetVersion).toBe("token-signal-v0.1.0");
  });

  it("returns a confidence between 0 and 1", () => {
    const result = calculateSignalScore(baseInput);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("returns full confidence when all features are present", () => {
    const result = calculateSignalScore(baseInput);
    expect(result.confidence).toBe(1);
  });

  it("reduces confidence when features are missing", () => {
    const partial: ScoreInput = { ...baseInput, liquidityUsd: null, holderCount: null };
    const result = calculateSignalScore(partial);
    expect(result.confidence).toBeLessThan(1);
    expect(result.confidence).toBe(0.75);
  });

  it("tracks missing features", () => {
    const partial: ScoreInput = { ...baseInput, liquidityUsd: null, deployerRisk: null };
    const result = calculateSignalScore(partial);
    expect(result.missingFeatures).toContain("liquidity");
    expect(result.missingFeatures).toContain("deployer_risk");
  });

  it("returns positive factors for good inputs", () => {
    const result = calculateSignalScore(baseInput);
    expect(result.positiveFactors.length).toBeGreaterThan(0);
  });

  it("returns negative factors for bad inputs", () => {
    const bad: ScoreInput = { ...baseInput, topHolderConcentration: 70, bundledSupplyPct: 50, deployerRisk: 80 };
    const result = calculateSignalScore(bad);
    expect(result.negativeFactors.length).toBeGreaterThan(0);
  });

  it("handles all-null input gracefully", () => {
    const allNull: ScoreInput = {
      tokenAge: null, liquidityUsd: null, volume1hUsd: null, holderCount: null,
      qualifiedWalletCount: null, bundledSupplyPct: null, deployerRisk: null, topHolderConcentration: null, lpLocked: null,
    };
    const result = calculateSignalScore(allNull);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.missingFeatures.length).toBe(8);
  });

  it("gives higher score for early tokens with good liquidity", () => {
    const early = calculateSignalScore({ ...baseInput, tokenAge: 2, liquidityUsd: 5000, holderCount: 50 });
    const late = calculateSignalScore({ ...baseInput, tokenAge: 300, liquidityUsd: 5000, holderCount: 50 });
    expect(early.score).toBeGreaterThanOrEqual(late.score);
  });

  it("gives higher score for more qualified wallets", () => {
    const few = calculateSignalScore({ ...baseInput, qualifiedWalletCount: 0, liquidityUsd: 5000 });
    const many = calculateSignalScore({ ...baseInput, qualifiedWalletCount: 5, liquidityUsd: 5000 });
    expect(many.score).toBeGreaterThanOrEqual(few.score);
  });

  it("includes calculatedAt timestamp", () => {
    const result = calculateSignalScore(baseInput);
    expect(result.calculatedAt).toBeDefined();
    expect(new Date(result.calculatedAt).getTime()).toBeGreaterThan(0);
  });

  it("factor contributions are finite numbers", () => {
    const result = calculateSignalScore(baseInput);
    for (const factor of [...result.positiveFactors, ...result.negativeFactors]) {
      expect(Number.isFinite(factor.contribution)).toBe(true);
    }
  });
});
