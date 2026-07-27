import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { eq, desc } from "drizzle-orm";
import { resolveSourceMetadata } from "./source-metadata.js";

const paramsSchema = z.object({
  address: z.string().min(32).max(44),
});

export const tokenRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Params: z.infer<typeof paramsSchema> }>("/tokens/:address", async (request, reply) => {
    const { address } = paramsSchema.parse(request.params);
    const db = getDb();

    const tokenRows = await db.select().from(schema.tokens).where(eq(schema.tokens.address, address)).limit(1);
    const token = tokenRows[0];

    if (!token) {
      reply.status(404);
      return { success: false, error: "Token not found", requestId: request.id, timestamp: new Date().toISOString() };
    }

    const [snapshotRows, launchRows, signalRows] = await Promise.all([
      db.select().from(schema.tokenSnapshots).where(eq(schema.tokenSnapshots.tokenAddress, address)).orderBy(desc(schema.tokenSnapshots.snapshotAt)).limit(1),
      db.select().from(schema.tokenLaunches).where(eq(schema.tokenLaunches.tokenAddress, address)).limit(1),
      db.select().from(schema.signals).where(eq(schema.signals.tokenAddress, address)).orderBy(desc(schema.signals.detectedAt)).limit(5),
    ]);

    const snapshot = snapshotRows[0];
    const launch = launchRows[0];

    const factors = signalRows.length > 0
      ? await db.select().from(schema.signalFactors).where(eq(schema.signalFactors.signalId, signalRows[0]!.id))
      : [];

    const positiveFactors = factors.filter(f => f.factorType === "positive").map(f => ({
      factorName: f.factorName,
      rawValue: f.rawValue,
      contribution: Number(f.contribution),
    }));

    const negativeFactors = factors.filter(f => f.factorType === "negative").map(f => ({
      factorName: f.factorName,
      rawValue: f.rawValue,
      contribution: Number(f.contribution),
    }));

    const latestSignal = signalRows[0];
    const sourceMetadata = resolveSourceMetadata({
      signalMetadata: latestSignal?.metadata,
      launchMetadata: launch?.metadata,
      snapshotAt: snapshot?.snapshotAt,
      detectedAt: latestSignal?.detectedAt,
      launchedAt: launch?.launchedAt,
      firstSeenAt: token.firstSeenAt,
    });

    return {
      success: true,
      data: {
        token: {
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          isVerified: token.isVerified,
          firstSeenAt: token.firstSeenAt?.toISOString(),
        },
        market: snapshot ? {
          marketCapUsd: Number(snapshot.marketCapUsd || 0),
          priceUsd: Number(snapshot.priceUsd || 0),
          volume1hUsd: Number(snapshot.volume1hUsd || 0),
          volume24hUsd: Number(snapshot.volume24hUsd || 0),
          liquidityUsd: Number(snapshot.liquidityUsd || 0),
          holderCount: snapshot.holderCount,
          priceChange1h: Number(snapshot.priceChange1h || 0),
          priceChange24h: Number(snapshot.priceChange24h || 0),
          snapshotAt: snapshot.snapshotAt.toISOString(),
        } : null,
        launch: launch ? {
          deployerAddress: launch.deployerAddress,
          launchedAt: launch.launchedAt.toISOString(),
          initialLiquidityUsd: Number(launch.initialLiquidityUsd || 0),
          launchProgram: launch.launchProgram,
        } : null,
        intelligence: latestSignal ? {
          score: latestSignal.signalScore,
          confidence: Number(latestSignal.confidence),
          rulesetVersion: latestSignal.rulesetVersion,
          priority: latestSignal.priority,
          positiveFactors,
          negativeFactors,
          detectedAt: latestSignal.detectedAt?.toISOString(),
        } : null,
        dataSource: sourceMetadata.dataSource,
        dataFreshness: sourceMetadata.dataFreshness,
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
