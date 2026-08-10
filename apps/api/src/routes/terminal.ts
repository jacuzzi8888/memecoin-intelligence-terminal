import type { FastifyPluginAsync } from "fastify";
import { desc, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { resolveRequestUser } from "./dev-user.js";
import { getRecentWindow, serializeRecentWindow } from "./recent-window.js";

const querySchema = z.object({
  sinceDays: z.coerce.number().min(1).max(30).default(1),
});

export const terminalRoute: FastifyPluginAsync = async (app) => {
  app.get("/terminal", async (request) => {
    const query = querySchema.parse(request.query);
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const since = getRecentWindow(query.sinceDays);

    const [snapshotRows, tradingAccounts, tradeIntents, quoteRecords] = await Promise.all([
      db.select().from(schema.tokenSnapshots).where(gte(schema.tokenSnapshots.snapshotAt, since)).orderBy(desc(schema.tokenSnapshots.snapshotAt)).limit(30),
      user ? db.select().from(schema.tradingAccounts).limit(20) : Promise.resolve([]),
      user ? db.select().from(schema.tradeIntents).where(gte(schema.tradeIntents.createdAt, since)).orderBy(desc(schema.tradeIntents.createdAt)).limit(20) : Promise.resolve([]),
      db.select().from(schema.quoteRecords).where(gte(schema.quoteRecords.createdAt, since)).orderBy(desc(schema.quoteRecords.createdAt)).limit(20),
    ]);

    const latestSnapshotByToken = new Map<string, typeof snapshotRows[number]>();
    for (const snapshot of snapshotRows) {
      if (!latestSnapshotByToken.has(snapshot.tokenAddress)) {
        latestSnapshotByToken.set(snapshot.tokenAddress, snapshot);
      }
    }

    const tokenAddresses = [...latestSnapshotByToken.keys()];
    const tokenRows = tokenAddresses.length > 0
      ? await db.select().from(schema.tokens).where(inArray(schema.tokens.address, tokenAddresses))
      : [];
    const tokenByAddress = new Map(tokenRows.map((token) => [token.address, token]));

    return {
      success: true,
      data: {
        marketRail: [...latestSnapshotByToken.values()].map((snapshot) => {
          const token = tokenByAddress.get(snapshot.tokenAddress);
          return {
            tokenAddress: snapshot.tokenAddress,
            symbol: token?.symbol || snapshot.tokenAddress.slice(0, 6),
            name: token?.name || null,
            priceUsd: Number(snapshot.priceUsd || 0),
            priceChange1h: Number(snapshot.priceChange1h || 0),
            priceChange24h: Number(snapshot.priceChange24h || 0),
            volume24hUsd: Number(snapshot.volume24hUsd || 0),
            liquidityUsd: Number(snapshot.liquidityUsd || 0),
            snapshotAt: snapshot.snapshotAt.toISOString(),
          };
        }),
        tradingAccounts: tradingAccounts.map((account) => ({
          id: account.id,
          walletAddress: account.walletAddress,
          label: account.label,
          isPrimary: account.isPrimary === "true",
          connectedAt: account.connectedAt.toISOString(),
          lastUsedAt: account.lastUsedAt?.toISOString() || null,
        })),
        tradeIntents: tradeIntents.map((intent) => ({
          id: intent.id,
          tokenAddress: intent.tokenAddress,
          tradeType: intent.tradeType,
          amount: Number(intent.amount),
          amountType: intent.amountType,
          slippageBps: intent.slippageBps,
          status: intent.status,
          createdAt: intent.createdAt.toISOString(),
        })),
        quoteRecords: quoteRecords.map((quote) => ({
          id: quote.id,
          provider: quote.provider,
          inputMint: quote.inputMint,
          outputMint: quote.outputMint,
          inputAmount: Number(quote.inputAmount),
          expectedOutput: Number(quote.expectedOutput),
          minimumOutput: Number(quote.minimumOutput),
          priceImpactPct: quote.priceImpactPct ? Number(quote.priceImpactPct) : null,
          routePlan: quote.routePlan,
          expiresAt: quote.expiresAt?.toISOString() || null,
          createdAt: quote.createdAt.toISOString(),
        })),
        executionState: {
          mode: "preparation_only",
          reason: "Wallet signing and transaction submission remain Phase 3 work.",
        },
        dataWindow: serializeRecentWindow(since),
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
