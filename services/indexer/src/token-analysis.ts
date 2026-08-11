import { randomUUID } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { logger } from "@memecoin/logger";
import {
  createProviderRegistry,
  fetchDexScreenerTokenData,
  type HolderInfo,
  type MarketData,
  type TokenInfo,
} from "@memecoin/solana";
import { discoverWalletsForToken } from "./token-wallet-discovery.js";
import { isValidSolanaWalletAddress } from "./wallet-pipeline.js";

const log = logger("token-analysis");
const ANALYSIS_VERSION = "contract-graph-v0.1.0";
const HOLDER_LIMIT = 20;
const EARLY_ENTRY_WINDOW_MS = 30 * 60 * 1000;
const CO_ENTRY_WINDOW_MS = 2 * 60 * 1000;

interface RelationshipEvidence {
  source: string;
  tokenAddresses: string[];
  observationCount: number;
  [key: string]: unknown;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isValidTokenAddress(address: string) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

function choosePair(
  data: Awaited<ReturnType<typeof fetchDexScreenerTokenData>>,
  tokenAddress: string,
) {
  return [...(data?.pairs ?? [])]
    .filter((pair) => pair.baseToken.address === tokenAddress || pair.quoteToken.address === tokenAddress)
    .sort((left, right) => (right.liquidity?.usd ?? 0) - (left.liquidity?.usd ?? 0))[0] ?? null;
}

async function ensureToken(
  tokenAddress: string,
  tokenInfo: TokenInfo | null,
  marketData: MarketData | null,
) {
  const db = getDb();
  const existing = await db.select().from(schema.tokens)
    .where(eq(schema.tokens.address, tokenAddress))
    .limit(1);
  const dexData = await fetchDexScreenerTokenData(tokenAddress);
  const pair = choosePair(dexData, tokenAddress);
  const pairToken = pair?.baseToken.address === tokenAddress ? pair.baseToken : pair?.quoteToken;

  if (!tokenInfo && !pairToken && existing.length === 0) {
    throw new Error("No Solana token metadata or market pair was found for this contract address");
  }

  let token = existing[0];
  if (!token) {
    const tokenId = randomUUID();
    const firstSeenAt = pair?.pairCreatedAt ? new Date(pair.pairCreatedAt) : new Date();
    await db.insert(schema.tokens).values({
      id: tokenId,
      address: tokenAddress,
      symbol: tokenInfo?.symbol || pairToken?.symbol || tokenAddress.slice(0, 6),
      name: tokenInfo?.name || pairToken?.name || `Token ${tokenAddress.slice(0, 8)}`,
      decimals: tokenInfo?.decimals ?? 9,
      totalSupply: tokenInfo?.totalSupply ?? "0",
      logoUrl: tokenInfo?.logoUri ?? null,
      isVerified: tokenInfo?.isVerified ?? false,
      firstSeenAt,
    }).onConflictDoNothing();
    token = (await db.select().from(schema.tokens)
      .where(eq(schema.tokens.address, tokenAddress))
      .limit(1))[0];
  } else if (tokenInfo || pairToken) {
    await db.update(schema.tokens).set({
      symbol: tokenInfo?.symbol || pairToken?.symbol || token.symbol,
      name: tokenInfo?.name || pairToken?.name || token.name,
      decimals: tokenInfo?.decimals ?? token.decimals,
      logoUrl: tokenInfo?.logoUri ?? token.logoUrl,
      isVerified: tokenInfo?.isVerified ?? token.isVerified,
      updatedAt: new Date(),
    }).where(eq(schema.tokens.id, token.id));
  }

  if (!token) throw new Error("Token record could not be persisted");

  if (marketData) {
    await db.insert(schema.tokenSnapshots).values({
      id: randomUUID(),
      tokenId: token.id,
      tokenAddress,
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
  }

  return token;
}

async function ensureWallets(addresses: string[]) {
  const db = getDb();
  const uniqueAddresses = [...new Set(addresses.filter(Boolean))];
  const existing = uniqueAddresses.length > 0
    ? await db.select().from(schema.wallets).where(inArray(schema.wallets.address, uniqueAddresses))
    : [];
  const existingAddresses = new Set(existing.map((wallet) => wallet.address));

  for (const address of uniqueAddresses) {
    if (existingAddresses.has(address)) continue;
    await db.insert(schema.wallets).values({
      id: randomUUID(),
      address,
      classification: isValidSolanaWalletAddress(address) ? "unknown" : "program_or_pool",
      totalTrades: 0,
      metadata: {
        discoveredBy: ANALYSIS_VERSION,
        discoveredAt: new Date().toISOString(),
      },
    }).onConflictDoNothing();
  }

  const rows = uniqueAddresses.length > 0
    ? await db.select().from(schema.wallets).where(inArray(schema.wallets.address, uniqueAddresses))
    : [];
  return new Map(rows.map((wallet) => [wallet.address, wallet]));
}

async function persistHolderSnapshot(
  tokenId: string,
  tokenAddress: string,
  holders: HolderInfo[],
) {
  const db = getDb();
  const snapshotAt = new Date();
  const walletByAddress = await ensureWallets(holders.map((holder) => holder.address));
  let inserted = 0;

  for (const [index, holder] of holders.entries()) {
    const wallet = walletByAddress.get(holder.address);
    if (!wallet) continue;
    await db.insert(schema.tokenHolderSnapshots).values({
      id: randomUUID(),
      tokenId,
      tokenAddress,
      walletId: wallet.id,
      walletAddress: wallet.address,
      rank: index + 1,
      balance: holder.balance,
      percentage: Number.isFinite(holder.percentage) ? holder.percentage.toFixed(6) : null,
      source: "solana-rpc-getTokenLargestAccounts",
      snapshotAt,
    });
    inserted++;
  }

  return { inserted, snapshotAt };
}

async function upsertRelationship(
  walletAId: string,
  walletBId: string,
  relationshipType: string,
  confidence: number,
  evidence: RelationshipEvidence,
) {
  if (walletAId === walletBId) return false;
  const db = getDb();
  const [leftId, rightId] = walletAId < walletBId
    ? [walletAId, walletBId]
    : [walletBId, walletAId];
  const existing = await db.select().from(schema.walletRelationships).where(and(
    eq(schema.walletRelationships.walletAId, leftId),
    eq(schema.walletRelationships.walletBId, rightId),
    eq(schema.walletRelationships.relationshipType, relationshipType),
  )).limit(1);
  const previous = existing[0];

  if (!previous) {
    await db.insert(schema.walletRelationships).values({
      id: randomUUID(),
      walletAId: leftId,
      walletBId: rightId,
      relationshipType,
      confidence: Math.min(confidence, 0.99).toFixed(4),
      evidence,
    });
    return true;
  }

  const previousEvidence = asRecord(previous.evidence);
  const tokenAddresses = [...new Set([
    ...(Array.isArray(previousEvidence.tokenAddresses) ? previousEvidence.tokenAddresses.filter((value): value is string => typeof value === "string") : []),
    ...evidence.tokenAddresses,
  ])];
  await db.update(schema.walletRelationships).set({
    confidence: Math.max(Number(previous.confidence), confidence).toFixed(4),
    evidence: {
      ...previousEvidence,
      ...evidence,
      tokenAddresses,
      observationCount: tokenAddresses.length,
      lastObservedAt: new Date().toISOString(),
    },
    detectedAt: new Date(),
  }).where(eq(schema.walletRelationships.id, previous.id));
  return false;
}

function firstBuyByWallet<T extends { walletId: string; tradedAt: Date }>(trades: T[]) {
  const first = new Map<string, T>();
  for (const trade of [...trades].sort((left, right) => left.tradedAt.getTime() - right.tradedAt.getTime())) {
    if (!first.has(trade.walletId)) first.set(trade.walletId, trade);
  }
  return first;
}

async function deriveRelationships(tokenAddress: string) {
  const db = getDb();
  const [launchRows, currentTrades] = await Promise.all([
    db.select().from(schema.tokenLaunches).where(eq(schema.tokenLaunches.tokenAddress, tokenAddress)).limit(1),
    db.select().from(schema.walletTrades).where(and(
      eq(schema.walletTrades.tokenAddress, tokenAddress),
      eq(schema.walletTrades.tradeType, "buy"),
    )).orderBy(asc(schema.walletTrades.tradedAt)),
  ]);
  const launch = launchRows[0];
  const firstCurrentBuys = [...firstBuyByWallet(currentTrades).values()].slice(0, 20);
  let relationshipsDetected = 0;

  for (let leftIndex = 0; leftIndex < firstCurrentBuys.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < firstCurrentBuys.length; rightIndex++) {
      const left = firstCurrentBuys[leftIndex]!;
      const right = firstCurrentBuys[rightIndex]!;
      const separationSeconds = Math.abs(left.tradedAt.getTime() - right.tradedAt.getTime()) / 1_000;
      if (separationSeconds > CO_ENTRY_WINDOW_MS / 1_000) continue;
      const created = await upsertRelationship(
        left.walletId,
        right.walletId,
        "co_entry",
        Math.max(0.55, 0.8 - (separationSeconds / 600)),
        {
          source: "indexed-wallet-trades",
          tokenAddresses: [tokenAddress],
          observationCount: 1,
          separationSeconds,
          firstObservedAt: left.tradedAt < right.tradedAt ? left.tradedAt.toISOString() : right.tradedAt.toISOString(),
        },
      );
      if (created) relationshipsDetected++;
    }
  }

  if (!launch || !isValidSolanaWalletAddress(launch.deployerAddress)) {
    return { relationshipsDetected, relatedLaunches: launch ? 1 : 0, repeatEarlyBuyers: 0 };
  }

  const relatedLaunches = await db.select().from(schema.tokenLaunches)
    .where(eq(schema.tokenLaunches.deployerAddress, launch.deployerAddress));
  const launchByToken = new Map(relatedLaunches.map((item) => [item.tokenAddress, item]));
  const relatedTokenAddresses = [...launchByToken.keys()];
  const relatedTrades = relatedTokenAddresses.length > 0
    ? await db.select().from(schema.walletTrades).where(and(
      inArray(schema.walletTrades.tokenAddress, relatedTokenAddresses),
      eq(schema.walletTrades.tradeType, "buy"),
    )).orderBy(asc(schema.walletTrades.tradedAt))
    : [];

  const earlyWalletsByToken = new Map<string, Map<string, typeof relatedTrades[number]>>();
  for (const trade of relatedTrades) {
    const relatedLaunch = launchByToken.get(trade.tokenAddress);
    if (!relatedLaunch) continue;
    const delayMs = trade.tradedAt.getTime() - relatedLaunch.launchedAt.getTime();
    if (delayMs < 0 || delayMs > EARLY_ENTRY_WINDOW_MS) continue;
    const tokenWallets = earlyWalletsByToken.get(trade.tokenAddress) ?? new Map();
    if (!tokenWallets.has(trade.walletId)) tokenWallets.set(trade.walletId, trade);
    earlyWalletsByToken.set(trade.tokenAddress, tokenWallets);
  }

  const appearances = new Map<string, Set<string>>();
  for (const [relatedTokenAddress, tokenWallets] of earlyWalletsByToken) {
    for (const walletId of tokenWallets.keys()) {
      const tokens = appearances.get(walletId) ?? new Set<string>();
      tokens.add(relatedTokenAddress);
      appearances.set(walletId, tokens);
    }
  }

  const deployerWalletByAddress = await ensureWallets([launch.deployerAddress]);
  const deployerWallet = deployerWalletByAddress.get(launch.deployerAddress);
  let repeatEarlyBuyers = 0;
  if (deployerWallet) {
    for (const [walletId, tokens] of appearances) {
      if (tokens.size < 2) continue;
      repeatEarlyBuyers++;
      const created = await upsertRelationship(
        deployerWallet.id,
        walletId,
        "deployer_circle",
        Math.min(0.95, 0.6 + (tokens.size * 0.08)),
        {
          source: "launches+indexed-wallet-trades",
          tokenAddresses: [...tokens],
          observationCount: tokens.size,
          deployerAddress: launch.deployerAddress,
          entryWindowMinutes: EARLY_ENTRY_WINDOW_MS / 60_000,
        },
      );
      if (created) relationshipsDetected++;
    }
  }

  const pairCounts = new Map<string, { leftId: string; rightId: string; tokens: Set<string> }>();
  for (const [relatedTokenAddress, tokenWallets] of earlyWalletsByToken) {
    const walletIds = [...tokenWallets.keys()].slice(0, 20).sort();
    for (let leftIndex = 0; leftIndex < walletIds.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < walletIds.length; rightIndex++) {
        const leftId = walletIds[leftIndex]!;
        const rightId = walletIds[rightIndex]!;
        const key = `${leftId}:${rightId}`;
        const pair = pairCounts.get(key) ?? { leftId, rightId, tokens: new Set<string>() };
        pair.tokens.add(relatedTokenAddress);
        pairCounts.set(key, pair);
      }
    }
  }
  for (const pair of pairCounts.values()) {
    if (pair.tokens.size < 2) continue;
    const created = await upsertRelationship(
      pair.leftId,
      pair.rightId,
      "repeat_co_entry",
      Math.min(0.95, 0.65 + (pair.tokens.size * 0.07)),
      {
        source: "launches+indexed-wallet-trades",
        tokenAddresses: [...pair.tokens],
        observationCount: pair.tokens.size,
        deployerAddress: launch.deployerAddress,
      },
    );
    if (created) relationshipsDetected++;
  }

  return {
    relationshipsDetected,
    relatedLaunches: relatedLaunches.length,
    repeatEarlyBuyers,
  };
}

export interface TokenAnalysisResult {
  tokenAddress: string;
  analysisVersion: string;
  holdersCaptured: number;
  holderSnapshotAt: string;
  transactionsFetched: number;
  walletsProcessed: number;
  relationshipsDetected: number;
  relatedLaunches: number;
  repeatEarlyBuyers: number;
  coverage: {
    holders: "top_20" | "unavailable";
    buyers: "indexed_and_observed" | "no_swaps_observed" | "provider_unavailable";
    relationships: "co_entry_and_repeat_deployer" | "no_relationships_observed" | "provider_unavailable";
    funding: "unavailable";
  };
}

export async function runTokenAnalysisPipeline(tokenAddress: string): Promise<TokenAnalysisResult> {
  if (!isValidTokenAddress(tokenAddress)) throw new Error("Invalid Solana token address");
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) throw new Error("HELIUS_API_KEY not set");

  const providers = createProviderRegistry({
    heliusApiKey,
    solanaRpcUrl: process.env.SOLANA_RPC_URL,
    birdeyeApiKey: process.env.BIRDEYE_API_KEY,
  });
  const [tokenInfo, marketData, holders] = await Promise.all([
    providers.tokenDiscovery.getTokenInfo(tokenAddress),
    providers.marketData.getMarketData(tokenAddress),
    providers.tokenDiscovery.getTokenHolders(tokenAddress, HOLDER_LIMIT),
  ]);
  if (holders.length === 0) {
    throw new Error("Holder evidence is unavailable for this contract");
  }
  const token = await ensureToken(tokenAddress, tokenInfo, marketData);
  const holderSnapshot = await persistHolderSnapshot(token.id, tokenAddress, holders);
  const walletDiscovery = await discoverWalletsForToken({
    heliusApiKey,
    tokenAddress,
    transactionsPerToken: 100,
    walletLimit: 12,
    minCandidateScore: 5,
  });
  const relationships = await deriveRelationships(tokenAddress);

  const result: TokenAnalysisResult = {
    tokenAddress,
    analysisVersion: ANALYSIS_VERSION,
    holdersCaptured: holderSnapshot.inserted,
    holderSnapshotAt: holderSnapshot.snapshotAt.toISOString(),
    transactionsFetched: walletDiscovery.transactionsFetched,
    walletsProcessed: walletDiscovery.walletsProcessed,
    relationshipsDetected: relationships.relationshipsDetected,
    relatedLaunches: relationships.relatedLaunches,
    repeatEarlyBuyers: relationships.repeatEarlyBuyers,
    coverage: {
      holders: holderSnapshot.inserted > 0 ? "top_20" : "unavailable",
      buyers: !walletDiscovery.sourceAvailable
        ? "provider_unavailable"
        : walletDiscovery.transactionsFetched > 0
          ? "indexed_and_observed"
          : "no_swaps_observed",
      relationships: !walletDiscovery.sourceAvailable
        ? "provider_unavailable"
        : relationships.relationshipsDetected > 0
          ? "co_entry_and_repeat_deployer"
          : "no_relationships_observed",
      funding: "unavailable",
    },
  };
  log.info(result, "Contract intelligence analysis complete");
  return result;
}
