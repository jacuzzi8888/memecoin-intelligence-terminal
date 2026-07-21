import { logger } from "@memecoin/logger";

const log = logger("wallet-classifier");

export type WalletClassification =
  | "legitimate_trader"
  | "early_buyer"
  | "bot"
  | "insider"
  | "bundler"
  | "farmer"
  | "whale"
  | "sniper"
  | "diamond_hands"
  | "paper_hands"
  | "unknown";

export interface ClassificationInput {
  walletAddress: string;
  totalTrades: number;
  avgTradesPerDay: number;
  uniqueTokensTraded: number;
  avgHoldTimeMinutes: number;
  firstSeenAt: number;
  lastTradeAt: number;
  fundedBy: string | null;
  fundedAt: number | null;
  firstBuyTime: number | null;
  tokenLaunchTime: number | null;
  tradesInFirst5Min: number;
  tradesInFirst1Min: number;
  avgTradeIntervalSeconds: number;
  weekendTradeRatio: number;
  nighttimeTradeRatio: number;
  totalVolumeSol: number;
  largestTxRatio: number;
  sameTokenTrades: number;
}

export interface ClassificationResult {
  walletAddress: string;
  classification: WalletClassification;
  confidence: number;
  flags: string[];
  rulesetVersion: string;
  classifiedAt: string;
}

const RULESET_VERSION = "wallet-classifier-v0.1.0";

export class WalletClassifier {
  classify(input: ClassificationInput): ClassificationResult {
    const flags: string[] = [];
    const scores: Record<WalletClassification, number> = {
      legitimate_trader: 0,
      early_buyer: 0,
      bot: 0,
      insider: 0,
      bundler: 0,
      farmer: 0,
      whale: 0,
      sniper: 0,
      diamond_hands: 0,
      paper_hands: 0,
      unknown: 0,
    };

    if (input.avgTradesPerDay > 50 && input.avgTradeIntervalSeconds < 300) {
      scores.bot += 40;
      flags.push("high_frequency_trading");
    }

    if (input.avgTradeIntervalSeconds < 60 && input.totalTrades > 100) {
      scores.bot += 30;
      flags.push("sub_minute_intervals");
    }

    if (input.weekendTradeRatio < 0.1 && input.nighttimeTradeRatio < 0.1) {
      scores.bot += 20;
      flags.push("business_hours_only");
    }

    if (input.nighttimeTradeRatio > 0.8) {
      scores.bot += 15;
      flags.push("nighttime_dominant");
    }

    if (input.fundedAt && input.tokenLaunchTime) {
      const fundedDiff = input.tokenLaunchTime - input.fundedAt;
      if (fundedDiff > 0 && fundedDiff < 86400) {
        scores.insider += 40;
        flags.push("funded_before_launch");
      }
    }

    if (input.firstBuyTime && input.tokenLaunchTime) {
      const buyDelay = input.firstBuyTime - input.tokenLaunchTime;
      if (buyDelay >= 0 && buyDelay < 10) {
        scores.insider += 35;
        scores.sniper += 30;
        flags.push("bought_within_10s_of_launch");
      } else if (buyDelay < 60) {
        scores.insider += 20;
        scores.sniper += 40;
        flags.push("bought_within_1min_of_launch");
      } else if (buyDelay < 300) {
        scores.sniper += 30;
        scores.early_buyer += 25;
        flags.push("bought_within_5min_of_launch");
      }
    }

    if (input.tradesInFirst1Min > 3) {
      scores.bundler += 40;
      flags.push("multiple_trades_in_first_minute");
    }

    if (input.tradesInFirst5Min > 5) {
      scores.bundler += 30;
      flags.push("high_trade_count_in_first_5min");
    }

    if (input.fundedBy && input.fundedBy !== input.walletAddress) {
      scores.bundler += 15;
      flags.push("externally_funded");
    }

    if (input.totalVolumeSol > 1000) {
      scores.whale += 40;
      flags.push("high_volume_trader");
    } else if (input.totalVolumeSol > 100) {
      scores.whale += 20;
      flags.push("medium_volume_trader");
    }

    if (input.avgHoldTimeMinutes > 1440 && input.totalTrades > 10) {
      scores.diamond_hands += 40;
      flags.push("long_hold_times");
    }

    if (input.avgHoldTimeMinutes < 5 && input.totalTrades > 20) {
      scores.paper_hands += 40;
      scores.sniper += 25;
      flags.push("very_short_hold_times");
    }

    if (input.uniqueTokensTraded > 100 && input.avgHoldTimeMinutes < 60) {
      scores.farmer += 30;
      flags.push("many_tokens_short_holds");
    }

    if (input.largestTxRatio > 0.5 && input.totalTrades > 10) {
      scores.bot += 15;
      flags.push("single_tx_dominant");
    }

    if (scores.bot < 20 && scores.insider < 20 && scores.bundler < 20) {
      scores.legitimate_trader += 30;
    }

    if (scores.sniper < 20 && scores.early_buyer < 20 && scores.bot < 20) {
      scores.legitimate_trader += 20;
    }

    scores.legitimate_trader += Math.min(input.totalTrades, 50) * 0.5;

    let topClassification: WalletClassification = "unknown";
    let topScore = 0;

    for (const [classification, score] of Object.entries(scores) as [WalletClassification, number][]) {
      if (score > topScore) {
        topScore = score;
        topClassification = classification;
      }
    }

    const maxPossible = 100;
    const confidence = Math.min(topScore / maxPossible, 1);

    log.info(
      {
        walletAddress: input.walletAddress,
        classification: topClassification,
        confidence,
        flags,
      },
      "Wallet classified",
    );

    return {
      walletAddress: input.walletAddress,
      classification: topClassification,
      confidence: Math.round(confidence * 100) / 100,
      flags,
      rulesetVersion: RULESET_VERSION,
      classifiedAt: new Date().toISOString(),
    };
  }

  calculateBotScore(input: ClassificationInput): number {
    let score = 0;
    if (input.avgTradesPerDay > 50) score += 25;
    if (input.avgTradeIntervalSeconds < 60) score += 25;
    if (input.weekendTradeRatio < 0.1) score += 15;
    if (input.nighttimeTradeRatio > 0.8) score += 10;
    if (input.largestTxRatio > 0.5) score += 15;
    return Math.min(score, 100);
  }

  calculateInsiderScore(input: ClassificationInput): number {
    let score = 0;
    if (input.fundedAt && input.tokenLaunchTime) {
      const diff = input.tokenLaunchTime - input.fundedAt;
      if (diff > 0 && diff < 86400) score += 40;
    }
    if (input.firstBuyTime && input.tokenLaunchTime) {
      const delay = input.firstBuyTime - input.tokenLaunchTime;
      if (delay >= 0 && delay < 10) score += 40;
      else if (delay < 60) score += 25;
    }
    if (input.tradesInFirst1Min > 3) score += 20;
    return Math.min(score, 100);
  }

  calculateBundlerScore(input: ClassificationInput): number {
    let score = 0;
    if (input.tradesInFirst1Min > 3) score += 35;
    if (input.tradesInFirst5Min > 5) score += 25;
    if (input.fundedBy && input.fundedBy !== input.walletAddress) score += 20;
    if (input.sameTokenTrades > 10) score += 20;
    return Math.min(score, 100);
  }
}

export { RULESET_VERSION };