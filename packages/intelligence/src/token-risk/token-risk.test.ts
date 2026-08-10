import { describe, it, expect } from "vitest";
import { TokenRiskScorer } from "./index";
import type { TokenRiskInput } from "./index";

const baseInput: TokenRiskInput = {
  tokenAddress: "TestToken111111111111111111111111111111111",
  tokenAgeMinutes: 60,
  liquidityUsd: 50000,
  volume24hUsd: 100000,
  holderCount: 350,
  topHolderConcentrationPct: 25,
  qualifiedWalletCount: 4,
  bundledSupplyPct: 8,
  deployerRisk: 15,
  lpLocked: true,
  mintAuthorityRevoked: true,
  freezeAuthorityRevoked: true,
};

describe("TokenRiskScorer", () => {
  const scorer = new TokenRiskScorer();

  it("returns a score between 0 and 100", () => {
    const result = scorer.score(baseInput);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns the correct ruleset version", () => {
    const result = scorer.score(baseInput);
    expect(result.rulesetVersion).toBe("token-risk-v0.2.0");
  });

  it("returns low risk for a safe token", () => {
    const result = scorer.score(baseInput);
    expect(result.riskLevel).toBe("low");
  });

  it("returns critical risk for a dangerous token", () => {
    const dangerous: TokenRiskInput = {
      ...baseInput,
      liquidityUsd: 2000,
      topHolderConcentrationPct: 75,
      deployerRisk: 90,
      bundledSupplyPct: 40,
      tokenAgeMinutes: 5,
      mintAuthorityRevoked: false,
      freezeAuthorityRevoked: false,
    };
    const result = scorer.score(dangerous);
    expect(result.riskLevel).toBe("critical");
    expect(result.score).toBeGreaterThan(70);
  });

  it("rewards high liquidity", () => {
    const safe = scorer.score({ ...baseInput, liquidityUsd: 200000 });
    const risky = scorer.score({ ...baseInput, liquidityUsd: 2000 });
    expect(safe.score).toBeLessThan(risky.score);
  });

  it("penalizes unrevoked mint authority", () => {
    const revoked = scorer.score({ ...baseInput, mintAuthorityRevoked: true });
    const notRevoked = scorer.score({ ...baseInput, mintAuthorityRevoked: false });
    expect(notRevoked.score).toBeGreaterThan(revoked.score);
  });

  it("penalizes unrevoked freeze authority", () => {
    const revoked = scorer.score({ ...baseInput, freezeAuthorityRevoked: true });
    const notRevoked = scorer.score({ ...baseInput, freezeAuthorityRevoked: false });
    expect(notRevoked.score).toBeGreaterThan(revoked.score);
  });

  it("penalizes high holder concentration", () => {
    const diverse = scorer.score({ ...baseInput, topHolderConcentrationPct: 15 });
    const concentrated = scorer.score({ ...baseInput, topHolderConcentrationPct: 70 });
    expect(concentrated.score).toBeGreaterThan(diverse.score);
  });

  it("penalizes high bundle supply", () => {
    const low = scorer.score({ ...baseInput, bundledSupplyPct: 3 });
    const high = scorer.score({ ...baseInput, bundledSupplyPct: 40 });
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("tracks missing features", () => {
    const partial: TokenRiskInput = {
      ...baseInput,
      liquidityUsd: null,
      topHolderConcentrationPct: null,
      mintAuthorityRevoked: null,
    };
    const result = scorer.score(partial);
    expect(result.missingFeatures).toContain("liquidity");
    expect(result.missingFeatures).toContain("topHolderConcentration");
    expect(result.missingFeatures).toContain("mintAuthority");
  });

  it("includes calculatedAt timestamp", () => {
    const result = scorer.score(baseInput);
    expect(result.calculatedAt).toBeDefined();
    expect(new Date(result.calculatedAt).getTime()).toBeGreaterThan(0);
  });
});
