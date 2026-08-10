import { logger } from "@memecoin/logger";

const log = logger("token-risk-scoring");

export interface TokenRiskInput {
  tokenAddress: string;
  tokenAgeMinutes: number;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  holderCount: number | null;
  topHolderConcentrationPct: number | null;
  qualifiedWalletCount: number | null;
  bundledSupplyPct: number | null;
  deployerRisk: number | null;
  lpLocked: boolean | null;
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
}

export interface TokenRiskResult {
  score: number;
  riskLevel: "unknown" | "low" | "medium" | "high" | "critical";
  confidence: number;
  rulesetVersion: string;
  factors: Array<{
    name: string;
    type: "positive" | "negative";
    rawValue: string | number | boolean | null;
    contribution: number;
    weight: number;
  }>;
  missingFeatures: string[];
  calculatedAt: string;
}

const RULESET_VERSION = "token-risk-v0.2.0";

const WEIGHTS = {
  liquidity: 0.15,
  holderConcentration: 0.15,
  deployerRisk: 0.15,
  bundleRisk: 0.10,
  contractRisk: 0.15,
  lpRisk: 0.10,
  ageRisk: 0.10,
  volumeQuality: 0.05,
  qualifiedWallets: 0.05,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class TokenRiskScorer {
  score(input: TokenRiskInput): TokenRiskResult {
    const factors: TokenRiskResult["factors"] = [];
    const missing: string[] = [];
    let totalRisk = 0;
    let dataPoints = 0;

    if (input.liquidityUsd !== null) {
      let liqScore = 0;
      if (input.liquidityUsd < 5000) liqScore = 100;
      else if (input.liquidityUsd < 15000) liqScore = 70;
      else if (input.liquidityUsd < 50000) liqScore = 40;
      else if (input.liquidityUsd < 100000) liqScore = 20;
      else liqScore = 5;

      const contribution = (liqScore / 100) * WEIGHTS.liquidity * 100;
      totalRisk += contribution;
      factors.push({
        name: "liquidity_risk",
        type: liqScore > 40 ? "negative" : "positive",
        rawValue: input.liquidityUsd,
        contribution,
        weight: WEIGHTS.liquidity,
      });
      dataPoints++;
    } else {
      missing.push("liquidity");
    }

    if (input.topHolderConcentrationPct !== null) {
      let concentrationRisk = 0;
      if (input.topHolderConcentrationPct > 60) concentrationRisk = 100;
      else if (input.topHolderConcentrationPct > 50) concentrationRisk = 70;
      else if (input.topHolderConcentrationPct > 40) concentrationRisk = 50;
      else if (input.topHolderConcentrationPct > 30) concentrationRisk = 30;
      else concentrationRisk = 10;

      const contribution = (concentrationRisk / 100) * WEIGHTS.holderConcentration * 100;
      totalRisk += contribution;
      factors.push({
        name: "holder_concentration",
        type: concentrationRisk > 50 ? "negative" : "positive",
        rawValue: input.topHolderConcentrationPct,
        contribution,
        weight: WEIGHTS.holderConcentration,
      });
      dataPoints++;
    } else {
      missing.push("topHolderConcentration");
    }

    if (input.deployerRisk !== null) {
      const deployerRiskNormalized = clamp(input.deployerRisk, 0, 100);
      const contribution = (deployerRiskNormalized / 100) * WEIGHTS.deployerRisk * 100;
      totalRisk += contribution;
      factors.push({
        name: "deployer_risk",
        type: deployerRiskNormalized > 50 ? "negative" : "positive",
        rawValue: input.deployerRisk,
        contribution,
        weight: WEIGHTS.deployerRisk,
      });
      dataPoints++;
    } else {
      missing.push("deployerRisk");
    }

    if (input.bundledSupplyPct !== null) {
      let bundleRisk = 0;
      if (input.bundledSupplyPct > 30) bundleRisk = 100;
      else if (input.bundledSupplyPct > 20) bundleRisk = 70;
      else if (input.bundledSupplyPct > 10) bundleRisk = 50;
      else if (input.bundledSupplyPct > 5) bundleRisk = 30;
      else bundleRisk = 10;

      const contribution = (bundleRisk / 100) * WEIGHTS.bundleRisk * 100;
      totalRisk += contribution;
      factors.push({
        name: "bundle_risk",
        type: bundleRisk > 50 ? "negative" : "positive",
        rawValue: input.bundledSupplyPct,
        contribution,
        weight: WEIGHTS.bundleRisk,
      });
      dataPoints++;
    } else {
      missing.push("bundledSupplyPct");
    }

    let contractRiskScore = 0;
    let contractDataPoints = 0;
    if (input.mintAuthorityRevoked !== null) {
      contractRiskScore += input.mintAuthorityRevoked ? 0 : 100;
      contractDataPoints++;
    } else {
      missing.push("mintAuthority");
    }
    if (input.freezeAuthorityRevoked !== null) {
      contractRiskScore += input.freezeAuthorityRevoked ? 0 : 100;
      contractDataPoints++;
    } else {
      missing.push("freezeAuthority");
    }
    if (contractDataPoints > 0) {
      contractRiskScore /= contractDataPoints;
      const contractContribution = (contractRiskScore / 100) * WEIGHTS.contractRisk * 100;
      totalRisk += contractContribution;
      factors.push({
        name: "contract_risk",
        type: contractRiskScore >= 50 ? "negative" : "positive",
        rawValue: `mint:${input.mintAuthorityRevoked ?? "?"}|freeze:${input.freezeAuthorityRevoked ?? "?"}`,
        contribution: contractContribution,
        weight: WEIGHTS.contractRisk,
      });
      dataPoints++;
    }

    if (input.lpLocked !== null) {
      const lpRisk = input.lpLocked ? 5 : 100;
      const contribution = (lpRisk / 100) * WEIGHTS.lpRisk * 100;
      totalRisk += contribution;
      factors.push({
        name: "lp_lock_risk",
        type: input.lpLocked ? "positive" : "negative",
        rawValue: input.lpLocked,
        contribution,
        weight: WEIGHTS.lpRisk,
      });
      dataPoints++;
    } else {
      missing.push("lpLocked");
    }

    if (input.tokenAgeMinutes > 0) {
      let ageRisk = 0;
      if (input.tokenAgeMinutes < 30) ageRisk = 100;
      else if (input.tokenAgeMinutes < 60) ageRisk = 80;
      else if (input.tokenAgeMinutes < 240) ageRisk = 60;
      else if (input.tokenAgeMinutes < 1440) ageRisk = 40;
      else ageRisk = 20;

      const contribution = (ageRisk / 100) * WEIGHTS.ageRisk * 100;
      totalRisk += contribution;
      factors.push({
        name: "age_risk",
        type: ageRisk > 60 ? "negative" : "positive",
        rawValue: input.tokenAgeMinutes,
        contribution,
        weight: WEIGHTS.ageRisk,
      });
      dataPoints++;
    }

    if (input.volume24hUsd !== null && input.liquidityUsd !== null && input.liquidityUsd > 0) {
      const volumeToLiquidity = input.volume24hUsd / input.liquidityUsd;
      let volumeRisk = 0;
      if (volumeToLiquidity > 10) volumeRisk = 80;
      else if (volumeToLiquidity > 5) volumeRisk = 50;
      else if (volumeToLiquidity > 2) volumeRisk = 30;
      else volumeRisk = 10;

      const contribution = (volumeRisk / 100) * WEIGHTS.volumeQuality * 100;
      totalRisk += contribution;
      factors.push({
        name: "volume_quality",
        type: volumeRisk > 50 ? "negative" : "positive",
        rawValue: volumeToLiquidity,
        contribution,
        weight: WEIGHTS.volumeQuality,
      });
      dataPoints++;
    } else if (input.volume24hUsd === null) {
      missing.push("volume24h");
    }

    if (input.qualifiedWalletCount !== null) {
      const walletRisk = input.qualifiedWalletCount > 3 ? 5 : input.qualifiedWalletCount > 0 ? 20 : 50;
      const contribution = (walletRisk / 100) * WEIGHTS.qualifiedWallets * 100;
      totalRisk += contribution;
      factors.push({
        name: "qualified_wallets",
        type: walletRisk < 20 ? "positive" : "negative",
        rawValue: input.qualifiedWalletCount,
        contribution,
        weight: WEIGHTS.qualifiedWallets,
      });
      dataPoints++;
    } else {
      missing.push("qualifiedWalletCount");
    }

    const finalRisk = clamp(Math.round(totalRisk), 0, 100);
    const confidence = clamp(dataPoints / 9, 0, 1);
    let riskLevel: TokenRiskResult["riskLevel"] = confidence < 0.55 ? "unknown" : "low";
    if (finalRisk >= 81) riskLevel = "critical";
    else if (finalRisk >= 61) riskLevel = "high";
    else if (finalRisk >= 31 && confidence >= 0.55) riskLevel = "medium";

    return {
      score: finalRisk,
      riskLevel,
      confidence: Math.round(confidence * 100) / 100,
      rulesetVersion: RULESET_VERSION,
      factors,
      missingFeatures: missing,
      calculatedAt: new Date().toISOString(),
    };
  }
}

export { RULESET_VERSION as TOKEN_RISK_VERSION };

export interface CalculateTokenRiskScoreInput {
  tokenAgeMinutes: number;
  liquidityUsd: number | null;
  volume1hUsd: number | null;
  holderCount: number | null;
  bundledSupplyPct: number | null;
  deployerRisk: number | null;
  topHolderConcentration: number | null;
  lpLocked: boolean | null;
  qualifiedWalletCount?: number | null;
}

export interface RiskFactor {
  factorName: string;
  impact: "risk" | "mitigation";
  value: string | number | boolean | null;
  contribution: number;
}

export type TokenRiskFactor = RiskFactor;

export interface CalculateTokenRiskScoreResult {
  riskScore: number;
  rating: "unknown" | "low" | "medium" | "high" | "critical";
  confidence: number;
  rulesetVersion: string;
  missingFeatures: string[];
  riskFactors: RiskFactor[];
  mitigatingFactors: RiskFactor[];
}

export function calculateTokenRiskScore(input: CalculateTokenRiskScoreInput): CalculateTokenRiskScoreResult {
  const scorer = new TokenRiskScorer();

  const result = scorer.score({
    tokenAddress: "",
    tokenAgeMinutes: input.tokenAgeMinutes,
    liquidityUsd: input.liquidityUsd,
    volume24hUsd: input.volume1hUsd,
    holderCount: input.holderCount,
    topHolderConcentrationPct: input.topHolderConcentration,
    qualifiedWalletCount: input.qualifiedWalletCount ?? null,
    bundledSupplyPct: input.bundledSupplyPct,
    deployerRisk: input.deployerRisk,
    lpLocked: input.lpLocked,
    mintAuthorityRevoked: null,
    freezeAuthorityRevoked: null,
  });

  const riskFactors: RiskFactor[] = result.factors
    .filter((f) => f.type === "negative")
    .map((f) => ({ factorName: f.name, impact: "risk" as const, value: f.rawValue, contribution: f.contribution }));
  const mitigatingFactors: RiskFactor[] = result.factors
    .filter((f) => f.type === "positive")
    .map((f) => ({ factorName: f.name, impact: "mitigation" as const, value: f.rawValue, contribution: f.contribution }));

  return {
    riskScore: result.score,
    rating: result.riskLevel,
    confidence: result.confidence,
    rulesetVersion: result.rulesetVersion,
    missingFeatures: result.missingFeatures,
    riskFactors,
    mitigatingFactors,
  };
}
