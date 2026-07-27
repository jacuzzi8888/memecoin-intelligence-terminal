import type { WalletClassification } from "../classification/index.js";

export interface WalletScoreInput {
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

export interface WalletScoreFactor {
  factorName: string;
  impact: "positive" | "negative";
  value: number | string;
  contribution: number;
}

export interface WalletScoreResult {
  score: number;
  confidence: number;
  isQualified: boolean;
  rulesetVersion: string;
  positiveFactors: WalletScoreFactor[];
  negativeFactors: WalletScoreFactor[];
  reasons: string[];
  calculatedAt: string;
}

const WALLET_SCORE_RULESET_VERSION = "wallet-score-v0.1.0";
const DISQUALIFYING_CLASSIFICATIONS = new Set<WalletClassification>(["bot", "insider", "bundler", "farmer"]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pushFactor(
  factors: WalletScoreFactor[],
  factorName: string,
  impact: "positive" | "negative",
  value: number | string,
  contribution: number,
) {
  factors.push({
    factorName,
    impact,
    value,
    contribution,
  });
}

export function calculateWalletScore(input: WalletScoreInput): WalletScoreResult {
  const positiveFactors: WalletScoreFactor[] = [];
  const negativeFactors: WalletScoreFactor[] = [];
  const reasons: string[] = [];
  let score = 50;

  if (DISQUALIFYING_CLASSIFICATIONS.has(input.classification)) {
    score -= 35;
    reasons.push(`Disqualifying classification: ${input.classification}`);
    pushFactor(negativeFactors, "classification", "negative", input.classification, -35);
  } else if (input.classification === "legitimate_trader") {
    score += 12;
    reasons.push("Legitimate trader profile");
    pushFactor(positiveFactors, "classification", "positive", input.classification, 12);
  } else if (input.classification === "early_buyer" || input.classification === "sniper") {
    score += 8;
    reasons.push("Early-entry profile");
    pushFactor(positiveFactors, "classification", "positive", input.classification, 8);
  } else if (input.classification === "whale" || input.classification === "diamond_hands") {
    score += 6;
    reasons.push("High conviction or high volume profile");
    pushFactor(positiveFactors, "classification", "positive", input.classification, 6);
  }

  if (input.classificationConfidence >= 0.8) {
    score += 5;
    pushFactor(positiveFactors, "classification_confidence", "positive", input.classificationConfidence, 5);
  } else if (input.classificationConfidence < 0.4) {
    score -= 4;
    pushFactor(negativeFactors, "classification_confidence", "negative", input.classificationConfidence, -4);
  }

  if (input.totalTrades >= 100) {
    score += 12;
    reasons.push("Large trade history");
    pushFactor(positiveFactors, "total_trades", "positive", input.totalTrades, 12);
  } else if (input.totalTrades >= 30) {
    score += 6;
    pushFactor(positiveFactors, "total_trades", "positive", input.totalTrades, 6);
  } else if (input.totalTrades < 10) {
    score -= 10;
    reasons.push("Insufficient history");
    pushFactor(negativeFactors, "total_trades", "negative", input.totalTrades, -10);
  }

  if (input.winRate >= 0.65) {
    score += 12;
    reasons.push("Strong win rate");
    pushFactor(positiveFactors, "win_rate", "positive", input.winRate, 12);
  } else if (input.winRate >= 0.55) {
    score += 6;
    pushFactor(positiveFactors, "win_rate", "positive", input.winRate, 6);
  } else if (input.winRate < 0.4 && input.totalTrades >= 10) {
    score -= 12;
    reasons.push("Weak win rate");
    pushFactor(negativeFactors, "win_rate", "negative", input.winRate, -12);
  }

  if (input.totalPnlUsd >= 1000) {
    score += 10;
    reasons.push("Positive realized and unrealized PnL");
    pushFactor(positiveFactors, "total_pnl_usd", "positive", input.totalPnlUsd, 10);
  } else if (input.totalPnlUsd < 0) {
    score -= 10;
    reasons.push("Negative total PnL");
    pushFactor(negativeFactors, "total_pnl_usd", "negative", input.totalPnlUsd, -10);
  }

  if (input.avgHoldTimeMinutes >= 60 && input.avgHoldTimeMinutes <= 10_080) {
    score += 5;
    pushFactor(positiveFactors, "avg_hold_time_minutes", "positive", input.avgHoldTimeMinutes, 5);
  } else if (input.avgHoldTimeMinutes > 0 && input.avgHoldTimeMinutes < 5 && input.totalTrades >= 20) {
    score -= 8;
    reasons.push("Very short holding periods");
    pushFactor(negativeFactors, "avg_hold_time_minutes", "negative", input.avgHoldTimeMinutes, -8);
  }

  if (input.uniqueTokensTraded >= 5 && input.uniqueTokensTraded <= 80) {
    score += 4;
    pushFactor(positiveFactors, "unique_tokens_traded", "positive", input.uniqueTokensTraded, 4);
  } else if (input.uniqueTokensTraded > 150 && input.avgHoldTimeMinutes < 60) {
    score -= 6;
    reasons.push("Spray-and-pray token turnover");
    pushFactor(negativeFactors, "unique_tokens_traded", "negative", input.uniqueTokensTraded, -6);
  }

  if (input.avgTradesPerDay > 80) {
    score -= 8;
    reasons.push("Trade frequency is unusually high");
    pushFactor(negativeFactors, "avg_trades_per_day", "negative", input.avgTradesPerDay, -8);
  }

  if (input.flags.includes("funded_before_launch")) {
    score -= 8;
    reasons.push("Funded shortly before launch");
    pushFactor(negativeFactors, "flag_funded_before_launch", "negative", "funded_before_launch", -8);
  }

  if (input.flags.includes("multiple_trades_in_first_minute")) {
    score -= 8;
    reasons.push("Multiple first-minute trades");
    pushFactor(negativeFactors, "flag_multiple_trades_in_first_minute", "negative", "multiple_trades_in_first_minute", -8);
  }

  const finalScore = clamp(Math.round(score), 0, 100);
  const confidence = clamp(
    Math.round(((Math.min(input.totalTrades, 100) / 100) * 0.6 + input.classificationConfidence * 0.4) * 100) / 100,
    0,
    1,
  );
  const isQualified = finalScore >= 65 && !DISQUALIFYING_CLASSIFICATIONS.has(input.classification);

  if (isQualified) {
    reasons.push("Wallet passes qualification threshold");
  } else {
    reasons.push("Wallet does not meet qualification threshold");
  }

  return {
    score: finalScore,
    confidence,
    isQualified,
    rulesetVersion: WALLET_SCORE_RULESET_VERSION,
    positiveFactors,
    negativeFactors,
    reasons,
    calculatedAt: new Date().toISOString(),
  };
}

export { DISQUALIFYING_CLASSIFICATIONS, WALLET_SCORE_RULESET_VERSION };
