import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { logger } from "@memecoin/logger";
import { isValidSolanaWalletAddress, runWalletIntelligencePipeline, type WalletPipelineResult } from "./wallet-pipeline.js";
import { fetchHelius } from "./helius-rate-limit.js";

const log = logger("token-wallet-discovery");
const DISCOVERY_VERSION = "token-wallet-discovery-v0.1.0";
const HELIUS_TIMEOUT_MS = 15_000;

interface HeliusTokenTransfer {
  mint?: string;
  fromUserAccount?: string;
  toUserAccount?: string;
  tokenAmount?: number;
}

interface HeliusEnhancedTransaction {
  signature?: string;
  slot?: number;
  timestamp?: number;
  type?: string;
  source?: string;
  feePayer?: string;
  tokenTransfers?: HeliusTokenTransfer[];
}

interface WalletCandidateEvidence {
  walletAddress: string;
  score: number;
  txCount: number;
  tokenCount: number;
  tokens: Set<string>;
  signatures: Set<string>;
  sources: Set<string>;
  reasons: Set<string>;
}

export interface TokenWalletDiscoveryOptions {
  heliusApiKey: string;
  sinceHours?: number;
  tokenLimit?: number;
  transactionsPerToken?: number;
  walletLimit?: number;
  minCandidateScore?: number;
}

export interface SingleTokenWalletDiscoveryOptions {
  heliusApiKey: string;
  tokenAddress: string;
  transactionsPerToken?: number;
  walletLimit?: number;
  minCandidateScore?: number;
}

export interface TokenWalletDiscoveryResult {
  tokensScanned: number;
  transactionsFetched: number;
  candidatesFound: number;
  walletsProcessed: number;
  walletsQualified: number;
  tradesFetched: number;
  tradesInserted: number;
  failures: Array<{ walletAddress: string; error: string }>;
  candidates: Array<{
    walletAddress: string;
    score: number;
    txCount: number;
    tokenCount: number;
    sources: string[];
    tokens: string[];
    processed: boolean;
    qualified: boolean | null;
    walletScore: number | null;
    classification: string | null;
  }>;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clampPositiveInteger(value: number | undefined, fallback: number, max: number) {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.min(Math.floor(value), max)
    : fallback;
}

async function fetchTokenTransactions(
  tokenAddress: string,
  heliusApiKey: string,
  limit: number,
): Promise<HeliusEnhancedTransaction[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HELIUS_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      "api-key": heliusApiKey,
      limit: String(limit),
      type: "SWAP",
    });
    const response = await fetchHelius(`https://api.helius.xyz/v0/addresses/${tokenAddress}/transactions?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      log.warn({ tokenAddress, status: response.status }, "Token transaction discovery request failed");
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data as HeliusEnhancedTransaction[] : [];
  } catch (error) {
    log.warn({ error, tokenAddress }, "Token transaction discovery request errored");
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function getCandidate(candidates: Map<string, WalletCandidateEvidence>, walletAddress: string) {
  let candidate = candidates.get(walletAddress);
  if (!candidate) {
    candidate = {
      walletAddress,
      score: 0,
      txCount: 0,
      tokenCount: 0,
      tokens: new Set<string>(),
      signatures: new Set<string>(),
      sources: new Set<string>(),
      reasons: new Set<string>(),
    };
    candidates.set(walletAddress, candidate);
  }
  return candidate;
}

function addCandidateEvidence(
  candidates: Map<string, WalletCandidateEvidence>,
  walletAddress: string | undefined,
  tokenAddress: string,
  tx: HeliusEnhancedTransaction,
  points: number,
  reason: string,
) {
  if (!walletAddress || walletAddress === tokenAddress || !isValidSolanaWalletAddress(walletAddress)) return;

  const candidate = getCandidate(candidates, walletAddress);
  const beforeTokenCount = candidate.tokens.size;
  const beforeSignatureCount = candidate.signatures.size;

  candidate.tokens.add(tokenAddress);
  if (tx.signature) candidate.signatures.add(tx.signature);
  if (tx.source) candidate.sources.add(tx.source);
  candidate.reasons.add(reason);
  candidate.score += points;

  if (candidate.tokens.size > beforeTokenCount) {
    candidate.tokenCount = candidate.tokens.size;
    candidate.score += 2;
  }
  if (candidate.signatures.size > beforeSignatureCount) {
    candidate.txCount = candidate.signatures.size;
    candidate.score += 1;
  }
}

function extractWalletCandidates(tokenAddress: string, transactions: HeliusEnhancedTransaction[]) {
  const candidates = new Map<string, WalletCandidateEvidence>();

  for (const tx of transactions) {
    addCandidateEvidence(candidates, tx.feePayer, tokenAddress, tx, 5, "swap-fee-payer");

    for (const transfer of tx.tokenTransfers ?? []) {
      if (transfer.mint !== tokenAddress) continue;
      const amount = Number(transfer.tokenAmount ?? 0);
      const sizePoints = amount > 0 ? Math.min(4, Math.log10(amount + 1)) : 0;
      addCandidateEvidence(candidates, transfer.fromUserAccount, tokenAddress, tx, 2 + sizePoints, "token-sender");
      addCandidateEvidence(candidates, transfer.toUserAccount, tokenAddress, tx, 2 + sizePoints, "token-recipient");
    }
  }

  return candidates;
}

async function getRecentSignalTokenAddresses(since: Date, limit: number) {
  const rows = await getDb().select({
    tokenAddress: schema.signals.tokenAddress,
    detectedAt: schema.signals.detectedAt,
  })
    .from(schema.signals)
    .where(gte(schema.signals.detectedAt, since))
    .orderBy(desc(schema.signals.detectedAt))
    .limit(limit * 4);

  const seen = new Set<string>();
  const tokenAddresses: string[] = [];
  for (const row of rows) {
    if (seen.has(row.tokenAddress)) continue;
    seen.add(row.tokenAddress);
    tokenAddresses.push(row.tokenAddress);
    if (tokenAddresses.length >= limit) break;
  }

  return tokenAddresses;
}

async function persistDiscoveryMetadata(candidate: WalletCandidateEvidence, result: WalletPipelineResult | null) {
  const db = getDb();
  const rows = await db.select().from(schema.wallets).where(eq(schema.wallets.address, candidate.walletAddress)).limit(1);
  let wallet = rows[0];

  if (!wallet) {
    const walletId = randomUUID();
    await db.insert(schema.wallets).values({
      id: walletId,
      address: candidate.walletAddress,
      classification: result?.classification ?? "unknown",
      totalTrades: result?.tradesFetched ?? 0,
      metadata: {},
    });
    wallet = (await db.select().from(schema.wallets).where(eq(schema.wallets.id, walletId)).limit(1))[0];
  }

  if (!wallet) return;

  const metadata = asRecord(wallet.metadata);
  await db.update(schema.wallets)
    .set({
      metadata: {
        ...metadata,
        candidateDiscovery: {
          source: DISCOVERY_VERSION,
          score: candidate.score,
          txCount: candidate.txCount,
          tokenCount: candidate.tokenCount,
          tokens: [...candidate.tokens].slice(0, 10),
          signatures: [...candidate.signatures].slice(0, 10),
          sources: [...candidate.sources],
          reasons: [...candidate.reasons],
          lastDiscoveredAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.wallets.id, wallet.id));
}

async function countKnownTradeEvidence(walletAddresses: string[], since: Date) {
  if (walletAddresses.length === 0) return new Map<string, number>();

  const rows = await getDb().select({
    walletAddress: schema.walletTrades.walletAddress,
    tokenAddress: schema.walletTrades.tokenAddress,
  })
    .from(schema.walletTrades)
    .where(and(
      inArray(schema.walletTrades.walletAddress, walletAddresses),
      gte(schema.walletTrades.tradedAt, since),
    ))
    .limit(walletAddresses.length * 50);

  const counts = new Map<string, Set<string>>();
  for (const row of rows) {
    const tokenSet = counts.get(row.walletAddress) ?? new Set<string>();
    tokenSet.add(row.tokenAddress);
    counts.set(row.walletAddress, tokenSet);
  }

  return new Map([...counts.entries()].map(([walletAddress, tokenSet]) => [walletAddress, tokenSet.size]));
}

export async function discoverWalletsFromRecentTokens(
  options: TokenWalletDiscoveryOptions,
): Promise<TokenWalletDiscoveryResult> {
  if (!options.heliusApiKey) {
    throw new Error("HELIUS_API_KEY not set");
  }

  const sinceHours = clampPositiveInteger(options.sinceHours, 24, 168);
  const tokenLimit = clampPositiveInteger(options.tokenLimit, 12, 50);
  const transactionsPerToken = clampPositiveInteger(options.transactionsPerToken, 25, 100);
  const walletLimit = clampPositiveInteger(options.walletLimit, 8, 30);
  const minCandidateScore = options.minCandidateScore ?? 8;
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const tokenAddresses = await getRecentSignalTokenAddresses(since, tokenLimit);
  const candidates = new Map<string, WalletCandidateEvidence>();
  let transactionsFetched = 0;

  for (const tokenAddress of tokenAddresses) {
    const transactions = await fetchTokenTransactions(tokenAddress, options.heliusApiKey, transactionsPerToken);
    transactionsFetched += transactions.length;

    const tokenCandidates = extractWalletCandidates(tokenAddress, transactions);
    for (const candidate of tokenCandidates.values()) {
      const aggregate = getCandidate(candidates, candidate.walletAddress);
      aggregate.score += candidate.score;
      for (const token of candidate.tokens) aggregate.tokens.add(token);
      for (const signature of candidate.signatures) aggregate.signatures.add(signature);
      for (const source of candidate.sources) aggregate.sources.add(source);
      for (const reason of candidate.reasons) aggregate.reasons.add(reason);
      aggregate.txCount = aggregate.signatures.size;
      aggregate.tokenCount = aggregate.tokens.size;
    }
  }

  const candidatesByAddress = [...candidates.values()]
    .filter((candidate) => candidate.score >= minCandidateScore)
    .sort((a, b) => b.score - a.score || b.txCount - a.txCount || b.tokenCount - a.tokenCount);

  const knownEvidenceCounts = await countKnownTradeEvidence(
    candidatesByAddress.map((candidate) => candidate.walletAddress),
    since,
  );

  const selectedCandidates = candidatesByAddress
    .map((candidate) => ({
      candidate,
      knownTokenEvidence: knownEvidenceCounts.get(candidate.walletAddress) ?? 0,
    }))
    .sort((a, b) =>
      a.knownTokenEvidence - b.knownTokenEvidence
      || b.candidate.score - a.candidate.score
      || b.candidate.txCount - a.candidate.txCount,
    )
    .slice(0, walletLimit)
    .map(({ candidate }) => candidate);

  const processed = new Map<string, WalletPipelineResult>();
  const failures: Array<{ walletAddress: string; error: string }> = [];
  let tradesFetched = 0;
  let tradesInserted = 0;
  let walletsQualified = 0;

  for (const candidate of selectedCandidates) {
    try {
      const result = await runWalletIntelligencePipeline(candidate.walletAddress);
      processed.set(candidate.walletAddress, result);
      tradesFetched += result.tradesFetched;
      tradesInserted += result.tradesInserted;
      if (result.qualified) walletsQualified++;
      await persistDiscoveryMetadata(candidate, result);
    } catch (error) {
      failures.push({
        walletAddress: candidate.walletAddress,
        error: error instanceof Error ? error.message : "Unknown wallet discovery error",
      });
      await persistDiscoveryMetadata(candidate, null);
    }
  }

  log.info({
    tokensScanned: tokenAddresses.length,
    transactionsFetched,
    candidatesFound: candidatesByAddress.length,
    walletsProcessed: processed.size,
    walletsQualified,
    tradesFetched,
    tradesInserted,
    failures: failures.length,
  }, "Token wallet discovery complete");

  return {
    tokensScanned: tokenAddresses.length,
    transactionsFetched,
    candidatesFound: candidatesByAddress.length,
    walletsProcessed: processed.size,
    walletsQualified,
    tradesFetched,
    tradesInserted,
    failures,
    candidates: selectedCandidates.map((candidate) => {
      const result = processed.get(candidate.walletAddress);
      return {
        walletAddress: candidate.walletAddress,
        score: candidate.score,
        txCount: candidate.txCount,
        tokenCount: candidate.tokenCount,
        sources: [...candidate.sources],
        tokens: [...candidate.tokens],
        processed: !!result,
        qualified: result?.qualified ?? null,
        walletScore: result?.walletScore ?? null,
        classification: result?.classification ?? null,
      };
    }),
  };
}

export async function discoverWalletsForToken(
  options: SingleTokenWalletDiscoveryOptions,
): Promise<TokenWalletDiscoveryResult> {
  if (!options.heliusApiKey) throw new Error("HELIUS_API_KEY not set");
  if (!options.tokenAddress) throw new Error("Token address is required");

  const transactionsPerToken = clampPositiveInteger(options.transactionsPerToken, 100, 100);
  const walletLimit = clampPositiveInteger(options.walletLimit, 12, 30);
  const minCandidateScore = options.minCandidateScore ?? 5;
  const transactions = await fetchTokenTransactions(
    options.tokenAddress,
    options.heliusApiKey,
    transactionsPerToken,
  );
  const candidates = [...extractWalletCandidates(options.tokenAddress, transactions).values()]
    .filter((candidate) => candidate.score >= minCandidateScore)
    .sort((left, right) => right.score - left.score || right.txCount - left.txCount)
    .slice(0, walletLimit);

  const processed = new Map<string, WalletPipelineResult>();
  const failures: Array<{ walletAddress: string; error: string }> = [];
  let tradesFetched = 0;
  let tradesInserted = 0;
  let walletsQualified = 0;

  for (const candidate of candidates) {
    try {
      const result = await runWalletIntelligencePipeline(candidate.walletAddress);
      processed.set(candidate.walletAddress, result);
      tradesFetched += result.tradesFetched;
      tradesInserted += result.tradesInserted;
      if (result.qualified) walletsQualified++;
      await persistDiscoveryMetadata(candidate, result);
    } catch (error) {
      failures.push({
        walletAddress: candidate.walletAddress,
        error: error instanceof Error ? error.message : "Unknown wallet discovery error",
      });
      await persistDiscoveryMetadata(candidate, null);
    }
  }

  return {
    tokensScanned: 1,
    transactionsFetched: transactions.length,
    candidatesFound: candidates.length,
    walletsProcessed: processed.size,
    walletsQualified,
    tradesFetched,
    tradesInserted,
    failures,
    candidates: candidates.map((candidate) => {
      const result = processed.get(candidate.walletAddress);
      return {
        walletAddress: candidate.walletAddress,
        score: candidate.score,
        txCount: candidate.txCount,
        tokenCount: candidate.tokenCount,
        sources: [...candidate.sources],
        tokens: [...candidate.tokens],
        processed: !!result,
        qualified: result?.qualified ?? null,
        walletScore: result?.walletScore ?? null,
        classification: result?.classification ?? null,
      };
    }),
  };
}
