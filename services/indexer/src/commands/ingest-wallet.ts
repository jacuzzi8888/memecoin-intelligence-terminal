import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

import { WalletHistoryService } from "../wallet-history.js";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@memecoin/logger";
import { randomUUID } from "crypto";

const log = logger("ingest-wallet");

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== "--");
  const walletAddress = args[0];

  if (!walletAddress) {
    console.error("Usage: pnpm ingest-wallet <wallet-address>");
    process.exit(1);
  }

  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    console.error("HELIUS_API_KEY not set in .env");
    process.exit(1);
  }

  log.info({ walletAddress }, "Starting wallet history ingestion");

  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  const service = new WalletHistoryService(rpcUrl, heliusApiKey);
  const db = getDb();

  const walletRows = await db.select().from(schema.wallets).where(eq(schema.wallets.address, walletAddress));
  const wallet = walletRows[0];

  if (!wallet) {
    log.error({ walletAddress }, "Wallet not found in database. Seed first or add wallet manually.");
    process.exit(1);
  }

  log.info({ walletAddress, walletId: wallet.id }, "Found wallet in database");

  const trades = await service.ingestWalletHistory(walletAddress);
  log.info({ walletAddress, tradeCount: trades.length }, "Fetched trades from Helius");

  if (trades.length === 0) {
    log.info("No trades found for this wallet");
    return;
  }

  let insertedCount = 0;
  let buyCount = 0;
  let sellCount = 0;

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
      if (trade.type === "buy") buyCount++;
      else sellCount++;
    } catch (error) {
      log.debug({ error, signature: trade.signature }, "Trade already exists or failed to insert");
    }
  }

  log.info({ insertedCount, buyCount, sellCount }, "Inserted trades into database");

  const positions = service.calculatePositions(trades);
  log.info({ positionCount: positions.length }, "Calculated positions");

  for (const position of positions) {
    try {
      const existingPositions = await db.select().from(schema.walletPositions).where(
        and(
          eq(schema.walletPositions.walletId, wallet.id),
          eq(schema.walletPositions.tokenAddress, position.tokenMint),
        ),
      );

      if (existingPositions && existingPositions.length > 0) {
        await db.update(schema.walletPositions)
          .set({
            amount: position.balance.toString(),
            avgEntryPrice: position.averageBuyPrice.toString(),
            currentValueUsd: position.currentValue.toString(),
            realizedPnlUsd: position.realizedPnl.toString(),
            unrealizedPnlUsd: position.unrealizedPnl.toString(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.walletPositions.walletId, wallet.id),
              eq(schema.walletPositions.tokenAddress, position.tokenMint),
            ),
          );
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
    } catch (error) {
      log.error({ error, tokenMint: position.tokenMint }, "Failed to upsert position");
    }
  }

  const firstTrade = trades[0];
  const lastTradeTime = firstTrade ? new Date(firstTrade.blockTime * 1000) : null;

  await db.update(schema.wallets)
    .set({
      totalTrades: insertedCount,
      lastSeenAt: lastTradeTime,
      updatedAt: new Date(),
    })
    .where(eq(schema.wallets.id, wallet.id));

  await db.insert(schema.walletPerformance).values({
    id: randomUUID(),
    walletId: wallet.id,
    walletAddress,
    rulesetVersion: "wallet-v0.1.0",
    totalTrades: insertedCount,
    profitableTrades: sellCount,
    winRate: insertedCount > 0 ? (sellCount / insertedCount).toString() : "0",
    calculatedAt: new Date(),
  }).onConflictDoNothing();

  log.info({
    walletAddress,
    trades: insertedCount,
    buys: buyCount,
    sells: sellCount,
    positions: positions.length,
  }, "Wallet history ingestion complete");
}

main().catch((err) => {
  log.error({ error: err }, "Wallet history ingestion failed");
  process.exit(1);
});
