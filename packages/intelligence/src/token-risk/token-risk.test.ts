import { describe, expect, it } from "vitest";
import { calculateTokenRiskScore } from "./index.js";

describe("calculateTokenRiskScore", () => {
  it("flags thin early launches as high risk", () => {
    const result = calculateTokenRiskScore({
      tokenAgeMinutes: 2,
      liquidityUsd: 2500,
      volume1hUsd: 3000,
      holderCount: 18,
      bundledSupplyPct: 28,
      deployerRisk: 82,
      topHolderConcentration: 61,
      lpLocked: false,
    });

    expect(result.riskScore).toBeGreaterThanOrEqual(75);
    expect(result.rating).toBe("critical");
    expect(result.riskFactors.length).toBeGreaterThan(0);
  });

  it("treats deeper, distributed tokens as lower risk", () => {
    const result = calculateTokenRiskScore({
      tokenAgeMinutes: 240,
      liquidityUsd: 125000,
      volume1hUsd: 220000,
      holderCount: 1200,
      bundledSupplyPct: 2,
      deployerRisk: 10,
      topHolderConcentration: 16,
      lpLocked: true,
    });

    expect(result.riskScore).toBeLessThan(35);
    expect(result.rating).toBe("low");
    expect(result.mitigatingFactors.length).toBeGreaterThan(0);
  });
});
