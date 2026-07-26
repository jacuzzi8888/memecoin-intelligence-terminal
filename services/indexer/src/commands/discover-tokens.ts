import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });
import { randomUUID } from "crypto";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { calculateSignalScore } from "@memecoin/intelligence";
import { generateDeepLinks } from "@memecoin/notifications";
import { createProviderRegistry, type TokenInfo } from "@memecoin/solana";
import { logger } from "@memecoin/logger";
import { eq } from "drizzle-orm";

const log = logger("discover-tokens");

async function main() {
  log.info("Starting real token discovery scan...");
  const db = getDb();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const useHelius = !!heliusApiKey;
  const isMainnet = useHelius;

  const rpcUrl = isMainnet
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

  const providers = createProviderRegistry({
    solanaRpcUrl: rpcUrl,
    heliusApiKey,
    birdeyeApiKey: process.env.BIRDEYE_API_KEY,
  });

  const marketHealth = await providers.marketData.health();
  log.info({ marketHealth, provider: providers.marketData.name }, "Market data health check");

  const health = await providers.blockchain.health();
  log.info({ health, network: isMainnet ? "mainnet" : "devnet", helius: useHelius }, "RPC health check");

  if (!health.healthy) {
    log.error("RPC is not healthy. Aborting.");
    return;
  }

  if (useHelius) {
    const discoveryHealth = await providers.tokenDiscovery.health();
    log.info({ discoveryHealth, provider: providers.tokenDiscovery.name }, "Token discovery health check");
  }

  log.info({ network: isMainnet ? "mainnet" : "devnet" }, "Scanning for new tokens...");

  let tokenEvents: Array<{
    tokenAddress: string;
    deployer: string;
    timestamp: number;
    slot: number;
    signature: string;
    decimals: number;
    tokenInfo: TokenInfo | null;
  }> = [];

  if (useHelius) {
    log.info({ provider: providers.tokenDiscovery.name }, "Using registry-backed token discovery...");
    const since = new Date(Date.now() - 3600_000);
    const discoveredTokens = await providers.tokenDiscovery.getNewTokens(since);
    log.info({ count: discoveredTokens.length }, "Registry token discovery returned token events");

    for (const evt of discoveredTokens) {
      const info = await providers.tokenDiscovery.getTokenInfo(evt.tokenAddress);
      tokenEvents.push({
        tokenAddress: evt.tokenAddress,
        deployer: evt.deployer,
        timestamp: evt.timestamp,
        slot: evt.slot,
        signature: evt.signature,
        decimals: info?.decimals || 9,
        tokenInfo: info,
      });
    }
  }

  if (tokenEvents.length === 0) {
    log.info("No tokens from Helius, falling back to RPC scan...");
    const connection = providers.blockchain.getConnection();
    const { PublicKey } = await import("@solana/web3.js");
    const TOKEN_PROGRAM = isMainnet
      ? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      : "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

    const signatures = await connection.getSignaturesForAddress(
      new PublicKey(TOKEN_PROGRAM),
      { limit: 20 },
    );

    log.info({ count: signatures.length }, "Found recent transactions");

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (const sigInfo of signatures) {
      try {
        const tx = await connection.getTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx || tx.meta?.err) continue;

        const instructions = tx.transaction.message.compiledInstructions || [];
        const accountKeys = tx.transaction.message.staticAccountKeys || [];

        for (const ix of instructions) {
          const programId = accountKeys[ix.programIdIndex]?.toString();
          if (programId !== TOKEN_PROGRAM) continue;

          const data = Buffer.from(ix.data);
          if (data.length < 1 || data[0] !== 0) continue;

          const mintIndex = ix.accountKeyIndexes[0];
          const authorityIndex = ix.accountKeyIndexes[2];
          if (mintIndex === undefined) continue;

          const mintAddress = accountKeys[mintIndex]?.toString();
          const deployer = authorityIndex !== undefined
            ? accountKeys[authorityIndex]?.toString()
            : null;
          if (!mintAddress) continue;

          const decimals = data.length >= 5 ? data[4] : 9;

          tokenEvents.push({
            tokenAddress: mintAddress,
            deployer: deployer || "",
            timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
            slot: tx.slot,
            signature: sigInfo.signature,
            decimals: decimals ?? 9,
            tokenInfo: null,
          });
        }
      } catch (err) {
        log.debug({ error: err }, "Failed to process transaction");
      }
      await sleep(500);
    }
  }

  log.info({ totalEvents: tokenEvents.length }, "Processing discovered tokens...");

  let tokensFound = 0;
  let tokensProcessed = 0;

  for (const evt of tokenEvents.slice(0, 20)) {
    try {
      const existing = await db.select().from(schema.tokens).where(eq(schema.tokens.address, evt.tokenAddress)).limit(1);
      if (existing.length > 0) {
        log.debug({ address: evt.tokenAddress }, "Token already exists, skipping");
        continue;
      }

      log.info(
        { address: evt.tokenAddress, deployer: evt.deployer, decimals: evt.decimals, slot: evt.slot },
        "New token launch detected!",
      );
      tokensFound++;

      let tokenMeta = { symbol: "NEW", name: `Token ${evt.tokenAddress.slice(0, 8)}` };
      if (evt.tokenInfo) {
        tokenMeta = { symbol: evt.tokenInfo.symbol, name: evt.tokenInfo.name };
      }

      const candidateTokenId = randomUUID();
      const rawEventId = randomUUID();

      await db.insert(schema.rawProviderEvents).values({
        id: rawEventId,
        provider: useHelius ? providers.tokenDiscovery.name : "solana-rpc",
        eventType: "token_launch",
        rawJson: evt as unknown as Record<string, unknown>,
        txSignature: evt.signature,
        slot: String(evt.slot),
        blockTime: new Date(evt.timestamp * 1000),
        processingStatus: "processed",
      });

      await db.insert(schema.tokens).values({
        id: candidateTokenId,
        address: evt.tokenAddress,
        symbol: tokenMeta.symbol,
        name: tokenMeta.name,
        decimals: evt.decimals,
        totalSupply: "0",
        firstSeenAt: new Date(evt.timestamp * 1000),
      }).onConflictDoNothing();

      const persistedTokenRows = await db
        .select({ id: schema.tokens.id })
        .from(schema.tokens)
        .where(eq(schema.tokens.address, evt.tokenAddress))
        .limit(1);
      const persistedToken = persistedTokenRows[0];

      if (!persistedToken) {
        log.error({ tokenAddress: evt.tokenAddress }, "Token row was not persisted");
        continue;
      }

      const tokenId = persistedToken.id;

      await db.insert(schema.tokenLaunches).values({
        id: randomUUID(),
        tokenId,
        tokenAddress: evt.tokenAddress,
        deployerAddress: evt.deployer,
        launchedAt: new Date(evt.timestamp * 1000),
        initialLiquidityUsd: "0",
        launchProgram: "Token Program",
        txSignature: evt.signature,
        slot: String(evt.slot),
      }).onConflictDoNothing();

      const marketData = await providers.marketData.getMarketData(evt.tokenAddress);
      const now = Math.floor(Date.now() / 1000);
      const tokenAgeMinutes = Math.max(1, Math.floor((now - evt.timestamp) / 60));

      log.info(
        { tokenAddress: evt.tokenAddress, hasMarketData: !!marketData, provider: providers.marketData.name },
        "Fetched market data",
      );

      if (marketData) {
        try {
          await db.insert(schema.tokenSnapshots).values({
            id: randomUUID(),
            tokenId,
            tokenAddress: evt.tokenAddress,
            marketCapUsd: String(marketData.marketCapUsd),
            priceUsd: String(marketData.priceUsd),
            volume1hUsd: String(marketData.volume1hUsd),
            volume24hUsd: String(marketData.volume24hUsd),
            liquidityUsd: String(marketData.liquidityUsd),
            holderCount: marketData.holderCount || null,
            priceChange1h: String(marketData.priceChange1h),
            priceChange24h: String(marketData.priceChange24h),
            snapshotAt: new Date(),
          });
        } catch (err) {
          log.debug({ error: err }, "Failed to insert token snapshot");
        }
      }

      const scoreResult = calculateSignalScore({
        tokenAge: tokenAgeMinutes,
        liquidityUsd: marketData?.liquidityUsd ?? null,
        volume1hUsd: marketData?.volume1hUsd ?? null,
        holderCount: marketData?.holderCount || null,
        qualifiedWalletCount: null,
        bundledSupplyPct: null,
        deployerRisk: null,
        topHolderConcentration: null,
        lpLocked: null,
      });

      const strategies = await db.select().from(schema.strategies).limit(1);
      const strategy = strategies[0];

      if (strategy) {
        const signalId = randomUUID();
        await db.insert(schema.signals).values({
          id: signalId,
          strategyId: strategy.id,
          tokenAddress: evt.tokenAddress,
          tokenId,
          signalScore: scoreResult.score,
          confidence: String(scoreResult.confidence),
          rulesetVersion: scoreResult.rulesetVersion,
          priority: scoreResult.score >= 80 ? "critical" : scoreResult.score >= 60 ? "high" : "medium",
        });

        const links = generateDeepLinks(evt.tokenAddress, appUrl);
        const alertId = randomUUID();
        await db.insert(schema.alerts).values({
          id: alertId,
          signalId,
          tokenAddress: evt.tokenAddress,
          priority: scoreResult.score >= 80 ? "critical" : scoreResult.score >= 60 ? "high" : "medium",
          strategyId: strategy.id,
          title: `New Token: ${tokenMeta.symbol} (${evt.tokenAddress.slice(0, 12)}...)`,
          message: `New ${tokenMeta.name} detected on Solana ${isMainnet ? "mainnet" : "devnet"}. Score: ${scoreResult.score}/100`,
          signalScore: scoreResult.score,
          webDeepLink: links.webUrl,
          telegramDeepLink: links.telegramUrl,
          status: "pending",
        });

        await db.insert(schema.alertDeliveries).values({
          id: randomUUID(),
          alertId,
          channel: "dev_outbox",
          destination: "log",
          status: "delivered",
          deliveredAt: new Date(),
        });

        log.info(
          { token: tokenMeta.symbol, address: evt.tokenAddress, score: scoreResult.score },
          "Signal + alert created for new token",
        );
      }

      tokensProcessed++;
    } catch (err) {
      log.error({ error: err, tokenAddress: evt.tokenAddress }, "Failed to process token");
    }
  }

  log.info(
    { network: isMainnet ? "mainnet" : "devnet", helius: useHelius, eventsFound: tokenEvents.length, tokensFound, tokensProcessed },
    "Token discovery scan complete",
  );
}

main().catch((err) => {
  log.error({ error: err }, "Token discovery failed");
  process.exit(1);
});
