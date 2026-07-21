import { randomUUID } from "crypto";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { calculateSignalScore } from "@memecoin/intelligence";
import { formatDevLogAlert, generateDeepLinks } from "@memecoin/notifications";
import { SolanaRpcProvider } from "@memecoin/solana";
import { logger } from "@memecoin/logger";
import { eq } from "drizzle-orm";

const log = logger("discover-tokens");

async function main() {
  log.info("Starting real token discovery scan...");
  const db = getDb();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

  const solanaRpc = new SolanaRpcProvider(rpcUrl);

  const health = await solanaRpc.health();
  log.info({ health }, "Solana RPC health check");

  if (!health.healthy) {
    log.error("Solana RPC is not healthy. Aborting.");
    return;
  }

  log.info("Scanning for recent transactions on Token Program...");

  const connection = solanaRpc.getConnection();
  const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

  const { PublicKey } = await import("@solana/web3.js");
  const signatures = await connection.getSignaturesForAddress(
    new PublicKey(TOKEN_PROGRAM),
    { limit: 50 },
  );

  log.info({ count: signatures.length }, "Found recent transactions");

  let tokensFound = 0;
  let tokensProcessed = 0;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const BATCH_SIZE = 5;
  const DELAY_MS = 1500;

  for (let i = 0; i < Math.min(signatures.length, 10); i += BATCH_SIZE) {
    const batch = signatures.slice(i, i + BATCH_SIZE);

    for (const sigInfo of batch) {
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

          const existing = await db.select().from(schema.tokens).where(eq(schema.tokens.address, mintAddress)).limit(1);
          if (existing.length > 0) {
            log.debug({ mintAddress }, "Token already exists, skipping");
            continue;
          }

          log.info(
            { mintAddress, deployer, decimals, slot: tx.slot, signature: sigInfo.signature },
            "New token launch detected!",
          );

          tokensFound++;

          const tokenId = randomUUID();
          const rawEventId = randomUUID();

          await db.insert(schema.rawProviderEvents).values({
            id: rawEventId,
            provider: "solana-rpc",
            eventType: "token_launch",
            rawJson: {
              tokenAddress: mintAddress,
              deployer: deployer || "",
              decimals,
              slot: tx.slot,
              signature: sigInfo.signature,
              blockTime: tx.blockTime,
            },
            txSignature: sigInfo.signature,
            slot: String(tx.slot),
            blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
            processingStatus: "processed",
          });

          await db.insert(schema.tokens).values({
            id: tokenId,
            address: mintAddress,
            symbol: "NEW",
            name: `New Token ${mintAddress.slice(0, 8)}`,
            decimals,
            totalSupply: "0",
            firstSeenAt: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
          }).onConflictDoNothing();

          await db.insert(schema.tokenLaunches).values({
            id: randomUUID(),
            tokenId,
            tokenAddress: mintAddress,
            deployerAddress: deployer || "",
            launchedAt: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
            initialLiquidityUsd: "0",
            launchProgram: "Token Program",
            txSignature: sigInfo.signature,
            slot: String(tx.slot),
          }).onConflictDoNothing();

          const scoreResult = calculateSignalScore({
            tokenAge: 1,
            liquidityUsd: null,
            volume1hUsd: null,
            holderCount: 0,
            qualifiedWalletCount: 0,
            bundledSupplyPct: null,
            deployerRisk: null,
            topHolderConcentration: null,
            lpLocked: null,
          });

          log.info({ mintAddress, score: scoreResult.score, confidence: scoreResult.confidence }, "Signal score calculated");

          const strategies = await db.select().from(schema.strategies).limit(1);
          const strategy = strategies[0];

          if (strategy) {
            const signalId = randomUUID();
            await db.insert(schema.signals).values({
              id: signalId,
              strategyId: strategy.id,
              tokenAddress: mintAddress,
              tokenId,
              signalScore: scoreResult.score,
              confidence: String(scoreResult.confidence),
              rulesetVersion: scoreResult.rulesetVersion,
              priority: scoreResult.score >= 80 ? "critical" : scoreResult.score >= 60 ? "high" : "medium",
            });

            const links = generateDeepLinks(mintAddress, appUrl);
            const alertId = randomUUID();
            await db.insert(schema.alerts).values({
              id: alertId,
              signalId,
              tokenAddress: mintAddress,
              priority: scoreResult.score >= 80 ? "critical" : scoreResult.score >= 60 ? "high" : "medium",
              strategyId: strategy.id,
              title: `New Token: ${mintAddress.slice(0, 12)}...`,
              message: `New token detected on Solana. Score: ${scoreResult.score}/100`,
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

            const alertData = {
              id: alertId,
              tokenSymbol: "NEW",
              tokenAddress: mintAddress,
              priority: (scoreResult.score >= 80 ? "critical" : scoreResult.score >= 60 ? "high" : "medium") as "critical" | "high" | "medium",
              signalScore: scoreResult.score,
              confidence: scoreResult.confidence,
              positiveFactors: scoreResult.positiveFactors.map((f) => `${f.factorName}: ${f.rawValue}`),
              negativeFactors: scoreResult.negativeFactors.map((f) => `${f.factorName}: ${f.rawValue}`),
              missingFeatures: scoreResult.missingFeatures,
              webDeepLink: links.webUrl,
              telegramDeepLink: links.telegramUrl,
              triggeredAt: new Date().toISOString(),
            };

            log.info(formatDevLogAlert(alertData), "Alert generated for new token");
          }

          tokensProcessed++;
        }
      } catch (err) {
        log.debug({ error: err, signature: sigInfo.signature }, "Failed to process transaction");
      }

      await sleep(DELAY_MS);
    }

    if (i + BATCH_SIZE < Math.min(signatures.length, 10)) {
      log.info({ processed: i + BATCH_SIZE }, "Rate limit pause (3s)...");
      await sleep(3000);
    }
  }

  log.info(
    { tokensFound, tokensProcessed, signaturesScanned: signatures.length },
    "Token discovery scan complete",
  );
}

main().catch((err) => {
  log.error({ error: err }, "Token discovery failed");
  process.exit(1);
});
