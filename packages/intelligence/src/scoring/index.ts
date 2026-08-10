export interface ScoreInput {
  tokenAge: number | null;
  liquidityUsd: number | null;
  volume1hUsd: number | null;
  holderCount: number | null;
  qualifiedWalletCount: number | null;
  bundledSupplyPct: number | null;
  deployerRisk: number | null;
  topHolderConcentration: number | null;
  lpLocked: boolean | null;
}

export interface FactorContribution {
  factorName: string;
  factorType: "positive" | "negative";
  rawValue: number | string | null;
  contribution: number;
  weight: number;
}

export interface ScoringResult {
  score: number;
  confidence: number;
  rulesetVersion: string;
  positiveFactors: FactorContribution[];
  negativeFactors: FactorContribution[];
  missingFeatures: string[];
  calculatedAt: string;
}

export type SignalPriority = "critical" | "high" | "medium";

const RULESET_VERSION = "token-signal-v0.2.0";
const MISSING_EVIDENCE_PRIOR = 50;

const WEIGHTS = {
  liquidity: 0.20,
  qualifiedWalletCount: 0.25,
  volume: 0.15,
  holderCount: 0.10,
  tokenAge: 0.10,
  topHolderConcentration: 0.10,
  bundledSupply: 0.05,
  deployerRisk: 0.05,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreLiquidity(value: number): { subScore: number; factor: FactorContribution } {
  let subScore: number;
  if (value >= 100000) subScore = 100;
  else if (value >= 50000) subScore = 80;
  else if (value >= 25000) subScore = 60;
  else if (value >= 10000) subScore = 40;
  else if (value >= 5000) subScore = 20;
  else subScore = 5;

  const contribution = (subScore / 100) * WEIGHTS.liquidity * 100;
  return {
    subScore,
    factor: {
      factorName: "liquidity",
      factorType: subScore >= 50 ? "positive" : "negative",
      rawValue: value,
      contribution: subScore >= 50 ? contribution : -Math.abs(contribution * 0.5),
      weight: WEIGHTS.liquidity,
    },
  };
}

function scoreQualifiedWallets(value: number): { subScore: number; factor: FactorContribution } {
  let subScore: number;
  if (value >= 5) subScore = 100;
  else if (value >= 3) subScore = 80;
  else if (value >= 2) subScore = 60;
  else if (value >= 1) subScore = 40;
  else subScore = 0;

  const contribution = (subScore / 100) * WEIGHTS.qualifiedWalletCount * 100;
  return {
    subScore,
    factor: {
      factorName: "qualified_wallet_count",
      factorType: subScore >= 50 ? "positive" : "negative",
      rawValue: value,
      contribution: subScore >= 50 ? contribution : 0,
      weight: WEIGHTS.qualifiedWalletCount,
    },
  };
}

function scoreVolume(value: number): { subScore: number; factor: FactorContribution } {
  let subScore: number;
  if (value >= 500000) subScore = 100;
  else if (value >= 200000) subScore = 80;
  else if (value >= 100000) subScore = 60;
  else if (value >= 50000) subScore = 40;
  else if (value >= 10000) subScore = 20;
  else subScore = 5;

  const contribution = (subScore / 100) * WEIGHTS.volume * 100;
  return {
    subScore,
    factor: {
      factorName: "volume_1h",
      factorType: subScore >= 50 ? "positive" : "negative",
      rawValue: value,
      contribution: subScore >= 50 ? contribution : -Math.abs(contribution * 0.3),
      weight: WEIGHTS.volume,
    },
  };
}

function scoreHolderCount(value: number): { subScore: number; factor: FactorContribution } {
  let subScore: number;
  if (value >= 1000) subScore = 100;
  else if (value >= 500) subScore = 80;
  else if (value >= 200) subScore = 60;
  else if (value >= 100) subScore = 40;
  else if (value >= 50) subScore = 20;
  else subScore = 5;

  const contribution = (subScore / 100) * WEIGHTS.holderCount * 100;
  return {
    subScore,
    factor: {
      factorName: "holder_count",
      factorType: subScore >= 50 ? "positive" : "negative",
      rawValue: value,
      contribution: subScore >= 50 ? contribution : -Math.abs(contribution * 0.3),
      weight: WEIGHTS.holderCount,
    },
  };
}

function scoreTokenAge(value: number): { subScore: number; factor: FactorContribution } {
  let subScore: number;
  if (value <= 5) subScore = 100;
  else if (value <= 15) subScore = 80;
  else if (value <= 30) subScore = 60;
  else if (value <= 60) subScore = 40;
  else if (value <= 120) subScore = 20;
  else subScore = 5;

  const contribution = (subScore / 100) * WEIGHTS.tokenAge * 100;
  return {
    subScore,
    factor: {
      factorName: "token_age",
      factorType: "positive",
      rawValue: value,
      contribution,
      weight: WEIGHTS.tokenAge,
    },
  };
}

function scoreConcentration(value: number): { subScore: number; factor: FactorContribution } {
  let subScore: number;
  if (value <= 20) subScore = 100;
  else if (value <= 30) subScore = 80;
  else if (value <= 40) subScore = 60;
  else if (value <= 50) subScore = 40;
  else if (value <= 60) subScore = 20;
  else subScore = 5;

  const contribution = (subScore / 100) * WEIGHTS.topHolderConcentration * 100;
  return {
    subScore,
    factor: {
      factorName: "top_holder_concentration",
      factorType: subScore >= 60 ? "positive" : "negative",
      rawValue: value,
      contribution: subScore >= 60 ? contribution * 0.5 : -Math.abs(contribution * 0.8),
      weight: WEIGHTS.topHolderConcentration,
    },
  };
}

function scoreBundledSupply(value: number): { subScore: number; factor: FactorContribution } {
  let subScore: number;
  if (value <= 5) subScore = 100;
  else if (value <= 10) subScore = 80;
  else if (value <= 20) subScore = 60;
  else if (value <= 30) subScore = 40;
  else subScore = 10;

  const contribution = (subScore / 100) * WEIGHTS.bundledSupply * 100;
  return {
    subScore,
    factor: {
      factorName: "bundled_supply",
      factorType: subScore >= 60 ? "positive" : "negative",
      rawValue: value,
      contribution: subScore >= 60 ? contribution * 0.3 : -Math.abs(contribution * 0.7),
      weight: WEIGHTS.bundledSupply,
    },
  };
}

function scoreDeployerRisk(value: number): { subScore: number; factor: FactorContribution } {
  const riskScore = 100 - value;
  const contribution = (riskScore / 100) * WEIGHTS.deployerRisk * 100;
  return {
    subScore: riskScore,
    factor: {
      factorName: "deployer_risk",
      factorType: riskScore >= 60 ? "positive" : "negative",
      rawValue: value,
      contribution: riskScore >= 60 ? contribution * 0.3 : -Math.abs(contribution * 0.7),
      weight: WEIGHTS.deployerRisk,
    },
  };
}

export function calculateSignalScore(input: ScoreInput): ScoringResult {
  const positiveFactors: FactorContribution[] = [];
  const negativeFactors: FactorContribution[] = [];
  const missingFeatures: string[] = [];
  let totalScore = 0;
  let totalWeight = 0;
  let dataCompleteness = 0;
  const featureCount = 8;

  const addFactor = (factor: FactorContribution, weight: number) => {
    (factor.contribution >= 0 ? positiveFactors : negativeFactors).push(factor);
    totalScore += factor.contribution;
    totalWeight += weight;
    dataCompleteness++;
  };

  if (input.liquidityUsd !== null) {
    const { factor } = scoreLiquidity(input.liquidityUsd);
    addFactor(factor, WEIGHTS.liquidity);
  } else {
    missingFeatures.push("liquidity");
  }

  if (input.qualifiedWalletCount !== null) {
    const { factor } = scoreQualifiedWallets(input.qualifiedWalletCount);
    addFactor(factor, WEIGHTS.qualifiedWalletCount);
  } else {
    missingFeatures.push("qualified_wallet_count");
  }

  if (input.volume1hUsd !== null) {
    const { factor } = scoreVolume(input.volume1hUsd);
    addFactor(factor, WEIGHTS.volume);
  } else {
    missingFeatures.push("volume_1h");
  }

  if (input.holderCount !== null) {
    const { factor } = scoreHolderCount(input.holderCount);
    addFactor(factor, WEIGHTS.holderCount);
  } else {
    missingFeatures.push("holder_count");
  }

  if (input.tokenAge !== null) {
    const { factor } = scoreTokenAge(input.tokenAge);
    addFactor(factor, WEIGHTS.tokenAge);
  } else {
    missingFeatures.push("token_age");
  }

  if (input.topHolderConcentration !== null) {
    const { factor } = scoreConcentration(input.topHolderConcentration);
    addFactor(factor, WEIGHTS.topHolderConcentration);
  } else {
    missingFeatures.push("top_holder_concentration");
  }

  if (input.bundledSupplyPct !== null) {
    const { factor } = scoreBundledSupply(input.bundledSupplyPct);
    addFactor(factor, WEIGHTS.bundledSupply);
  } else {
    missingFeatures.push("bundled_supply");
  }

  if (input.deployerRisk !== null) {
    const { factor } = scoreDeployerRisk(input.deployerRisk);
    addFactor(factor, WEIGHTS.deployerRisk);
  } else {
    missingFeatures.push("deployer_risk");
  }

  const confidence = clamp(dataCompleteness / featureCount, 0, 1);
  const observedQuality = totalWeight > 0 ? clamp(totalScore / totalWeight, 0, 100) : 0;
  // Sparse evidence is pulled toward neutral instead of being renormalized into a perfect score.
  const evidenceAdjustedScore = totalWeight > 0
    ? observedQuality * confidence + MISSING_EVIDENCE_PRIOR * (1 - confidence)
    : 0;
  const finalScore = clamp(Math.round(evidenceAdjustedScore), 0, 100);

  return {
    score: finalScore,
    confidence: Math.round(confidence * 100) / 100,
    rulesetVersion: RULESET_VERSION,
    positiveFactors,
    negativeFactors,
    missingFeatures,
    calculatedAt: new Date().toISOString(),
  };
}

export function getSignalPriority(score: number): SignalPriority {
  return score >= 80 ? "critical" : score >= 60 ? "high" : "medium";
}

export { RULESET_VERSION, WEIGHTS };
