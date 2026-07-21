import { randomUUID } from "crypto";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { calculateSignalScore } from "@memecoin/intelligence";
import { formatDevLogAlert, generateDeepLinks } from "@memecoin/notifications";
import { logger } from "@memecoin/logger";

const log = logger("ingest-sample");

async function main() {
  log.info("Starting development event ingestion...");
  const db = getDb();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const tokenAddress = "DevToken" + randomUUID().replace(/-/g, "").slice(0, 30);
  const deployerAddress = "DevDeployer" + randomUUID().replace(/-/g, "").slice(0, 29);

  log.info({ tokenAddress }, "Creating development token launch event");

  const rawEventId = randomUUID();
  await db.insert(schema.rawProviderEvents).values({
    id: rawEventId,
    provider: "development",
    eventType: "token_launch",
    rawJson: {
      tokenAddress,
      symbol: "DEVTK",
      name: "Development Token",
      decimals: 9,
      deployer: deployerAddress,
      initialLiquidity: 15000,
      timestamp: new Date().toISOString(),
    },
    txSignature: `dev-tx-${rawEventId.slice(0, 8)}`,
    processingStatus: "processed",
  });

  const tokenId = randomUUID();
  await db.insert(schema.tokens).values({
    id: tokenId,
    address: tokenAddress,
    symbol: "DEVTK",
    name: "Development Token",
    decimals: 9,
    totalSupply: "1000000000.00000000000000000000",
    firstSeenAt: new Date(),
  }).onConflictDoNothing();

  await db.insert(schema.tokenLaunches).values({
    id: randomUUID(),
    tokenId,
    tokenAddress,
    deployerAddress,
    launchedAt: new Date(),
    initialLiquidityUsd: "15000.000000000000000",
    launchProgram: "development",
    txSignature: `dev-tx-${rawEventId.slice(0, 8)}`,
  });

  await db.insert(schema.markets).values({
    id: randomUUID(),
    tokenAddress,
    poolAddress: `Pool${tokenAddress.slice(0, 20)}`,
    baseMint: tokenAddress,
    quoteMint: "So11111111111111111111111111111111111111112",
    dexProgram: "Raydium",
    liquidityUsd: "15000.000000000000000",
  });

  await db.insert(schema.tokenSnapshots).values({
    id: randomUUID(),
    tokenId,
    tokenAddress,
    marketCapUsd: "750000.000000000000000",
    priceUsd: "0.000750000000000",
    volume1hUsd: "150000.000000000000000",
    volume24hUsd: "1500000.000000000000000",
    liquidityUsd: "15000.000000000000000",
    holderCount: 250,
    priceChange1h: "0.1200",
    priceChange24h: "0.3500",
    snapshotAt: new Date(),
  });

  log.info("Token and market records created");

  const scoreResult = calculateSignalScore({
    tokenAge: 5,
    liquidityUsd: 15000,
    volume1hUsd: 150000,
    holderCount: 250,
    qualifiedWalletCount: 3,
    bundledSupplyPct: 12,
    deployerRisk: 20,
    topHolderConcentration: 35,
    lpLocked: true,
  });

  log.info({ score: scoreResult.score, confidence: scoreResult.confidence }, "Signal score calculated");

  const strategies = await db.select().from(schema.strategies).limit(1);
  const strategy = strategies[0];

  if (strategy) {
    const signalId = randomUUID();
    await db.insert(schema.signals).values({
      id: signalId,
      strategyId: strategy.id,
      tokenAddress,
      tokenId,
      signalScore: scoreResult.score,
      confidence: String(scoreResult.confidence),
      rulesetVersion: scoreResult.rulesetVersion,
      priority: scoreResult.score >= 80 ? "critical" : scoreResult.score >= 60 ? "high" : "medium",
    });

    for (const factor of scoreResult.positiveFactors) {
      await db.insert(schema.signalFactors).values({
        id: randomUUID(),
        signalId,
        factorName: factor.factorName,
        factorType: "positive",
        rawValue: String(factor.rawValue || 0),
        contribution: String(factor.contribution),
        weight: String(factor.weight),
      });
    }
    for (const factor of scoreResult.negativeFactors) {
      await db.insert(schema.signalFactors).values({
        id: randomUUID(),
        signalId,
        factorName: factor.factorName,
        factorType: "negative",
        rawValue: String(factor.rawValue || 0),
        contribution: String(factor.contribution),
        weight: String(factor.weight),
      });
    }

    const links = generateDeepLinks(tokenAddress, appUrl);
    const alertId = randomUUID();
    await db.insert(schema.alerts).values({
      id: alertId,
      signalId,
      tokenAddress,
      priority: scoreResult.score >= 80 ? "critical" : scoreResult.score >= 60 ? "high" : "medium",
      strategyId: strategy.id,
      title: `Signal: ${scoreResult.score}/100 for DEVTK`,
      message: `Development token detected with score ${scoreResult.score}. Confidence: ${scoreResult.confidence}.`,
      signalScore: scoreResult.score,
      webDeepLink: links.webUrl,
      telegramDeepLink: links.telegramUrl,
      status: "pending",
    });

    await db.insert(schema.alertDeliveries).values({
      id: randomUUID(),
      alertId,
      channel: "telegram",
      destination: "dev_outbox",
      status: "delivered",
      deliveredAt: new Date(),
    });

    const alertData = {
      id: alertId,
      tokenSymbol: "DEVTK",
      tokenAddress,
      priority: (scoreResult.score >= 80 ? "critical" : scoreResult.score >= 60 ? "high" : "medium") as "critical" | "high" | "medium",
      signalScore: scoreResult.score,
      confidence: scoreResult.confidence,
      marketCapUsd: 750000,
      liquidityUsd: 15000,
      volume1hUsd: 150000,
      holderCount: 250,
      qualifiedWalletCount: 3,
      tokenAgeMinutes: 5,
      positiveFactors: scoreResult.positiveFactors.map(f => `${f.factorName}: ${f.rawValue}`),
      negativeFactors: scoreResult.negativeFactors.map(f => `${f.factorName}: ${f.rawValue}`),
      webDeepLink: links.webUrl,
      telegramDeepLink: links.telegramUrl,
      triggeredAt: new Date().toISOString(),
    };

    log.info("Alert created and formatted for delivery");
    log.info(formatDevLogAlert(alertData), "Development alert (structured log)");
  }

  log.info("Vertical slice complete: event → token → score → signal → alert");
}

main().catch((err) => {
  log.error({ error: err }, "Ingestion failed");
  process.exit(1);
});
