import { getDb } from "./client.js";
import * as schema from "./schema/index.js";
import { randomUUID } from "crypto";

async function seed() {
  const db = getDb();
  console.log("Seeding development data...");

  const systemUserId = randomUUID();
  const adminUserId = randomUUID();

  await db.insert(schema.users).values([
    { id: systemUserId, name: "System", email: "system@memecoin.dev", role: "system" },
    { id: adminUserId, name: "Dev Admin", email: "admin@memecoin.dev", role: "admin" },
  ]).onConflictDoNothing();

  await db.insert(schema.userProfiles).values([
    { userId: systemUserId, displayName: "System" },
    { userId: adminUserId, displayName: "Dev Admin" },
  ]).onConflictDoNothing();

  await db.insert(schema.userSettings).values([
    { userId: systemUserId },
    { userId: adminUserId },
  ]).onConflictDoNothing();

  const devTokens = [
    { id: randomUUID(), address: "So11111111111111111111111111111111111111112", symbol: "SOL", name: "Wrapped SOL", decimals: 9 },
    { id: randomUUID(), address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { id: randomUUID(), address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK", name: "Bonk", decimals: 5 },
    { id: randomUUID(), address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", symbol: "WIF", name: "dogwifhat", decimals: 6 },
    { id: randomUUID(), address: "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB", symbol: "JUP", name: "Jupiter", decimals: 6 },
  ];

  for (const token of devTokens) {
    await db.insert(schema.tokens).values({
      ...token,
      totalSupply: "1000000000.00000000000000000000",
      isVerified: true,
      firstSeenAt: new Date(Date.now() - 86400000 * 30),
    }).onConflictDoNothing();
  }

  const devWallets = [
    { id: randomUUID(), address: "F4BFjm8zfVni6GKsEn5ryu2mTesFugctZUn8b2ZxGuud", classification: "legitimate_trader", totalTrades: 150 },
    { id: randomUUID(), address: "GvAjuwn9kVyjLeYnNQmGchEGfeSTasU3vVq8YkGARywb", classification: "early_buyer", totalTrades: 85 },
    { id: randomUUID(), address: "5cZqZmUKHXAYcuQqdNmVE7AiLpdxfru6ngQWKFHrGDNy", classification: "legitimate_trader", totalTrades: 200 },
    { id: randomUUID(), address: "FDLSG4FAQWpceHDYBKZ5CaHZKPpVDUv7GqKSmUEDbq5B", classification: "whale", totalTrades: 50 },
    { id: randomUUID(), address: "12Un7i4fz6NbarykmQjJWxPdb4mJoiuAX1Q2v4MVJX8S", classification: "early_buyer", totalTrades: 120 },
  ];

  for (const wallet of devWallets) {
    await db.insert(schema.wallets).values({
      ...wallet,
      label: wallet.classification.replace("_", " "),
      firstSeenAt: new Date(Date.now() - 86400000 * 60),
      lastSeenAt: new Date(Date.now() - 3600000),
    }).onConflictDoNothing();
  }

  const alphaStrategyId = randomUUID();
  const earlyEntryStrategyId = randomUUID();

  await db.insert(schema.strategies).values([
    { id: alphaStrategyId, name: "Alpha Alert", description: "High token score + multiple qualified wallets", currentVersion: "v0.1.0", isActive: "true" },
    { id: earlyEntryStrategyId, name: "Early Entry", description: "Very new token + high wallet quality", currentVersion: "v0.1.0", isActive: "true" },
  ]).onConflictDoNothing();

  await db.insert(schema.strategyVersions).values([
    { id: randomUUID(), strategyId: alphaStrategyId, version: "v0.1.0", isActive: "true", config: { minScore: 70, minQualifiedWallets: 2 } },
    { id: randomUUID(), strategyId: earlyEntryStrategyId, version: "v0.1.0", isActive: "true", config: { maxAgeMinutes: 30, minScore: 60 } },
  ]).onConflictDoNothing();

  const token1 = devTokens[2]!;
  const token2 = devTokens[3]!;

  const signal1Id = randomUUID();
  const signal2Id = randomUUID();
  const signal3Id = randomUUID();
  const signal4Id = randomUUID();
  const signal5Id = randomUUID();

  const signals = [
    { id: signal1Id, strategyId: alphaStrategyId, tokenAddress: token1.address, tokenId: token1.id, signalScore: 82, confidence: "0.78", rulesetVersion: "token-signal-v0.1.0", priority: "high" },
    { id: signal2Id, strategyId: earlyEntryStrategyId, tokenAddress: token2.address, tokenId: token2.id, signalScore: 91, confidence: "0.85", rulesetVersion: "token-signal-v0.1.0", priority: "critical" },
    { id: signal3Id, strategyId: alphaStrategyId, tokenAddress: token1.address, tokenId: token1.id, signalScore: 65, confidence: "0.62", rulesetVersion: "token-signal-v0.1.0", priority: "medium" },
    { id: signal4Id, strategyId: earlyEntryStrategyId, tokenAddress: token2.address, tokenId: token2.id, signalScore: 74, confidence: "0.71", rulesetVersion: "token-signal-v0.1.0", priority: "high" },
    { id: signal5Id, strategyId: alphaStrategyId, tokenAddress: token1.address, tokenId: token1.id, signalScore: 55, confidence: "0.58", rulesetVersion: "token-signal-v0.1.0", priority: "medium" },
  ];

  for (const signal of signals) {
    await db.insert(schema.signals).values(signal).onConflictDoNothing();
  }

  const positiveFactors = [
    { factorName: "liquidity", factorType: "positive", rawValue: "50000", contribution: "15.0000", weight: "0.2000" },
    { factorName: "qualified_wallet_count", factorType: "positive", rawValue: "4", contribution: "12.0000", weight: "0.3000" },
    { factorName: "volume_1h", factorType: "positive", rawValue: "125000", contribution: "10.0000", weight: "0.1000" },
    { factorName: "holder_count", factorType: "positive", rawValue: "350", contribution: "8.0000", weight: "0.1500" },
  ];

  const negativeFactors = [
    { factorName: "top_holder_concentration", factorType: "negative", rawValue: "45", contribution: "-8.0000", weight: "0.1500" },
    { factorName: "token_age", factorType: "negative", rawValue: "120", contribution: "-5.0000", weight: "0.1000" },
  ];

  for (const signal of signals) {
    for (const factor of positiveFactors) {
      await db.insert(schema.signalFactors).values({
        id: randomUUID(),
        signalId: signal.id,
        ...factor,
      }).onConflictDoNothing();
    }
    for (const factor of negativeFactors) {
      await db.insert(schema.signalFactors).values({
        id: randomUUID(),
        signalId: signal.id,
        ...factor,
      }).onConflictDoNothing();
    }
  }

  for (const signal of signals) {
    const alertId = randomUUID();
    await db.insert(schema.alerts).values({
      id: alertId,
      signalId: signal.id,
      userId: adminUserId,
      tokenAddress: signal.tokenAddress,
      priority: signal.priority,
      strategyId: signal.strategyId,
      title: `Signal: ${signal.signalScore}/100 for ${signal.tokenAddress.slice(0, 8)}...`,
      message: `Token detected with score ${signal.signalScore}. Confidence: ${signal.confidence}.`,
      signalScore: signal.signalScore,
      webDeepLink: `http://localhost:3000/tokens/${signal.tokenAddress}`,
      telegramDeepLink: `https://t.me/memecoin_bot?start=token_${signal.tokenAddress}`,
      status: "delivered",
    }).onConflictDoNothing();

    await db.insert(schema.alertDeliveries).values({
      id: randomUUID(),
      alertId,
      channel: "telegram",
      destination: "dev_outbox",
      status: "delivered",
      deliveredAt: new Date(),
    }).onConflictDoNothing();
  }

  for (const token of devTokens.slice(2)) {
    const marketId = randomUUID();
    await db.insert(schema.markets).values({
      id: marketId,
      tokenAddress: token.address,
      poolAddress: `Pool${token.address.slice(0, 20)}`,
      baseMint: token.address,
      quoteMint: "So11111111111111111111111111111111111111112",
      dexProgram: "Raydium",
      liquidityUsd: "25000.000000000000000",
    }).onConflictDoNothing();

    await db.insert(schema.tokenSnapshots).values({
      id: randomUUID(),
      tokenId: token.id,
      tokenAddress: token.address,
      marketCapUsd: "500000.000000000000000",
      priceUsd: "0.000500000000000",
      volume1hUsd: "125000.000000000000000",
      volume24hUsd: "1500000.000000000000000",
      liquidityUsd: "25000.000000000000000",
      holderCount: 350,
      priceChange1h: "0.0500",
      priceChange24h: "0.2500",
      snapshotAt: new Date(),
    }).onConflictDoNothing();

    await db.insert(schema.marketSnapshots).values({
      id: randomUUID(),
      marketId,
      poolAddress: `Pool${token.address.slice(0, 20)}`,
      baseReserve: "50000000.00000000000000000000",
      quoteReserve: "25000.00000000000000000000",
      liquidityUsd: "25000.000000000000000",
      volume24hUsd: "1500000.000000000000000",
      txCount24h: 1250,
      snapshotAt: new Date(),
    }).onConflictDoNothing();
  }

  await db.insert(schema.rawProviderEvents).values({
    id: randomUUID(),
    provider: "development",
    eventType: "token_launch",
    rawJson: {
      tokenAddress: "DevTokenXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      symbol: "DEVTK",
      name: "Development Token",
      deployer: "DevDeployerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      initialLiquidity: 10000,
      timestamp: new Date().toISOString(),
    },
    txSignature: "dev-tx-sig-001",
    processingStatus: "processed",
  }).onConflictDoNothing();

  await db.insert(schema.dataProviders).values({
    id: randomUUID(),
    name: "development",
    type: "mock",
    isActive: "true",
    healthStatus: "healthy",
  }).onConflictDoNothing();

  await db.insert(schema.featureVersions).values([
    { id: randomUUID(), featureName: "token-signal", version: "v0.1.0", description: "Initial token signal scoring", config: { weights: { token: 0.4, wallet: 0.3, timing: 0.2, risk: 0.1 } } },
    { id: randomUUID(), featureName: "wallet-classification", version: "v0.1.0", description: "Initial wallet classification", config: {} },
  ]).onConflictDoNothing();

  console.log("Seed data inserted successfully.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
