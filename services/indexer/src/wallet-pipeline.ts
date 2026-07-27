import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { WalletClassifier, calculateWalletScore, type ClassificationInput } from "@memecoin/intelligence";
import { logger } from "@memecoin/logger";
import { WalletHistoryService, type WalletTrade } from "./wallet-history.js";

const log = logger("wallet-pipeline");

export interface WalletPipelineResult {
  walletAddress: string;
  walletId: string;
  tradesFetched: number;
  tradesInserted: number;
  positionsUpserted: number;
  classification: string;
  confidence: number;
  flags: string[];
  walletScore: number;
  qualified: boolean;
}

function buildClassificationInput(walletAddress: string, trades: WalletTrade[]): ClassificationInput {
  const firstTrade = trades[trades.length - 1]!;
  const lastTrade = trades[0]!;
  const timeSpanSeconds = lastTrade.blockTime - firstTrade.blockTime;
  const daysActive = Math.max(timeSpanSeconds / 86400, 1);
  const uniqueTokens = new Set(trades.map((trade) => trade.tokenMint));
  const buyTrades = trades.filter((trade) => trade.type === "buy");
  const sellTrades = trades.filter((trade) => trade.type === "sell");

  let totalHoldTime = 0;
  let holdTimeCount = 0;
  for (const buy of buyTrades) {
    const matchingSell = sellTrades.find((sell) => sell.tokenMint === buy.tokenMint && sell.blockTime > buy.blockTime);
    if (matchingSell) {
      totalHoldTime += (matchingSell.blockTime - buy.blockTime) / 60;
      holdTimeCount++;
    }
  }

  const avgHoldTime = holdTimeCount > 0 ? totalHoldTime / holdTimeCount : 0;

  const sortedByTime = [...trades].sort((a, b) => a.blockTime - b.blockTime);
  let totalInterval = 0;
  for (let index = 1; index < sortedByTime.length; index++) {
    totalInterval += sortedByTime[index]!.blockTime - sortedByTime[index - 1]!.blockTime;
  }
  const avgInterval = trades.length > 1 ? totalInterval / (trades.length - 1) : 0;

  const weekdayTrades = trades.filter((trade) => {
    const day = new Date(trade.blockTime * 1000).getUTCDay();
    return day >= 1 && day <= 5;
  }).length;

  const nighttimeTrades = trades.filter((trade) => {
    const hour = new Date(trade.blockTime * 1000).getUTCHours();
    return hour >= 0 && hour < 6;
  }).length;

  const totalVolumeSol = trades.reduce((sum, trade) => sum + trade.solAmount, 0);
  const amounts = trades.map((trade) => trade.solAmount).sort((a, b) => b - a);
  const largestAmount = amounts[0] ?? 0;
  const largestTxRatio = totalVolumeSol > 0 ? largestAmount / totalVolumeSol : 0;

  const tokenCounts = new Map<string, number>();
  for (const trade of trades) {
    tokenCounts.set(trade.tokenMint, (tokenCounts.get(trade.tokenMint) || 0) + 1);
  }
  const sameTokenTrades = Math.max(...Array.from(tokenCounts.values()), 0);

  return {
    walletAddress,
    totalTrades: trades.length,
    avgTradesPerDay: trades.length / daysActive,
    uniqueTokensTraded: uniqueTokens.size,
    avgHoldTimeMinutes: avgHoldTime,
    firstSeenAt: firstTrade.blockTime,
    lastTradeAt: lastTrade.blockTime,
    fundedBy: null,
    fundedAt: null,
    firstBuyTime: buyTrades.length > 0 ? buyTrades[buyTrades.length - 1]!.blockTime : null,
    tokenLaunchTime: null,
    tradesInFirst5Min: trades.filter((trade) => trade.blockTime - firstTrade.blockTime < 300).length,
    tradesInFirst1Min: trades.filter((trade) => trade.blockTime - firstTrade.blockTime < 60).length,
    avgTradeIntervalSeconds: avgInterval,
    weekendTradeRatio: trades.length > 0 ? 1 - (weekdayTrades / trades.length) : 0,
    nighttimeTradeRatio: trades.length > 0 ? nighttimeTrades / trades.length : 0,
    totalVolumeSol,
    largestTxRatio,
    sameTokenTrades,
  };
}

export async function runWalletIntelligencePipeline(walletAddress: string): Promise<WalletPipelineResult> {
  const db = getDb();
  const heliusApiKey = process.env.HELIUS_API_KEY;

  if (!heliusApiKey) {
    throw new Error("HELIUS_API_KEY not set");
  }

  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  const historyService = new WalletHistoryService(rpcUrl, heliusApiKey);
  const classifier = new WalletClassifier();

  let wallet = (await db.select().from(schema.wallets).where(eq(schema.wallets.address, walletAddress)))[0];
  if (!wallet) {
    const walletId = randomUUID();
    await db.insert(schema.wallets).values({
      id: walletId,
      address: walletAddress,
      classification: "unknown",
      totalTrades: 0,
    });
    wallet = {
      id: walletId,
      address: walletAddress,
      classification: "unknown",
      totalTrades: 0,
      label: null,
      firstSeenAt: null,
      lastSeenAt: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  const trades = await historyService.ingestWalletHistory(walletAddress);
  if (trades.length === 0) {
    await db.update(schema.wallets)
      .set({
        classification: "unknown",
        updatedAt: new Date(),
      })
      .where(eq(schema.wallets.id, wallet.id));

    return {
      walletAddress,
      walletId: wallet.id,
      tradesFetched: 0,
      tradesInserted: 0,
      positionsUpserted: 0,
      classification: "unknown",
      confidence: 0,
      flags: [],
      walletScore: 0,
      qualified: false,
    };
  }

  let insertedCount = 0;
  for (const trade of trades) {
    try {
      await db.insert(schema.walletTrades).values({
        id: randomUUID(),
        walletId: wallet.id,
        walletAddress: trade.walletAddress,
        tokenAddress: trade.tokenMint,
        tradeType: trade.type,
        amount: trade.tokenAmount.toString(),
        priceUsd: trade.pricePerToken.toString(),
        valueUsd: trade.solAmount.toString(),
        txSignature: trade.signature,
        slot: trade.slot.toString(),
        tradedAt: new Date(trade.blockTime * 1000),
      });
      insertedCount++;
    } catch (error) {
      log.debug({ error, signature: trade.signature }, "Wallet trade insert skipped");
    }
  }

  const positions = historyService.calculatePositions(trades);
  for (const position of positions) {
    const existing = await db.select().from(schema.walletPositions).where(and(
      eq(schema.walletPositions.walletId, wallet.id),
      eq(schema.walletPositions.tokenAddress, position.tokenMint),
    ));

    if (existing.length > 0) {
      await db.update(schema.walletPositions)
        .set({
          amount: position.balance.toString(),
          avgEntryPrice: position.averageBuyPrice.toString(),
          currentValueUsd: position.currentValue.toString(),
          realizedPnlUsd: position.realizedPnl.toString(),
          unrealizedPnlUsd: position.unrealizedPnl.toString(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.walletPositions.walletId, wallet.id),
          eq(schema.walletPositions.tokenAddress, position.tokenMint),
        ));
    } else {
      await db.insert(schema.walletPositions).values({
        id: randomUUID(),
        walletId: wallet.id,
        walletAddress,
        tokenAddress: position.tokenMint,
        amount: position.balance.toString(),
        avgEntryPrice: position.averageBuyPrice.toString(),
        currentValueUsd: position.currentValue.toString(),
        realizedPnlUsd: position.realizedPnl.toString(),
        unrealizedPnlUsd: position.unrealizedPnl.toString(),
        openedAt: new Date(trades[0]!.blockTime * 1000),
        status: "open",
      });
    }
  }

  const classificationResult = classifier.classify(buildClassificationInput(walletAddress, trades));
  const classificationInput = buildClassificationInput(walletAddress, trades);
  const profitableTrades = trades.filter((trade) => trade.type === "sell").length;
  const totalPnlUsd = positions.reduce((sum, position) => sum + position.realizedPnl + position.unrealizedPnl, 0);
  const winRate = trades.length > 0 ? profitableTrades / trades.length : 0;
  const walletScore = calculateWalletScore({
    classification: classificationResult.classification,
    classificationConfidence: classificationResult.confidence,
    totalTrades: trades.length,
    winRate,
    totalPnlUsd,
    avgHoldTimeMinutes: classificationInput.avgHoldTimeMinutes,
    uniqueTokensTraded: classificationInput.uniqueTokensTraded,
    avgTradesPerDay: classificationInput.avgTradesPerDay,
    flags: classificationResult.flags,
  });

  const avgReturnPct = trades.length > 0
    ? trades.reduce((sum, trade) => {
      if (trade.solAmount === 0) return sum;
      const basis = trade.solAmount / Math.max(trade.tokenAmount, 1);
      if (basis === 0) return sum;
      return sum + (((trade.pricePerToken - basis) / basis) * 100);
    }, 0) / trades.length
    : 0;

  await db.update(schema.wallets)
    .set({
      classification: classificationResult.classification,
      totalTrades: trades.length,
      firstSeenAt: new Date(trades[trades.length - 1]!.blockTime * 1000),
      lastSeenAt: new Date(trades[0]!.blockTime * 1000),
      metadata: {
        qualification: {
          isQualified: walletScore.isQualified,
          walletScore: walletScore.score,
          confidence: walletScore.confidence,
          reasons: walletScore.reasons,
          rulesetVersion: walletScore.rulesetVersion,
        },
        flags: classificationResult.flags,
        lastSyncedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.wallets.id, wallet.id));

  await db.insert(schema.walletLabels).values({
    id: randomUUID(),
    walletId: wallet.id,
    walletAddress,
    label: classificationResult.classification,
    confidence: classificationResult.confidence.toString(),
    source: "wallet-classifier-v0.1.0",
    rulesetVersion: classificationResult.rulesetVersion,
  });

  await db.insert(schema.walletPerformance).values({
    id: randomUUID(),
    walletId: wallet.id,
    walletAddress,
    rulesetVersion: classificationResult.rulesetVersion,
    totalPnlUsd: totalPnlUsd.toString(),
    realizedPnlUsd: positions.reduce((sum, position) => sum + position.realizedPnl, 0).toString(),
    winRate: winRate.toString(),
    totalTrades: trades.length,
    profitableTrades,
    avgHoldTimeSeconds: Math.round(classificationInput.avgHoldTimeMinutes * 60),
    avgReturnPct: avgReturnPct.toString(),
    score: walletScore.score,
    calculatedAt: new Date(),
  });

  return {
    walletAddress,
    walletId: wallet.id,
    tradesFetched: trades.length,
    tradesInserted: insertedCount,
    positionsUpserted: positions.length,
    classification: classificationResult.classification,
    confidence: classificationResult.confidence,
    flags: classificationResult.flags,
    walletScore: walletScore.score,
    qualified: walletScore.isQualified,
  };
}
