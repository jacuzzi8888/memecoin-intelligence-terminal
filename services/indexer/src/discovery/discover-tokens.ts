import { randomUUID } from "crypto";
import * as schema from "@memecoin/database/schema";
import {
  calculateSignalScore,
  calculateTokenRiskScore,
  getSignalPriority,
  StrategyEngine,
  toRuntimeStrategyConfig,
  type FactorContribution,
  type RuntimeStrategyRecord,
} from "@memecoin/intelligence";
import { generateDeepLinks } from "@memecoin/notifications";
import {
  fetchDexScreenerTokenData,
  fetchDexScreenerTokenDataBatch,
  type IProviderRegistry,
  type MarketData,
  type TokenInfo,
} from "@memecoin/solana";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { logger as createLogger } from "@memecoin/logger";
import type { getDb } from "@memecoin/database";

const log = createLogger("discover-tokens");
const MARKET_OBSERVATION_STRATEGY_ID = "system-market-scan";

type Database = ReturnType<typeof getDb>;

interface DiscoveredTokenEvent {
  tokenAddress: string;
  deployer: string;
  timestamp: number;
  slot: number;
  signature: string;
  decimals: number;
  tokenInfo: TokenInfo | null;
  launchProgram?: string;
  initialLiquidityUsd?: number;
  metadata?: Record<string, unknown>;
}

type StrategyRecord = RuntimeStrategyRecord;

interface PersistedTokenRecord {
  id: string;
}

interface PersistedSignalRecord {
  id: string;
  detectedAt: Date;
  signalScore: number;
  priority: string;
}

interface TokenMetadata {
  symbol: string;
  name: string;
}

export interface TokenWalletEvidence {
  walletCount: number | null;
  qualifiedWalletCount: number | null;
  cohortEntryCount: number | null;
  cohortQualityScore: number | null;
  walletEvidenceAvailable: boolean;
  walletEvidenceSource: string | null;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export interface TokenDiscoveryRepository {
  findTokenByAddress(address: string): Promise<PersistedTokenRecord | null>;
  insertRawProviderEvent(event: {
    provider: string;
    eventType: string;
    rawJson: Record<string, unknown>;
    txSignature: string;
    slot: string;
    blockTime: Date;
    processingStatus: string;
  }): Promise<void>;
  upsertToken(token: {
    candidateId: string;
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    totalSupply: string;
    firstSeenAt: Date;
  }): Promise<PersistedTokenRecord | null>;
  updateTokenMetadata(address: string, metadata: TokenMetadata): Promise<void>;
  insertTokenLaunch(launch: {
    tokenId: string;
    tokenAddress: string;
    deployerAddress: string;
    launchedAt: Date;
    initialLiquidityUsd: string;
    launchProgram: string;
    txSignature: string;
    slot: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  insertTokenSnapshot(snapshot: {
    tokenId: string;
    tokenAddress: string;
    marketCapUsd: string;
    priceUsd: string;
    volume1hUsd: string;
    volume24hUsd: string;
    liquidityUsd: string;
    holderCount: number | null;
    walletCount?: number | null;
    qualifiedWalletCount?: number | null;
    cohortEntryCount?: number | null;
    cohortQualityScore?: string | null;
    walletEvidenceAvailable?: boolean;
    walletEvidenceSource?: string | null;
    priceChange1h: string;
    priceChange24h: string;
    snapshotAt: Date;
  }): Promise<void>;
  getTokenWalletEvidence?(tokenAddress: string, snapshotAt: Date): Promise<TokenWalletEvidence>;
  getActiveStrategies(): Promise<StrategyRecord[]>;
  findLatestSignal(tokenAddress: string, strategyId: string): Promise<PersistedSignalRecord | null>;
  insertSignal(signal: {
    strategyId: string;
    tokenAddress: string;
    tokenId: string;
    signalScore: number;
    confidence: string;
    rulesetVersion: string;
    priority: string;
    metadata: Record<string, unknown>;
  }): Promise<string>;
  insertSignalFactor(factor: {
    signalId: string;
    factorName: string;
    factorType: string;
    rawValue: string;
    contribution: string;
    weight: string;
  }): Promise<void>;
  insertAlert(alert: {
    signalId: string;
    tokenAddress: string;
    priority: string;
    strategyId: string;
    title: string;
    message: string;
    signalScore: number;
    webDeepLink: string;
    telegramDeepLink: string;
    status: string;
  }): Promise<string>;
  insertAlertDelivery(delivery: {
    alertId: string;
    channel: string;
    destination: string;
    status: string;
    deliveredAt: Date;
  }): Promise<void>;
}

export interface DiscoverTokensOptions {
  appUrl: string;
  isMainnet: boolean;
  providers: Pick<IProviderRegistry, "blockchain" | "tokenDiscovery" | "marketData">;
  repository: TokenDiscoveryRepository;
  maxEvents?: number;
  minSignalRefreshMinutes?: number;
}

export interface DiscoverTokensResult {
  network: "mainnet" | "devnet";
  eventsFound: number;
  eventsProcessed: number;
  tokensFound: number;
  tokensProcessed: number;
  tokensRefreshed: number;
  signalsCreated: number;
  alertsCreated: number;
  duplicateSignalsSkipped: number;
  sources: Record<string, number>;
}

export function createTokenDiscoveryRepository(db: Database): TokenDiscoveryRepository {
  return {
    async findTokenByAddress(address) {
      const rows = await db.select({ id: schema.tokens.id }).from(schema.tokens).where(eq(schema.tokens.address, address)).limit(1);
      return rows[0] ?? null;
    },
    async insertRawProviderEvent(event) {
      await db.insert(schema.rawProviderEvents).values({
        id: randomUUID(),
        ...event,
      });
    },
    async upsertToken(token) {
      await db.insert(schema.tokens).values({
        id: token.candidateId,
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        totalSupply: token.totalSupply,
        firstSeenAt: token.firstSeenAt,
      }).onConflictDoNothing();

      const rows = await db.select({ id: schema.tokens.id }).from(schema.tokens).where(eq(schema.tokens.address, token.address)).limit(1);
      return rows[0] ?? null;
    },
    async updateTokenMetadata(address, metadata) {
      await db.update(schema.tokens)
        .set({
          symbol: metadata.symbol,
          name: metadata.name,
          updatedAt: new Date(),
        })
        .where(eq(schema.tokens.address, address));
    },
    async insertTokenLaunch(launch) {
      await db.insert(schema.tokenLaunches).values({
        id: randomUUID(),
        ...launch,
      }).onConflictDoNothing();
    },
    async insertTokenSnapshot(snapshot) {
      await db.insert(schema.tokenSnapshots).values({
        id: randomUUID(),
        ...snapshot,
      });
    },
    async getTokenWalletEvidence(tokenAddress, snapshotAt) {
      const since = new Date(snapshotAt.getTime() - 24 * 60 * 60 * 1000);
      const trades = await db.select({
        walletId: schema.walletTrades.walletId,
        walletAddress: schema.walletTrades.walletAddress,
      })
        .from(schema.walletTrades)
        .where(and(
          eq(schema.walletTrades.tokenAddress, tokenAddress),
          gte(schema.walletTrades.tradedAt, since),
          lte(schema.walletTrades.tradedAt, snapshotAt),
        ));

      const walletIds = [...new Set(trades.map((trade) => trade.walletId))];
      if (walletIds.length === 0) {
        return {
          walletCount: null,
          qualifiedWalletCount: null,
          cohortEntryCount: null,
          cohortQualityScore: null,
          walletEvidenceAvailable: false,
          walletEvidenceSource: null,
        };
      }

      const [walletRows, performanceRows, cohortRows] = await Promise.all([
        db.select().from(schema.wallets).where(inArray(schema.wallets.id, walletIds)),
        db.select().from(schema.walletPerformance).where(inArray(schema.walletPerformance.walletId, walletIds)),
        db.select().from(schema.walletCohortMembers).where(inArray(schema.walletCohortMembers.walletId, walletIds)),
      ]);
      const walletById = new Map(walletRows.map((wallet) => [wallet.id, wallet]));
      const performanceByWallet = new Map<string, typeof performanceRows[number]>();
      for (const performance of performanceRows.sort((a, b) => b.calculatedAt.getTime() - a.calculatedAt.getTime())) {
        if (!performanceByWallet.has(performance.walletId)) performanceByWallet.set(performance.walletId, performance);
      }

      const qualifiedWalletIds = new Set(walletIds.filter((walletId) => {
        const wallet = walletById.get(walletId);
        const qualification = asRecord(asRecord(wallet?.metadata).qualification);
        return qualification.isQualified === true || Number(performanceByWallet.get(walletId)?.score ?? 0) >= 60;
      }));
      const cohortWallets = new Map<string, Set<string>>();
      for (const member of cohortRows) {
        if (!qualifiedWalletIds.has(member.walletId)) continue;
        if (member.joinedAt > snapshotAt || (member.leftAt && member.leftAt <= snapshotAt)) continue;
        const members = cohortWallets.get(member.cohortId) ?? new Set<string>();
        members.add(member.walletId);
        cohortWallets.set(member.cohortId, members);
      }
      const leadingCohort = [...cohortWallets.values()].sort((a, b) => b.size - a.size)[0];
      const cohortScores = leadingCohort
        ? [...leadingCohort]
          .map((walletId) => Number(performanceByWallet.get(walletId)?.score))
          .filter((score) => Number.isFinite(score))
        : [];

      return {
        walletCount: new Set(trades.map((trade) => trade.walletAddress)).size,
        qualifiedWalletCount: qualifiedWalletIds.size,
        cohortEntryCount: leadingCohort?.size ?? null,
        cohortQualityScore: cohortScores.length > 0 ? cohortScores.reduce((sum, score) => sum + score, 0) / cohortScores.length : null,
        walletEvidenceAvailable: true,
        walletEvidenceSource: "wallet-trades+wallet-performance+cohort-members",
      };
    },
    async getActiveStrategies() {
      const rows = await db.select({
        id: schema.strategies.id,
        name: schema.strategies.name,
        description: schema.strategies.description,
        version: schema.strategies.currentVersion,
        userId: schema.strategies.userId,
        createdAt: schema.strategies.createdAt,
        updatedAt: schema.strategies.updatedAt,
        config: schema.strategyVersions.config,
      })
        .from(schema.strategies)
        .leftJoin(schema.strategyVersions, and(
          eq(schema.strategyVersions.strategyId, schema.strategies.id),
          eq(schema.strategyVersions.version, schema.strategies.currentVersion),
        ))
        .where(eq(schema.strategies.isActive, "true"));

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        version: row.version,
        userId: row.userId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        isActive: true,
        config: typeof row.config === "object" && row.config !== null ? row.config as Record<string, unknown> : {},
      }));
    },
    async findLatestSignal(tokenAddress, strategyId) {
      const rows = await db.select({
        id: schema.signals.id,
        detectedAt: schema.signals.detectedAt,
        signalScore: schema.signals.signalScore,
        priority: schema.signals.priority,
      })
        .from(schema.signals)
        .where(and(eq(schema.signals.tokenAddress, tokenAddress), eq(schema.signals.strategyId, strategyId)))
        .orderBy(desc(schema.signals.detectedAt))
        .limit(1);

      return rows[0] ?? null;
    },
    async insertSignal(signal) {
      const id = randomUUID();
      await db.insert(schema.signals).values({
        id,
        ...signal,
      });
      return id;
    },
    async insertAlert(alert) {
      const id = randomUUID();
      await db.insert(schema.alerts).values({
        id,
        ...alert,
      });
      return id;
    },
    async insertSignalFactor(factor) {
      await db.insert(schema.signalFactors).values({
        id: randomUUID(),
        ...factor,
      });
    },
    async insertAlertDelivery(delivery) {
      await db.insert(schema.alertDeliveries).values({
        id: randomUUID(),
        ...delivery,
      });
    },
  };
}

interface DexScreenerTokenProfile {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  description?: string;
  icon?: string;
  header?: string;
  openGraph?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
  cto?: boolean;
  updatedAt?: string;
}

interface DexScreenerTokenBoost {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  amount?: number;
  totalAmount?: number;
  icon?: string;
  header?: string;
  description?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
}

interface DiscoveryCandidate {
  source: string;
  tokenAddress: string;
  observedAt: Date;
  launchProgram: string;
  metadata: Record<string, unknown>;
}

interface DexPairMetadata extends TokenMetadata {
  pairAddress?: string;
  dexId?: string;
  pairCreatedAt?: Date;
}

interface DexScreenerListCacheEntry {
  data: unknown[];
  expiresAt: number;
  staleUntil: number;
}

const dexScreenerListCache = new Map<string, DexScreenerListCacheEntry>();
const dexScreenerListRequests = new Map<string, Promise<unknown[]>>();
const dexScreenerListBackoff = new Map<string, number>();

export function resetDexScreenerDiscoveryCache() {
  dexScreenerListCache.clear();
  dexScreenerListRequests.clear();
  dexScreenerListBackoff.clear();
}

function readDexScreenerDuration(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : fallback;
}

function readDexScreenerRetryAfter(response: Response) {
  const retryAfter = response.headers?.get("retry-after");
  if (!retryAfter) return 60_000;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(seconds * 1_000, 1_000);
  const retryAt = Date.parse(retryAfter);
  return Number.isNaN(retryAt) ? 60_000 : Math.max(retryAt - Date.now(), 1_000);
}

interface HolderEvidence {
  provider: string;
  sampledHolders: number;
  topHolderConcentrationPct: number | null;
}

function isFallbackSymbol(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return !normalized || normalized === "NEW" || normalized === "UNKNOWN";
}

function readDexString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function getHolderEvidence(
  providers: Pick<IProviderRegistry, "tokenDiscovery">,
  tokenAddress: string,
): Promise<HolderEvidence> {
  try {
    const holders = await providers.tokenDiscovery.getTokenHolders(tokenAddress, 100);
    if (!Array.isArray(holders) || holders.length === 0) {
      return {
        provider: providers.tokenDiscovery.name,
        sampledHolders: 0,
        topHolderConcentrationPct: null,
      };
    }

    const percentages = holders
      .map((holder) => holder.percentage)
      .filter((percentage): percentage is number => typeof percentage === "number" && Number.isFinite(percentage))
      .map((percentage) => Math.max(0, Math.min(100, percentage)));

    return {
      provider: providers.tokenDiscovery.name,
      sampledHolders: holders.length,
      topHolderConcentrationPct: percentages.length > 0 ? Math.max(...percentages) : null,
    };
  } catch (err) {
    log.debug({ error: err, tokenAddress }, "Failed to fetch token holder evidence");
    return {
      provider: providers.tokenDiscovery.name,
      sampledHolders: 0,
      topHolderConcentrationPct: null,
    };
  }
}

function serializeSignalFactor(signalId: string, factor: FactorContribution) {
  return {
    signalId,
    factorName: factor.factorName,
    factorType: factor.factorType,
    rawValue: serializeNumeric(factor.rawValue),
    contribution: serializeNumeric(factor.contribution),
    weight: serializeNumeric(factor.weight),
  };
}

function serializeNumeric(value: unknown) {
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : "0";
  }

  return "0";
}

function serializeRiskFactor(
  signalId: string,
  factor: {
    factorName: string;
    impact: "risk" | "mitigation";
    value: number | string | boolean | null;
    contribution: number;
  },
) {
  return {
    signalId,
    factorName: factor.factorName,
    factorType: factor.impact === "mitigation" ? "positive" : "negative",
    rawValue: serializeNumeric(factor.value),
    contribution: serializeNumeric(factor.impact === "mitigation" ? Math.abs(factor.contribution) : -Math.abs(factor.contribution)),
    weight: "0",
  };
}

async function discoverHeliusTokens(
  providers: Pick<IProviderRegistry, "tokenDiscovery">,
): Promise<DiscoveredTokenEvent[]> {
  const since = new Date(Date.now() - 3600_000);
  const discoveredTokens = await providers.tokenDiscovery.getNewTokens(since);
  log.info({ count: discoveredTokens.length }, "Registry token discovery returned token events");

  const events: DiscoveredTokenEvent[] = [];
  for (const evt of discoveredTokens) {
    const info = await providers.tokenDiscovery.getTokenInfo(evt.tokenAddress);
    events.push({
      tokenAddress: evt.tokenAddress,
      deployer: evt.deployer,
      timestamp: evt.timestamp,
      slot: evt.slot,
      signature: evt.signature,
      decimals: info?.decimals || 9,
      tokenInfo: info,
    });
  }

  return events;
}

async function discoverDexScreenerProfileTokens(
  providers: Pick<IProviderRegistry, "tokenDiscovery">,
): Promise<DiscoveredTokenEvent[]> {
  const since = new Date(Date.now() - 3600_000);
  const profiles = await fetchDexScreenerList<DexScreenerTokenProfile>(
    "https://api.dexscreener.com/token-profiles/latest/v1",
    "DexScreener latest profiles discovery failed",
  );
  const candidates: DiscoveryCandidate[] = [];

  for (const profile of profiles) {
    if (profile.chainId !== "solana" || !profile.tokenAddress) continue;
    const updatedAt = profile.updatedAt ? new Date(profile.updatedAt) : new Date();
    if (Number.isNaN(updatedAt.getTime()) || updatedAt < since) continue;

    candidates.push({
      source: "dexscreener-profile",
      tokenAddress: profile.tokenAddress,
      observedAt: updatedAt,
      launchProgram: "DexScreener Profile",
      metadata: {
        source: "dexscreener-profile",
        url: profile.url,
        description: profile.description,
        icon: profile.icon,
        header: profile.header,
        openGraph: profile.openGraph,
        links: profile.links,
        cto: profile.cto,
        updatedAt: updatedAt.toISOString(),
      },
    });
  }

  const events = await buildDexScreenerEvents(candidates, providers);
  log.info({ count: events.length }, "DexScreener latest profiles returned Solana token events");
  return events;
}

async function discoverDexScreenerBoostTokens(
  providers: Pick<IProviderRegistry, "tokenDiscovery">,
): Promise<DiscoveredTokenEvent[]> {
  const [latestBoosts, topBoosts] = await Promise.all([
    fetchDexScreenerList<DexScreenerTokenBoost>(
      "https://api.dexscreener.com/token-boosts/latest/v1",
      "DexScreener latest boosts discovery failed",
    ),
    fetchDexScreenerList<DexScreenerTokenBoost>(
      "https://api.dexscreener.com/token-boosts/top/v1",
      "DexScreener top boosts discovery failed",
    ),
  ]);

  const candidates: DiscoveryCandidate[] = [];
  const now = new Date();
  for (const boost of latestBoosts) {
    if (boost.chainId !== "solana" || !boost.tokenAddress) continue;
    candidates.push({
      source: "dexscreener-boost-latest",
      tokenAddress: boost.tokenAddress,
      observedAt: now,
      launchProgram: "DexScreener Boost",
      metadata: {
        source: "dexscreener-boost-latest",
        url: boost.url,
        boostAmount: boost.amount,
        boostTotalAmount: boost.totalAmount,
        icon: boost.icon,
        header: boost.header,
        description: boost.description,
        links: boost.links,
        updatedAt: now.toISOString(),
      },
    });
  }

  for (const boost of topBoosts) {
    if (boost.chainId !== "solana" || !boost.tokenAddress) continue;
    candidates.push({
      source: "dexscreener-boost-top",
      tokenAddress: boost.tokenAddress,
      observedAt: now,
      launchProgram: "DexScreener Boost",
      metadata: {
        source: "dexscreener-boost-top",
        url: boost.url,
        boostAmount: boost.amount,
        boostTotalAmount: boost.totalAmount,
        icon: boost.icon,
        header: boost.header,
        description: boost.description,
        links: boost.links,
        updatedAt: now.toISOString(),
      },
    });
  }

  const events = await buildDexScreenerEvents(candidates, providers);
  log.info({ count: events.length }, "DexScreener boosts returned Solana token events");
  return events;
}

async function fetchDexScreenerList<T>(url: string, warning: string): Promise<T[]> {
  const now = Date.now();
  const cached = dexScreenerListCache.get(url);
  if (cached && now < cached.expiresAt) return cached.data as T[];
  if ((dexScreenerListBackoff.get(url) ?? 0) > now) {
    return cached && now < cached.staleUntil ? cached.data as T[] : [];
  }

  const pending = dexScreenerListRequests.get(url);
  if (pending) return pending as Promise<T[]>;

  const request = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const retryMs = response.status === 429 ? readDexScreenerRetryAfter(response) : 30_000;
        dexScreenerListBackoff.set(url, Date.now() + retryMs);
        log.warn({ status: response.status, url, retryMs }, warning);
        return cached && Date.now() < cached.staleUntil ? cached.data : [];
      }

      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      const cachedAt = Date.now();
      dexScreenerListCache.set(url, {
        data: list,
        expiresAt: cachedAt + readDexScreenerDuration("DEXSCREENER_DISCOVERY_CACHE_MS", 60_000),
        staleUntil: cachedAt + readDexScreenerDuration("DEXSCREENER_DISCOVERY_STALE_MS", 5 * 60_000),
      });
      dexScreenerListBackoff.delete(url);
      return list;
    } catch (err) {
      dexScreenerListBackoff.set(url, Date.now() + 30_000);
      log.warn({ error: err, url }, warning);
      return cached && Date.now() < cached.staleUntil ? cached.data : [];
    } finally {
      dexScreenerListRequests.delete(url);
    }
  })();

  dexScreenerListRequests.set(url, request);
  return request as Promise<T[]>;
}

async function buildDexScreenerEvents(
  candidates: DiscoveryCandidate[],
  providers: Pick<IProviderRegistry, "tokenDiscovery">,
): Promise<DiscoveredTokenEvent[]> {
  const events: DiscoveredTokenEvent[] = [];
  const seen = new Set<string>();
  await fetchDexScreenerTokenDataBatch(candidates.map((candidate) => candidate.tokenAddress));

  for (const candidate of candidates) {
    if (seen.has(candidate.tokenAddress)) continue;
    seen.add(candidate.tokenAddress);

    const [info, dexMetadata] = await Promise.all([
      providers.tokenDiscovery.getTokenInfo(candidate.tokenAddress),
      getDexScreenerPairMetadata(candidate.tokenAddress),
    ]);

    events.push({
      tokenAddress: candidate.tokenAddress,
      deployer: "",
      timestamp: Math.floor(candidate.observedAt.getTime() / 1000),
      slot: 0,
      signature: `dexscreener:${candidate.source}:${candidate.tokenAddress}:${candidate.observedAt.getTime()}`,
      decimals: info?.decimals || 9,
      tokenInfo: info,
      launchProgram: candidate.launchProgram,
      metadata: {
        ...candidate.metadata,
        dexSymbol: dexMetadata?.symbol,
        dexName: dexMetadata?.name,
        dexId: dexMetadata?.dexId,
        pairAddress: dexMetadata?.pairAddress,
        pairCreatedAt: dexMetadata?.pairCreatedAt?.toISOString(),
      },
    });
  }

  return events;
}

async function getDexScreenerPairMetadata(tokenAddress: string): Promise<DexPairMetadata | null> {
  try {
    const data = await fetchDexScreenerTokenData(tokenAddress);
    if (!data) return null;
    const pair = data.pairs?.find((candidate) => candidate.baseToken?.address === tokenAddress) ?? data.pairs?.[0];
    const symbol = readDexString(pair?.baseToken?.symbol);
    const name = readDexString(pair?.baseToken?.name);
    if (!symbol && !name) return null;
    const pairCreatedAt = typeof pair?.pairCreatedAt === "number" && Number.isFinite(pair.pairCreatedAt)
      ? new Date(pair.pairCreatedAt)
      : undefined;

    return {
      symbol: symbol ?? tokenAddress.slice(0, 6),
      name: name ?? symbol ?? `Token ${tokenAddress.slice(0, 8)}`,
      pairAddress: readDexString(pair?.pairAddress) ?? undefined,
      dexId: readDexString(pair?.dexId) ?? undefined,
      pairCreatedAt,
    };
  } catch (err) {
    log.debug({ error: err, tokenAddress }, "Failed to fetch DexScreener pair metadata");
    return null;
  }
}

async function discoverRpcTokens(
  providers: Pick<IProviderRegistry, "blockchain">,
): Promise<DiscoveredTokenEvent[]> {
  const connection = providers.blockchain.getConnection();
  const { PublicKey } = await import("@solana/web3.js");
  const tokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const signatures = await connection.getSignaturesForAddress(new PublicKey(tokenProgram), { limit: 20 });

  log.info({ count: signatures.length }, "Found recent transactions");

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const events: DiscoveredTokenEvent[] = [];

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
        if (programId !== tokenProgram) continue;

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

        events.push({
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

  return events;
}

function buildTokenMetadata(event: DiscoveredTokenEvent) {
  const dexSymbol = readDexString(event.metadata?.dexSymbol);
  const dexName = readDexString(event.metadata?.dexName);

  if (event.tokenInfo && !isFallbackSymbol(event.tokenInfo.symbol)) {
    return { symbol: event.tokenInfo.symbol, name: event.tokenInfo.name };
  }

  if (dexSymbol || dexName) {
    return {
      symbol: dexSymbol ?? event.tokenAddress.slice(0, 6),
      name: dexName ?? dexSymbol ?? `Token ${event.tokenAddress.slice(0, 8)}`,
    };
  }

  return {
    symbol: "NEW",
    name: `Token ${event.tokenAddress.slice(0, 8)}`,
  };
}

function dedupeTokenEvents(events: DiscoveredTokenEvent[]) {
  const seen = new Set<string>();
  const deduped: DiscoveredTokenEvent[] = [];

  for (const event of events) {
    if (seen.has(event.tokenAddress)) continue;
    seen.add(event.tokenAddress);
    deduped.push(event);
  }

  return deduped.sort((a, b) => b.timestamp - a.timestamp);
}

async function insertMarketSnapshot(
  repository: TokenDiscoveryRepository,
  tokenId: string,
  tokenAddress: string,
  marketData: MarketData | null,
  walletEvidence: TokenWalletEvidence,
  snapshotAt: Date,
) {
  if (!marketData) return;

  try {
    await repository.insertTokenSnapshot({
      tokenId,
      tokenAddress,
      marketCapUsd: String(marketData.marketCapUsd),
      priceUsd: String(marketData.priceUsd),
      volume1hUsd: String(marketData.volume1hUsd),
      volume24hUsd: String(marketData.volume24hUsd),
      liquidityUsd: String(marketData.liquidityUsd),
      holderCount: marketData.holderCount || null,
      walletCount: walletEvidence.walletCount,
      qualifiedWalletCount: walletEvidence.qualifiedWalletCount,
      cohortEntryCount: walletEvidence.cohortEntryCount,
      cohortQualityScore: walletEvidence.cohortQualityScore?.toString() ?? null,
      walletEvidenceAvailable: walletEvidence.walletEvidenceAvailable,
      walletEvidenceSource: walletEvidence.walletEvidenceSource,
      priceChange1h: String(marketData.priceChange1h),
      priceChange24h: String(marketData.priceChange24h),
      snapshotAt,
    });
  } catch (err) {
    log.debug({ error: err, tokenAddress }, "Failed to insert token snapshot");
  }
}

async function shouldCreateSignal(
  repository: TokenDiscoveryRepository,
  tokenAddress: string,
  strategyId: string,
  minSignalRefreshMinutes: number,
  cooldownMinutes: number,
  signalScore: number,
  priority: string,
) {
  const latestSignal = await repository.findLatestSignal(tokenAddress, strategyId);
  if (!latestSignal) return true;

  const ageMinutes = (Date.now() - latestSignal.detectedAt.getTime()) / 60_000;
  const requiredCooldown = Math.max(minSignalRefreshMinutes, cooldownMinutes);
  if (ageMinutes < requiredCooldown) return false;

  return Math.abs(latestSignal.signalScore - signalScore) >= 5 || latestSignal.priority !== priority;
}

async function refreshTokenSignal(args: {
  appUrl: string;
  event: DiscoveredTokenEvent;
  tokenMeta: TokenMetadata;
  tokenId: string;
  network: "mainnet" | "devnet";
  providers: Pick<IProviderRegistry, "marketData" | "tokenDiscovery">;
  repository: TokenDiscoveryRepository;
  discoveryProvider: string;
  minSignalRefreshMinutes: number;
  isRefresh: boolean;
}) {
  const {
    appUrl,
    event,
    tokenMeta,
    tokenId,
    network,
    providers,
    repository,
    discoveryProvider,
    minSignalRefreshMinutes,
    isRefresh,
  } = args;

  const marketData = await providers.marketData.getMarketData(event.tokenAddress);
  const now = Math.floor(Date.now() / 1000);
  const tokenAgeMinutes = Math.max(1, Math.floor((now - event.timestamp) / 60));

  log.info(
    { tokenAddress: event.tokenAddress, hasMarketData: !!marketData, provider: providers.marketData.name, isRefresh },
    "Fetched market data",
  );

  const holderEvidence = await getHolderEvidence(providers, event.tokenAddress);
  const snapshotAt = new Date();
  const walletEvidence = repository.getTokenWalletEvidence
    ? await repository.getTokenWalletEvidence(event.tokenAddress, snapshotAt)
    : {
      walletCount: null,
      qualifiedWalletCount: null,
      cohortEntryCount: null,
      cohortQualityScore: null,
      walletEvidenceAvailable: false,
      walletEvidenceSource: null,
    };
  await insertMarketSnapshot(repository, tokenId, event.tokenAddress, marketData, walletEvidence, snapshotAt);

  const scoreResult = calculateSignalScore({
    tokenAge: tokenAgeMinutes,
    liquidityUsd: marketData?.liquidityUsd ?? null,
    volume1hUsd: marketData?.volume1hUsd ?? null,
    holderCount: marketData?.holderCount || null,
    qualifiedWalletCount: walletEvidence.qualifiedWalletCount,
    bundledSupplyPct: null,
    deployerRisk: null,
    topHolderConcentration: holderEvidence.topHolderConcentrationPct,
    lpLocked: null,
  });
  const riskResult = calculateTokenRiskScore({
    tokenAgeMinutes,
    liquidityUsd: marketData?.liquidityUsd ?? null,
    volume1hUsd: marketData?.volume1hUsd ?? null,
    holderCount: marketData?.holderCount || null,
    bundledSupplyPct: null,
    deployerRisk: null,
    topHolderConcentration: holderEvidence.topHolderConcentrationPct,
    lpLocked: null,
    qualifiedWalletCount: walletEvidence.qualifiedWalletCount,
  });

  const fallbackPriority = getSignalPriority(scoreResult.score);
  const riskMetadata = {
    score: riskResult.riskScore,
    rating: riskResult.rating,
    confidence: riskResult.confidence,
    rulesetVersion: riskResult.rulesetVersion,
    missingFeatures: riskResult.missingFeatures,
  };
  let signalsCreated = 0;
  let alertsCreated = 0;
  let duplicateSignalsSkipped = 0;

  const shouldCreateObservation = await shouldCreateSignal(
    repository,
    event.tokenAddress,
    MARKET_OBSERVATION_STRATEGY_ID,
    Math.min(minSignalRefreshMinutes, 15),
    15,
    scoreResult.score,
    fallbackPriority,
  );
  if (shouldCreateObservation) {
    const observationId = await repository.insertSignal({
      strategyId: MARKET_OBSERVATION_STRATEGY_ID,
      tokenAddress: event.tokenAddress,
      tokenId,
      signalScore: scoreResult.score,
      confidence: String(scoreResult.confidence),
      rulesetVersion: scoreResult.rulesetVersion,
      priority: fallbackPriority,
      metadata: {
        network,
        discoveryProvider,
        marketDataProvider: providers.marketData.name,
        snapshotAvailable: !!marketData,
        holderEvidence,
        walletEvidence,
        refreshedExistingToken: isRefresh,
        discoverySource: readDexString(event.metadata?.source) ?? discoveryProvider,
        strategyEvaluation: { kind: "market_observation", matched: true },
        risk: riskMetadata,
      },
    });
    signalsCreated++;
    for (const factor of [...scoreResult.positiveFactors, ...scoreResult.negativeFactors]) {
      await repository.insertSignalFactor(serializeSignalFactor(observationId, factor));
    }
    for (const factor of [...riskResult.riskFactors, ...riskResult.mitigatingFactors]) {
      await repository.insertSignalFactor(serializeRiskFactor(observationId, factor));
    }
  } else {
    duplicateSignalsSkipped++;
  }

  const strategies = await repository.getActiveStrategies();
  if (strategies.length === 0) {
    return { signalsCreated, alertsCreated, duplicateSignalsSkipped, score: scoreResult.score };
  }

  const engine = new StrategyEngine();
  const evaluations = strategies.map((strategy) => {
    const config = toRuntimeStrategyConfig(strategy);
    const evaluation = engine.evaluate(config, {
      token_score: scoreResult.score,
      score_confidence: scoreResult.confidence,
      token_age_minutes: tokenAgeMinutes,
      liquidity_usd: marketData?.liquidityUsd ?? null,
      volume_1h_usd: marketData?.volume1hUsd ?? null,
      holder_count: marketData?.holderCount ?? null,
      qualified_wallet_count: walletEvidence.qualifiedWalletCount,
      cohort_entry_count: walletEvidence.cohortEntryCount,
      cohort_quality_score: walletEvidence.cohortQualityScore,
      risk_score: riskResult.rating === "unknown" ? null : riskResult.riskScore,
      risk_confidence: riskResult.confidence,
    });
    return { strategy, config, evaluation };
  }).filter(({ evaluation }) => evaluation.matched);

  const links = generateDeepLinks(event.tokenAddress, appUrl);

  for (const { strategy, config, evaluation } of evaluations) {
    const priority = config.priority || fallbackPriority;
    const canCreateSignal = await shouldCreateSignal(
      repository,
      event.tokenAddress,
      strategy.id,
      minSignalRefreshMinutes,
      config.cooldownMinutes,
      scoreResult.score,
      priority,
    );
    if (!canCreateSignal) {
      duplicateSignalsSkipped++;
      continue;
    }

    const signalId = await repository.insertSignal({
      strategyId: strategy.id,
      tokenAddress: event.tokenAddress,
      tokenId,
      signalScore: scoreResult.score,
      confidence: String(scoreResult.confidence),
      rulesetVersion: scoreResult.rulesetVersion,
      priority,
      metadata: {
        network,
        discoveryProvider,
        marketDataProvider: providers.marketData.name,
        snapshotAvailable: !!marketData,
        holderEvidence,
        walletEvidence,
        refreshedExistingToken: isRefresh,
        discoverySource: readDexString(event.metadata?.source) ?? discoveryProvider,
        strategyEvaluation: evaluation,
        risk: riskMetadata,
      },
    });
    signalsCreated++;

    for (const factor of [...scoreResult.positiveFactors, ...scoreResult.negativeFactors]) {
      await repository.insertSignalFactor(serializeSignalFactor(signalId, factor));
    }
    for (const factor of [...riskResult.riskFactors, ...riskResult.mitigatingFactors]) {
      await repository.insertSignalFactor(serializeRiskFactor(signalId, factor));
    }

    const alertId = await repository.insertAlert({
      signalId,
      tokenAddress: event.tokenAddress,
      priority,
      strategyId: strategy.id,
      title: `${isRefresh ? "Token Update" : "New Token"}: ${tokenMeta.symbol} (${event.tokenAddress.slice(0, 12)}...)`,
      message: `${isRefresh ? "Updated" : "New"} ${tokenMeta.name} detected on Solana ${network}. Score: ${scoreResult.score}/100. Risk: ${riskResult.rating} (${riskResult.riskScore}/100).`,
      signalScore: scoreResult.score,
      webDeepLink: links.webUrl,
      telegramDeepLink: links.telegramUrl,
      status: "pending",
    });
    alertsCreated++;

    await repository.insertAlertDelivery({
      alertId,
      channel: "dev_outbox",
      destination: "log",
      status: "delivered",
      deliveredAt: new Date(),
    });
  }

  return { signalsCreated, alertsCreated, duplicateSignalsSkipped, score: scoreResult.score };
}

export async function discoverTokens(options: DiscoverTokensOptions): Promise<DiscoverTokensResult> {
  const { appUrl, isMainnet, providers, repository } = options;
  const network = isMainnet ? "mainnet" : "devnet";
  const maxEvents = options.maxEvents ?? 75;
  const minSignalRefreshMinutes = options.minSignalRefreshMinutes ?? 45;

  log.info({ network }, "Scanning for new tokens...");

  let tokenEvents: DiscoveredTokenEvent[] = [];
  if (providers.tokenDiscovery.name !== "dev-token-discovery") {
    log.info({ provider: providers.tokenDiscovery.name }, "Using registry-backed token discovery...");
    tokenEvents = await discoverHeliusTokens({ tokenDiscovery: providers.tokenDiscovery });
  }

  if (isMainnet) {
    const [profileEvents, boostEvents] = await Promise.all([
      discoverDexScreenerProfileTokens({ tokenDiscovery: providers.tokenDiscovery }),
      discoverDexScreenerBoostTokens({ tokenDiscovery: providers.tokenDiscovery }),
    ]);
    tokenEvents = dedupeTokenEvents([...tokenEvents, ...profileEvents, ...boostEvents]);
  }

  if (tokenEvents.length === 0) {
    log.info("No tokens from registry discovery, falling back to RPC scan...");
    tokenEvents = await discoverRpcTokens({ blockchain: providers.blockchain });
  }

  log.info({ totalEvents: tokenEvents.length }, "Processing discovered tokens...");

  let tokensFound = 0;
  let tokensProcessed = 0;
  let tokensRefreshed = 0;
  let signalsCreated = 0;
  let alertsCreated = 0;
  let duplicateSignalsSkipped = 0;
  const sources: Record<string, number> = {};

  const eventsToProcess = tokenEvents.slice(0, maxEvents);
  for (const event of eventsToProcess) {
    try {
      const existingToken = await repository.findTokenByAddress(event.tokenAddress);
      const tokenMeta = buildTokenMetadata(event);
      const source = readDexString(event.metadata?.source) ?? providers.tokenDiscovery.name;
      sources[source] = (sources[source] ?? 0) + 1;

      if (existingToken) {
        if (!isFallbackSymbol(tokenMeta.symbol)) {
          await repository.updateTokenMetadata(event.tokenAddress, tokenMeta);
        }

        const refreshResult = await refreshTokenSignal({
          appUrl,
          event,
          tokenMeta,
          tokenId: existingToken.id,
          network,
          providers,
          repository,
          discoveryProvider: providers.tokenDiscovery.name,
          minSignalRefreshMinutes,
          isRefresh: true,
        });
        tokensRefreshed++;
        tokensProcessed++;
        signalsCreated += refreshResult.signalsCreated;
        alertsCreated += refreshResult.alertsCreated;
        duplicateSignalsSkipped += refreshResult.duplicateSignalsSkipped;
        log.debug({ address: event.tokenAddress }, "Existing token refreshed");
        continue;
      }

      tokensFound++;

      const discoveryProvider = providers.tokenDiscovery.name !== "dev-token-discovery"
        ? providers.tokenDiscovery.name
        : providers.blockchain.name;

      await repository.insertRawProviderEvent({
        provider: discoveryProvider,
        eventType: "token_launch",
        rawJson: event as unknown as Record<string, unknown>,
        txSignature: event.signature,
        slot: String(event.slot),
        blockTime: new Date(event.timestamp * 1000),
        processingStatus: "processed",
      });

      const persistedToken = await repository.upsertToken({
        candidateId: randomUUID(),
        address: event.tokenAddress,
        symbol: tokenMeta.symbol,
        name: tokenMeta.name,
        decimals: event.decimals,
        totalSupply: "0",
        firstSeenAt: new Date(event.timestamp * 1000),
      });

      if (!persistedToken) {
        log.error({ tokenAddress: event.tokenAddress }, "Token row was not persisted");
        continue;
      }

      await repository.insertTokenLaunch({
        tokenId: persistedToken.id,
        tokenAddress: event.tokenAddress,
        deployerAddress: event.deployer,
        launchedAt: new Date(event.timestamp * 1000),
        initialLiquidityUsd: String(event.initialLiquidityUsd ?? 0),
        launchProgram: event.launchProgram || "Token Program",
        txSignature: event.signature,
        slot: String(event.slot),
        metadata: {
          network,
          discoveryProvider,
          marketDataProvider: providers.marketData.name,
          ...event.metadata,
        },
      });

      const signalResult = await refreshTokenSignal({
        appUrl,
        event,
        tokenMeta,
        tokenId: persistedToken.id,
        network,
        providers,
        repository,
        discoveryProvider,
        minSignalRefreshMinutes,
        isRefresh: false,
      });
      signalsCreated += signalResult.signalsCreated;
      alertsCreated += signalResult.alertsCreated;
      duplicateSignalsSkipped += signalResult.duplicateSignalsSkipped;

      log.info(
        {
          token: tokenMeta.symbol,
          address: event.tokenAddress,
          score: signalResult.score,
          signalsCreated: signalResult.signalsCreated,
          alertsCreated: signalResult.alertsCreated,
        },
        "Discovery intelligence persisted for token",
      );

      tokensProcessed++;
    } catch (err) {
      log.error({ error: err, tokenAddress: event.tokenAddress }, "Failed to process token");
    }
  }

  return {
    network,
    eventsFound: tokenEvents.length,
    eventsProcessed: eventsToProcess.length,
    tokensFound,
    tokensProcessed,
    tokensRefreshed,
    signalsCreated,
    alertsCreated,
    duplicateSignalsSkipped,
    sources,
  };
}
