import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

import { WalletHistoryService } from "../wallet-history.js";
import { WalletClassifier, type ClassificationInput } from "@memecoin/intelligence";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { eq } from "drizzle-orm";
import { logger } from "@memecoin/logger";
import { randomUUID } from "crypto";

const log = logger("classify-wallet");

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== "--");
  const walletAddress = args[0];

  if (!walletAddress) {
    console.error("Usage: pnpm classify-wallet <wallet-address>");
    process.exit(1);
  }

  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    console.error("HELIUS_API_KEY not set in .env");
    process.exit(1);
  }

  log.info({ walletAddress }, "Starting wallet classification");

  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  const historyService = new WalletHistoryService(rpcUrl, heliusApiKey);
  const classifier = new WalletClassifier();
  const db = getDb();

  const walletRows = await db.select().from(schema.wallets).where(eq(schema.wallets.address, walletAddress));
  const wallet = walletRows[0];

  if (!wallet) {
    log.info({ walletAddress }, "Wallet not found, creating entry");
    await db.insert(schema.wallets).values({
      id: randomUUID(),
      address: walletAddress,
      classification: "unknown",
      totalTrades: 0,
    });
  }

  const trades = await historyService.ingestWalletHistory(walletAddress);

  if (trades.length === 0) {
    log.info("No trades found, classifying as unknown");
    if (wallet) {
      await db.update(schema.wallets)
        .set({ classification: "unknown", updatedAt: new Date() })
        .where(eq(schema.wallets.id, wallet.id));
    }
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const firstTrade = trades[trades.length - 1]!;
  const lastTrade = trades[0]!;
  const timeSpanSeconds = lastTrade.blockTime - firstTrade.blockTime;
  const daysActive = Math.max(timeSpanSeconds / 86400, 1);

  const uniqueTokens = new Set(trades.map(t => t.tokenMint));
  const buyTrades = trades.filter(t => t.type === "buy");
  const sellTrades = trades.filter(t => t.type === "sell");

  let totalHoldTime = 0;
  let holdTimeCount = 0;

  for (const buy of buyTrades) {
    const matchingSell = sellTrades.find(s =>
      s.tokenMint === buy.tokenMint && s.blockTime > buy.blockTime
    );
    if (matchingSell) {
      totalHoldTime += (matchingSell.blockTime - buy.blockTime) / 60;
      holdTimeCount++;
    }
  }

  const avgHoldTime = holdTimeCount > 0 ? totalHoldTime / holdTimeCount : 0;

  const sortedByTime = [...trades].sort((a, b) => a.blockTime - b.blockTime);
  let totalInterval = 0;
  for (let i = 1; i < sortedByTime.length; i++) {
    const curr = sortedByTime[i]!;
    const prev = sortedByTime[i - 1]!;
    totalInterval += curr.blockTime - prev.blockTime;
  }
  const avgInterval = trades.length > 1 ? totalInterval / (trades.length - 1) : 0;

  const weekdayTrades = trades.filter(t => {
    const day = new Date(t.blockTime * 1000).getUTCDay();
    return day >= 1 && day <= 5;
  }).length;

  const nighttimeTrades = trades.filter(t => {
    const hour = new Date(t.blockTime * 1000).getUTCHours();
    return hour >= 0 && hour < 6;
  }).length;

  const totalVolumeSol = trades.reduce((sum, t) => sum + t.solAmount, 0);
  const amounts = trades.map(t => t.solAmount).sort((a, b) => b - a);
  const largestAmount = amounts[0] ?? 0;
  const largestTxRatio = totalVolumeSol > 0 ? largestAmount / totalVolumeSol : 0;

  const tokenCounts = new Map<string, number>();
  for (const t of trades) {
    tokenCounts.set(t.tokenMint, (tokenCounts.get(t.tokenMint) || 0) + 1);
  }
  const sameTokenTrades = Math.max(...Array.from(tokenCounts.values()), 0);

  const input: ClassificationInput = {
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
    tradesInFirst5Min: trades.filter(t => t.blockTime - firstTrade.blockTime < 300).length,
    tradesInFirst1Min: trades.filter(t => t.blockTime - firstTrade.blockTime < 60).length,
    avgTradeIntervalSeconds: avgInterval,
    weekendTradeRatio: trades.length > 0 ? 1 - (weekdayTrades / trades.length) : 0,
    nighttimeTradeRatio: trades.length > 0 ? nighttimeTrades / trades.length : 0,
    totalVolumeSol,
    largestTxRatio,
    sameTokenTrades,
  };

  log.info({ input }, "Classification input prepared");

  const result = classifier.classify(input);

  log.info({
    walletAddress,
    classification: result.classification,
    confidence: result.confidence,
    flags: result.flags,
  }, "Wallet classified");

  if (wallet) {
    await db.update(schema.wallets)
      .set({
        classification: result.classification,
        totalTrades: trades.length,
        lastSeenAt: new Date(lastTrade.blockTime * 1000),
        updatedAt: new Date(),
      })
      .where(eq(schema.wallets.id, wallet.id));

    await db.insert(schema.walletLabels).values({
      id: randomUUID(),
      walletId: wallet.id,
      walletAddress,
      label: result.classification,
      confidence: result.confidence.toString(),
      source: "wallet-classifier-v0.1.0",
      rulesetVersion: result.rulesetVersion,
    });

    log.info("Classification and label stored in database");

    log.info({
      walletAddress,
      classification: result.classification,
      confidence: `${(result.confidence * 100).toFixed(1)}%`,
      flags: result.flags,
      totalTrades: trades.length,
      uniqueTokens: uniqueTokens.size,
      avgHoldTime: `${avgHoldTime.toFixed(1)} min`,
      avgTradesPerDay: (trades.length / daysActive).toFixed(1),
    }, " Classification complete");
  }
}

main().catch((err) => {
  log.error({ error: err }, "Wallet classification failed");
  process.exit(1);
});