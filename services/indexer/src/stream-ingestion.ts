import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { logger } from "@memecoin/logger";
import { createProviderRegistry, type IProviderRegistry, type StreamEvent, type TokenInfo } from "@memecoin/solana";
import { eq } from "drizzle-orm";
import { runIngestionPipeline, type RawTokenEvent } from "./pipeline.js";

const log = logger("stream-ingestion");
const SOL_MINT = "So11111111111111111111111111111111111111112";
const DEFAULT_STREAM_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNestedRecord(value: unknown, key: string) {
  return isRecord(value) && isRecord(value[key]) ? value[key] : null;
}

function getAccountKeys(rawData: unknown): string[] {
  const transaction = getNestedRecord(rawData, "transaction");
  const message = transaction ? getNestedRecord(transaction, "message") : null;
  const accountKeys = Array.isArray(message?.accountKeys) ? message.accountKeys : [];

  return accountKeys
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (isRecord(entry) && typeof entry.pubkey === "string") return entry.pubkey;
      return null;
    })
    .filter((value): value is string => Boolean(value));
}

function getPostTokenBalances(rawData: unknown): Array<Record<string, unknown>> {
  const metaRoot = getNestedRecord(rawData, "meta")
    || getNestedRecord(getNestedRecord(rawData, "transaction"), "meta");

  if (!metaRoot || !Array.isArray(metaRoot.postTokenBalances)) {
    return [];
  }

  return metaRoot.postTokenBalances.filter(isRecord);
}

function extractCandidateMint(rawData: unknown) {
  const balances = getPostTokenBalances(rawData);

  for (const balance of balances) {
    const mint = typeof balance.mint === "string" ? balance.mint : null;
    if (!mint || mint === SOL_MINT) continue;

    const decimals = isRecord(balance.uiTokenAmount) && typeof balance.uiTokenAmount.decimals === "number"
      ? balance.uiTokenAmount.decimals
      : 9;

    return {
      mint,
      decimals,
    };
  }

  return null;
}

function buildRawTokenEvent(
  event: StreamEvent,
  tokenInfo: TokenInfo,
  deployer: string,
  decimals: number,
): RawTokenEvent {
  return {
    tokenAddress: tokenInfo.address,
    symbol: tokenInfo.symbol || tokenInfo.address.slice(0, 6),
    name: tokenInfo.name || "Stream Token",
    decimals: tokenInfo.decimals ?? decimals,
    deployer,
    initialLiquidity: 0,
    timestamp: new Date(event.timestamp * 1000).toISOString(),
  };
}

export async function processStreamEvent(
  event: StreamEvent,
  registry: IProviderRegistry,
): Promise<boolean> {
  const db = getDb();
  const existing = await db.select({ id: schema.rawProviderEvents.id })
    .from(schema.rawProviderEvents)
    .where(eq(schema.rawProviderEvents.txSignature, event.signature))
    .limit(1);

  if (existing.length > 0) {
    return false;
  }

  const rawData = isRecord(event.data) ? event.data : null;
  if (!rawData) {
    return false;
  }

  const candidateMint = extractCandidateMint(rawData);
  if (!candidateMint) {
    return false;
  }

  const tokenInfo = await registry.tokenDiscovery.getTokenInfo(candidateMint.mint);
  if (!tokenInfo) {
    return false;
  }

  const accountKeys = getAccountKeys(rawData);
  const deployer = accountKeys[0] || "unknown-deployer";
  const rawTokenEvent = buildRawTokenEvent(event, tokenInfo, deployer, candidateMint.decimals);

  await runIngestionPipeline(rawTokenEvent, {
    provider: registry.transactionStream.name,
    txSignature: event.signature,
  });

  log.info(
    { signature: event.signature, tokenAddress: rawTokenEvent.tokenAddress },
    "Queued streamed token event",
  );
  return true;
}

export async function startTransactionStreamIngestion(
  registry: IProviderRegistry = createProviderRegistry(),
) {
  const subscription = await registry.transactionStream.subscribe({
    programs: [DEFAULT_STREAM_PROGRAM],
  });

  log.info({ subscriptionId: subscription.subscriptionId }, "Transaction stream ingestion started");

  for await (const event of subscription) {
    try {
      await processStreamEvent(event, registry);
    } catch (error) {
      log.error({ error, signature: event.signature }, "Failed to process stream event");
    }
  }
}
