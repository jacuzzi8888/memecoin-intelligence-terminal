import { logger } from "@memecoin/logger";
import type { WalletClassification } from "../classification/index.js";

const log = logger("wallet-scoring");

export interface WalletScoreInput {
  walletAddress: string;
  classification: WalletClassification;
  classificationConfidence: number;
  totalTrades: number;
  profitableTrades: number;
  totalPnlSol: number;
  avgHoldTimeMinutes: number;
  uniqueTokensTraded: number;
  winRate: number;
  avgReturnPct: number;
  lastTradeAt: number | null;
  firstSeenAt: number | null;
}

export interface WalletScoreResult {
  score: number;
  confidence: number;
  rulesetVersion: string;
  factors: Array<{
    name: string;
    type: "positive" | "negative";
    rawValue: number;
    contribution: number;
    weight: number;
  }>;
  tier: "elite" | "qualified" | "monitored" | "unqualified";
  calculatedAt: string;
}

const RULESET_VERSION = "wallet-score-v0.1.0";

const WEIGHTS = {
  profitability: 0.30,
  winRate: 0.20,
  consistency: 0.15,
  holdTime: 0.10,
  diversity: 0.10,
  recency: 0.10,
  classification: 0.05,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class WalletScorer {
  score(input: WalletScoreInput): WalletScoreResult {
    const factors: WalletScoreResult["factors"] = [];
    let totalScore = 0;
    let dataPoints = 0;
    const maxDataPoints = 7;

    if (input.totalPnlSol > 0) {
      let profitScore = 0;
      if (input.totalPnlSol > 100) profitScore = 100;
      else if (input.totalPnlSol > 50) profitScore = 80;
      else if (input.totalPnlSol > 10) profitScore = 60;
      else if (input.totalPnlSol > 1) profitScore = 40;
      else profitScore = 20;

      const contribution = (profitScore / 100) * WEIGHTS.profitability * 100;
      totalScore += contribution;
      factors.push({
        name: "profitability",
        type: "positive",
        rawValue: input.totalPnlSol,
        contribution,
        weight: WEIGHTS.profitability,
      });
    } else if (input.totalPnlSol < 0) {
      const contribution = Math.abs(input.totalPnlSol) > 10 ? -15 : -5;
      totalScore += contribution;
      factors.push({
        name: "profitability",
        type: "negative",
        rawValue: input.totalPnlSol,
        contribution,
        weight: WEIGHTS.profitability,
      });
    }
    dataPoints++;

    if (input.winRate > 0) {
      const winScore = input.winRate * 100;
      const contribution = (winScore / 100) * WEIGHTS.winRate * 100;
      totalScore += contribution;
      factors.push({
        name: "win_rate",
        type: winScore >= 55 ? "positive" : "negative",
        rawValue: winScore,
        contribution: winScore >= 55 ? contribution : -Math.abs(contribution * 0.3),
        weight: WEIGHTS.winRate,
      });
    }
    dataPoints++;

    if (input.totalTrades > 0) {
      const consistencyScore = Math.min(input.totalTrades, 100);
      const contribution = (consistencyScore / 100) * WEIGHTS.consistency * 100;
      totalScore += contribution;
      factors.push({
        name: "consistency",
        type: "positive",
        rawValue: input.totalTrades,
        contribution,
        weight: WEIGHTS.consistency,
      });
    }
    dataPoints++;

    if (input.avgHoldTimeMinutes > 0) {
      let holdScore = 50;
      if (input.avgHoldTimeMinutes > 1440) holdScore = 100;
      else if (input.avgHoldTimeMinutes > 240) holdScore = 80;
      else if (input.avgHoldTimeMinutes > 60) holdScore = 60;
      else if (input.avgHoldTimeMinutes > 15) holdScore = 40;
      else holdScore = 20;

      const contribution = (holdScore / 100) * WEIGHTS.holdTime * 100;
      totalScore += contribution;
      factors.push({
        name: "hold_time",
        type: holdScore >= 50 ? "positive" : "negative",
        rawValue: input.avgHoldTimeMinutes,
        contribution,
        weight: WEIGHTS.holdTime,
      });
    }
    dataPoints++;

    if (input.uniqueTokensTraded > 0) {
      const diversityScore = Math.min(input.uniqueTokensTraded * 2, 100);
      const contribution = (diversityScore / 100) * WEIGHTS.diversity * 100;
      totalScore += contribution;
      factors.push({
        name: "diversity",
        type: "positive",
        rawValue: input.uniqueTokensTraded,
        contribution,
        weight: WEIGHTS.diversity,
      });
    }
    dataPoints++;

    if (input.lastTradeAt) {
      const daysSinceLastTrade = (Date.now() / 1000 - input.lastTradeAt) / 86400;
      let recencyScore = 0;
      if (daysSinceLastTrade < 1) recencyScore = 100;
      else if (daysSinceLastTrade < 7) recencyScore = 80;
      else if (daysSinceLastTrade < 30) recencyScore = 60;
      else if (daysSinceLastTrade < 90) recencyScore = 40;
      else recencyScore = 20;

      const contribution = (recencyScore / 100) * WEIGHTS.recency * 100;
      totalScore += contribution;
      factors.push({
        name: "recency",
        type: recencyScore >= 50 ? "positive" : "negative",
        rawValue: daysSinceLastTrade,
        contribution,
        weight: WEIGHTS.recency,
      });
    }
    dataPoints++;

    let classificationBonus = 0;
    let classificationFactor: WalletScoreResult["factors"][number] | null = null;

    switch (input.classification) {
      case "legitimate_trader":
        classificationBonus = 100;
        break;
      case "early_buyer":
        classificationBonus = 90;
        break;
      case "diamond_hands":
        classificationBonus = 85;
        break;
      case "whale":
        classificationBonus = 70;
        break;
      case "sniper":
        classificationBonus = 50;
        break;
      case "paper_hands":
        classificationBonus = 30;
        break;
      case "farmer":
        classificationBonus = 15;
        break;
      case "bot":
      case "insider":
      case "bundler":
        classificationBonus = 0;
        break;
      default:
        classificationBonus = 40;
    }

    const classificationContribution = (classificationBonus / 100) * WEIGHTS.classification * 100;
    totalScore += classificationContribution;
    classificationFactor = {
      name: "classification",
      type: classificationBonus >= 50 ? "positive" : "negative",
      rawValue: classificationBonus,
      contribution: classificationContribution,
      weight: WEIGHTS.classification,
    };
    factors.push(classificationFactor);
    dataPoints++;

    const finalScore = clamp(Math.round(totalScore), 0, 100);
    const confidence = clamp(dataPoints / maxDataPoints, 0, 1);

    let tier: WalletScoreResult["tier"] = "unqualified";
    if (finalScore >= 75 && input.classification !== "bot" && input.classification !== "insider" && input.classification !== "bundler") {
      tier = "elite";
    } else if (finalScore >= 55 && input.classification !== "bot" && input.classification !== "insider" && input.classification !== "bundler") {
      tier = "qualified";
    } else if (finalScore >= 30) {
      tier = "monitored";
    }

    return {
      score: finalScore,
      confidence: Math.round(confidence * 100) / 100,
      rulesetVersion: RULESET_VERSION,
      factors,
      tier,
      calculatedAt: new Date().toISOString(),
    };
  }

  isQualified(scoreResult: WalletScoreResult): boolean {
    return scoreResult.tier === "elite" || scoreResult.tier === "qualified";
  }
}

export { RULESET_VERSION as WALLET_SCORE_VERSION };

export interface CalculateWalletScoreInput {
  classification: WalletClassification;
  classificationConfidence: number;
  totalTrades: number;
  winRate: number;
  totalPnlUsd: number;
  avgHoldTimeMinutes: number;
  uniqueTokensTraded: number;
  avgTradesPerDay: number;
  flags: string[];
}

export interface CalculateWalletScoreResult {
  score: number;
  isQualified: boolean;
  confidence: number;
  reasons: string[];
  rulesetVersion: string;
  positiveFactors: Array<{ name: string; contribution: number }>;
  negativeFactors: Array<{ name: string; contribution: number }>;
}

const DISQUALIFYING_CLASSIFICATIONS: WalletClassification[] = ["bot", "insider", "bundler"];

export function calculateWalletScore(input: CalculateWalletScoreInput): CalculateWalletScoreResult {
  const scorer = new WalletScorer();

  const result = scorer.score({
    walletAddress: "",
    classification: input.classification,
    classificationConfidence: input.classificationConfidence,
    totalTrades: input.totalTrades,
    profitableTrades: Math.floor(input.totalTrades * input.winRate),
    totalPnlSol: input.totalPnlUsd,
    avgHoldTimeMinutes: input.avgHoldTimeMinutes,
    uniqueTokensTraded: input.uniqueTokensTraded,
    winRate: input.winRate,
    avgReturnPct: 0,
    lastTradeAt: Math.floor(Date.now() / 1000),
    firstSeenAt: null,
  });

  const isQualified =
    result.tier === "elite" || result.tier === "qualified";

  const positiveFactors = result.factors
    .filter((f) => f.type === "positive")
    .map((f) => ({ name: f.name, contribution: f.contribution }));
  const negativeFactors = result.factors
    .filter((f) => f.type === "negative")
    .map((f) => ({ name: f.name, contribution: f.contribution }));

  const reasons = [
    ...input.flags,
    ...positiveFactors.map((f) => f.name),
  ];

  return {
    score: result.score,
    isQualified,
    confidence: result.confidence,
    reasons,
    rulesetVersion: result.rulesetVersion,
    positiveFactors,
    negativeFactors,
  };
}

export { DISQUALIFYING_CLASSIFICATIONS };

export type WalletScoreFactor = {
  name: string;
  type: "positive" | "negative";
  rawValue: number;
  contribution: number;
  weight: number;
};