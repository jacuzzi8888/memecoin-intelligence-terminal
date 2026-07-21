import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { calculateSignalScore } from "@memecoin/intelligence";
import { generateDeepLinks } from "@memecoin/notifications";
import { logger } from "@memecoin/logger";
import { z } from "zod";

const log = logger("api:dev-ingest");

const ingestSchema = z.object({
  symbol: z.string().default("DEVTK"),
  name: z.string().default("Development Token"),
  initialLiquidity: z.number().default(15000),
});

export const devIngestRoute: FastifyPluginAsync = async (app) => {
  app.post("/dev/ingest", async (request, reply) => {
    const body = ingestSchema.parse(request.body || {});
    const db = getDb();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const tokenAddress = "DevToken" + randomUUID().replace(/-/g, "").slice(0, 30);
    const deployerAddress = "DevDeployer" + randomUUID().replace(/-/g, "").slice(0, 29);

    const rawEventId = randomUUID();
    await db.insert(schema.rawProviderEvents).values({
      id: rawEventId,
      provider: "development",
      eventType: "token_launch",
      rawJson: { tokenAddress, symbol: body.symbol, name: body.name, decimals: 9, deployer: deployerAddress, initialLiquidity: body.initialLiquidity, timestamp: new Date().toISOString() },
      txSignature: `dev-tx-${rawEventId.slice(0, 8)}`,
      processingStatus: "processed",
    });

    const tokenId = randomUUID();
    await db.insert(schema.tokens).values({
      id: tokenId, address: tokenAddress, symbol: body.symbol, name: body.name, decimals: 9,
      totalSupply: "1000000000.00000000000000000000", firstSeenAt: new Date(),
    });

    await db.insert(schema.tokenLaunches).values({
      id: randomUUID(), tokenId, tokenAddress, deployerAddress, launchedAt: new Date(),
      initialLiquidityUsd: String(body.initialLiquidity), launchProgram: "development",
    });

    await db.insert(schema.markets).values({
      id: randomUUID(), tokenAddress, poolAddress: `Pool${tokenAddress.slice(0, 20)}`,
      baseMint: tokenAddress, quoteMint: "So11111111111111111111111111111111111111112",
      dexProgram: "Raydium", liquidityUsd: String(body.initialLiquidity),
    });

    await db.insert(schema.tokenSnapshots).values({
      id: randomUUID(), tokenId, tokenAddress,
      marketCapUsd: String(body.initialLiquidity * 50),
      priceUsd: "0.000500000000000",
      volume1hUsd: String(body.initialLiquidity * 10),
      volume24hUsd: String(body.initialLiquidity * 100),
      liquidityUsd: String(body.initialLiquidity),
      holderCount: 250, priceChange1h: "0.0500", priceChange24h: "0.2500", snapshotAt: new Date(),
    });

    const scoreResult = calculateSignalScore({
      tokenAge: 5, liquidityUsd: body.initialLiquidity, volume1hUsd: body.initialLiquidity * 10,
      holderCount: 250, qualifiedWalletCount: 3, bundledSupplyPct: 12, deployerRisk: 20, topHolderConcentration: 35, lpLocked: true,
    });

    const strategies = await db.select().from(schema.strategies).limit(1);
    const strategy = strategies[0];

    let alertId: string | null = null;
    if (strategy) {
      const signalId = randomUUID();
      await db.insert(schema.signals).values({
        id: signalId, strategyId: strategy.id, tokenAddress, tokenId,
        signalScore: scoreResult.score, confidence: String(scoreResult.confidence),
        rulesetVersion: scoreResult.rulesetVersion,
        priority: scoreResult.score >= 80 ? "critical" : scoreResult.score >= 60 ? "high" : "medium",
      });

      const links = generateDeepLinks(tokenAddress, appUrl);
      alertId = randomUUID();
      await db.insert(schema.alerts).values({
        id: alertId, signalId, tokenAddress,
        priority: scoreResult.score >= 80 ? "critical" : scoreResult.score >= 60 ? "high" : "medium",
        strategyId: strategy.id,
        title: `Signal: ${scoreResult.score}/100 for ${body.symbol}`,
        message: `Token detected with score ${scoreResult.score}`,
        signalScore: scoreResult.score,
        webDeepLink: links.webUrl, telegramDeepLink: links.telegramUrl, status: "pending",
      });

      await db.insert(schema.alertDeliveries).values({
        id: randomUUID(), alertId, channel: "telegram", destination: "dev_outbox",
        status: "delivered", deliveredAt: new Date(),
      });
    }

    log.info({ tokenAddress, score: scoreResult.score }, "Development event ingested");

    return {
      success: true,
      data: { tokenAddress, score: scoreResult.score, confidence: scoreResult.confidence, alertId },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
