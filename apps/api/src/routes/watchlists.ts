import { randomUUID } from "crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { ensureDevelopmentUser, resolveDevelopmentUser } from "./dev-user.js";

const createWatchlistSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(240).optional(),
});

const createWatchlistItemSchema = z.object({
  itemType: z.enum(["token", "wallet"]),
  itemAddress: z.string().min(10).max(80),
  note: z.string().max(240).optional(),
});

async function buildWatchlistResponse(db: ReturnType<typeof getDb>, userId: string) {
  const watchlists = await db.select().from(schema.watchlists).where(eq(schema.watchlists.userId, userId));

  if (watchlists.length === 0) {
    return [];
  }

  const watchlistIds = watchlists.map((watchlist) => watchlist.id);
  const items = await db.select().from(schema.watchlistItems).where(inArray(schema.watchlistItems.watchlistId, watchlistIds));

  const tokenAddresses = items.filter((item) => item.itemType === "token").map((item) => item.itemAddress);
  const walletAddresses = items.filter((item) => item.itemType === "wallet").map((item) => item.itemAddress);

  const [tokens, wallets] = await Promise.all([
    tokenAddresses.length > 0
      ? db.select().from(schema.tokens).where(inArray(schema.tokens.address, tokenAddresses))
      : Promise.resolve([]),
    walletAddresses.length > 0
      ? db.select().from(schema.wallets).where(inArray(schema.wallets.address, walletAddresses))
      : Promise.resolve([]),
  ]);

  const tokenByAddress = new Map(tokens.map((token) => [token.address, token]));
  const walletByAddress = new Map(wallets.map((wallet) => [wallet.address, wallet]));

  return watchlists.map((watchlist) => {
    const watchlistItems = items
      .filter((item) => item.watchlistId === watchlist.id)
      .map((item) => ({
        id: item.id,
        itemType: item.itemType,
        itemAddress: item.itemAddress,
        note: item.note,
        addedAt: item.addedAt.toISOString(),
        token: item.itemType === "token"
          ? tokenByAddress.get(item.itemAddress)
            ? {
              symbol: tokenByAddress.get(item.itemAddress)?.symbol,
              name: tokenByAddress.get(item.itemAddress)?.name,
            }
            : null
          : null,
        wallet: item.itemType === "wallet"
          ? walletByAddress.get(item.itemAddress)
            ? {
              label: walletByAddress.get(item.itemAddress)?.label,
              classification: walletByAddress.get(item.itemAddress)?.classification,
              totalTrades: walletByAddress.get(item.itemAddress)?.totalTrades,
            }
            : null
          : null,
      }));

    return {
      id: watchlist.id,
      name: watchlist.name,
      description: watchlist.description,
      isDefault: watchlist.isDefault,
      createdAt: watchlist.createdAt.toISOString(),
      updatedAt: watchlist.updatedAt.toISOString(),
      itemCount: watchlistItems.length,
      items: watchlistItems,
    };
  });
}

export const watchlistsRoute: FastifyPluginAsync = async (app) => {
  app.get("/watchlists", async (request) => {
    const db = getDb();
    const user = await resolveDevelopmentUser(db);

    const data = user ? await buildWatchlistResponse(db, user.id) : [];

    return {
      success: true,
      data,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.post("/watchlists", async (request) => {
    const body = createWatchlistSchema.parse(request.body || {});
    const db = getDb();
    const user = await ensureDevelopmentUser(db);
    const watchlistId = randomUUID();

    await db.insert(schema.watchlists).values({
      id: watchlistId,
      userId: user.id,
      name: body.name,
      description: body.description,
      isDefault: false,
    });

    const data = await buildWatchlistResponse(db, user.id);

    return {
      success: true,
      data,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.post("/watchlists/:watchlistId/items", async (request) => {
    const params = z.object({ watchlistId: z.string() }).parse(request.params);
    const body = createWatchlistItemSchema.parse(request.body || {});
    const db = getDb();
    const user = await ensureDevelopmentUser(db);

    const userWatchlists = await db.select().from(schema.watchlists).where(eq(schema.watchlists.userId, user.id));
    const targetWatchlist = userWatchlists.find((watchlist) => watchlist.id === params.watchlistId);

    if (!targetWatchlist) {
      return {
        success: false,
        error: "Watchlist not found",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    }

    await db.insert(schema.watchlistItems).values({
      id: randomUUID(),
      watchlistId: targetWatchlist.id,
      itemType: body.itemType,
      itemAddress: body.itemAddress,
      note: body.note,
    });

    const data = await buildWatchlistResponse(db, user.id);

    return {
      success: true,
      data,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.delete("/watchlists/:watchlistId/items/:itemId", async (request, reply) => {
    const params = z.object({
      watchlistId: z.string(),
      itemId: z.string(),
    }).parse(request.params);
    const db = getDb();
    const user = await resolveDevelopmentUser(db);

    if (!user) {
      reply.status(404);
      return {
        success: false,
        error: "Watchlist not found",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    }

    const userWatchlists = await db.select().from(schema.watchlists).where(eq(schema.watchlists.userId, user.id));
    const targetWatchlist = userWatchlists.find((watchlist) => watchlist.id === params.watchlistId);

    if (!targetWatchlist) {
      reply.status(404);
      return {
        success: false,
        error: "Watchlist not found",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    }

    await db.delete(schema.watchlistItems).where(eq(schema.watchlistItems.id, params.itemId));

    const data = await buildWatchlistResponse(db, user.id);

    return {
      success: true,
      data,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
