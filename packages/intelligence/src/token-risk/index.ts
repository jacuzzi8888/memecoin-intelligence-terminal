export interface TokenRiskInput {
  tokenAgeMinutes: number | null;
  liquidityUsd: number | null;
  volume1hUsd: number | null;
  holderCount: number | null;
  bundledSupplyPct: number | null;
  deployerRisk: number | null;
  topHolderConcentration: number | null;
  lpLocked: boolean | null;
}

export interface TokenRiskFactor {
  factorName: string;
  impact: "risk" | "mitigation";
  value: number | string | boolean | null;
  contribution: number;
}

export interface TokenRiskResult {
  riskScore: number;
  confidence: number;
  rating: "low" | "moderate" | "high" | "critical";
  rulesetVersion: string;
  riskFactors: TokenRiskFactor[];
  mitigatingFactors: TokenRiskFactor[];
  missingFeatures: string[];
  calculatedAt: string;
}

const TOKEN_RISK_RULESET_VERSION = "token-risk-v0.1.0";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pushFactor(
  factors: TokenRiskFactor[],
  factorName: string,
  impact: "risk" | "mitigation",
  value: number | string | boolean | null,
  contribution: number,
) {
  factors.push({ factorName, impact, value, contribution });
}

function getRiskRating(riskScore: number): TokenRiskResult["rating"] {
  if (riskScore >= 75) return "critical";
  if (riskScore >= 55) return "high";
  if (riskScore >= 35) return "moderate";
  return "low";
}

export function calculateTokenRiskScore(input: TokenRiskInput): TokenRiskResult {
  const riskFactors: TokenRiskFactor[] = [];
  const mitigatingFactors: TokenRiskFactor[] = [];
  const missingFeatures: string[] = [];
  let riskScore = 45;
  let observedFeatures = 0;
  const totalFeatures = 7;

  if (input.tokenAgeMinutes !== null) {
    observedFeatures++;
    if (input.tokenAgeMinutes <= 5) {
      riskScore += 12;
      pushFactor(riskFactors, "token_age_minutes", "risk", input.tokenAgeMinutes, 12);
    } else if (input.tokenAgeMinutes >= 120) {
      riskScore -= 8;
      pushFactor(mitigatingFactors, "token_age_minutes", "mitigation", input.tokenAgeMinutes, -8);
    }
  } else {
    missingFeatures.push("token_age_minutes");
  }

  if (input.liquidityUsd !== null) {
    observedFeatures++;
    if (input.liquidityUsd < 10_000) {
      riskScore += 18;
      pushFactor(riskFactors, "liquidity_usd", "risk", input.liquidityUsd, 18);
    } else if (input.liquidityUsd >= 50_000) {
      riskScore -= 12;
      pushFactor(mitigatingFactors, "liquidity_usd", "mitigation", input.liquidityUsd, -12);
    }
  } else {
    missingFeatures.push("liquidity_usd");
  }

  if (input.volume1hUsd !== null) {
    observedFeatures++;
    if (input.volume1hUsd < 10_000) {
      riskScore += 8;
      pushFactor(riskFactors, "volume_1h_usd", "risk", input.volume1hUsd, 8);
    } else if (input.volume1hUsd >= 100_000) {
      riskScore -= 6;
      pushFactor(mitigatingFactors, "volume_1h_usd", "mitigation", input.volume1hUsd, -6);
    }
  } else {
    missingFeatures.push("volume_1h_usd");
  }

  if (input.holderCount !== null) {
    observedFeatures++;
    if (input.holderCount < 50) {
      riskScore += 8;
      pushFactor(riskFactors, "holder_count", "risk", input.holderCount, 8);
    } else if (input.holderCount >= 250) {
      riskScore -= 6;
      pushFactor(mitigatingFactors, "holder_count", "mitigation", input.holderCount, -6);
    }
  } else {
    missingFeatures.push("holder_count");
  }

  if (input.topHolderConcentration !== null) {
    observedFeatures++;
    if (input.topHolderConcentration >= 50) {
      riskScore += 14;
      pushFactor(riskFactors, "top_holder_concentration", "risk", input.topHolderConcentration, 14);
    } else if (input.topHolderConcentration <= 20) {
      riskScore -= 10;
      pushFactor(mitigatingFactors, "top_holder_concentration", "mitigation", input.topHolderConcentration, -10);
    }
  } else {
    missingFeatures.push("top_holder_concentration");
  }

  if (input.bundledSupplyPct !== null) {
    observedFeatures++;
    if (input.bundledSupplyPct >= 20) {
      riskScore += 12;
      pushFactor(riskFactors, "bundled_supply_pct", "risk", input.bundledSupplyPct, 12);
    } else if (input.bundledSupplyPct <= 5) {
      riskScore -= 6;
      pushFactor(mitigatingFactors, "bundled_supply_pct", "mitigation", input.bundledSupplyPct, -6);
    }
  } else {
    missingFeatures.push("bundled_supply_pct");
  }

  if (input.deployerRisk !== null) {
    observedFeatures++;
    if (input.deployerRisk >= 70) {
      riskScore += 16;
      pushFactor(riskFactors, "deployer_risk", "risk", input.deployerRisk, 16);
    } else if (input.deployerRisk <= 20) {
      riskScore -= 8;
      pushFactor(mitigatingFactors, "deployer_risk", "mitigation", input.deployerRisk, -8);
    }
  } else {
    missingFeatures.push("deployer_risk");
  }

  if (input.lpLocked === false) {
    riskScore += 14;
    pushFactor(riskFactors, "lp_locked", "risk", input.lpLocked, 14);
  } else if (input.lpLocked === true) {
    riskScore -= 10;
    pushFactor(mitigatingFactors, "lp_locked", "mitigation", input.lpLocked, -10);
  }

  const finalRiskScore = clamp(Math.round(riskScore), 0, 100);
  const confidence = clamp(Math.round((observedFeatures / totalFeatures) * 100) / 100, 0, 1);

  return {
    riskScore: finalRiskScore,
    confidence,
    rating: getRiskRating(finalRiskScore),
    rulesetVersion: TOKEN_RISK_RULESET_VERSION,
    riskFactors,
    mitigatingFactors,
    missingFeatures,
    calculatedAt: new Date().toISOString(),
  };
}

export { TOKEN_RISK_RULESET_VERSION };
