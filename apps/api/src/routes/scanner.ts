import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import {
  createTokenDiscoveryRepository,
  discoverTokens,
  discoverWalletsFromRecentTokens,
} from "@memecoin/indexer";
import { logger } from "@memecoin/logger";
import { createProviderRegistry } from "@memecoin/solana";
import { sql, desc, asc, and, inArray, gte, eq } from "drizzle-orm";
import { resolveSourceMetadata } from "./source-metadata.js";
import { getRecentWindow, serializeRecentWindow } from "./recent-window.js";

const log = logger("api:scanner");
const MARKET_OBSERVATION_STRATEGY_ID = "system-market-scan";

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isQualifiedWallet(wallet: { metadata: unknown }, performance?: { score: number | null }) {
  const metadata = asRecord(wallet.metadata);
  const qualification = asRecord(metadata.qualification);
  return qualification.isQualified === true || (performance?.score ?? 0) >= 60;
}

function readMetadataDate(metadata: unknown, key: string) {
  const value = asRecord(metadata)[key];
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPairCreatedAt(launch?: { launchedAt: Date; metadata: unknown }) {
  return readMetadataDate(launch?.metadata, "pairCreatedAt") ?? launch?.launchedAt ?? null;
}

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(["signal_score", "detected_at", "priority", "pair_age"]).default("detected_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  timeframe: z.enum(["5m", "15m", "1h", "4h", "24h", "7d", "30d"]).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  minLiquidityUsd: z.coerce.number().min(0).optional(),
  maxLiquidityUsd: z.coerce.number().min(0).optional(),
  minVolume1hUsd: z.coerce.number().min(0).optional(),
  minVolume24hUsd: z.coerce.number().min(0).optional(),
  minMarketCapUsd: z.coerce.number().min(0).optional(),
  maxMarketCapUsd: z.coerce.number().min(0).optional(),
  minPairAgeMinutes: z.coerce.number().min(0).optional(),
  maxPairAgeMinutes: z.coerce.number().min(0).optional(),
  minWalletCount: z.coerce.number().min(0).optional(),
  minQualifiedWalletCount: z.coerce.number().min(0).optional(),
  hasWalletEvidence: z.enum(["true", "false"]).optional(),
  excludeBundlers: z.enum(["true", "false"]).optional(),
  dedupeTokens: z.enum(["true", "false"]).default("true"),
  dataSource: z
    .enum(["all", "dexscreener", "helius", "birdeye", "solana-rpc", "development"])
    .default("all"),
  discoverySource: z
    .enum([
      "all",
      "dexscreener-profile",
      "dexscreener-boost-latest",
      "dexscreener-boost-top",
      "helius",
      "rpc",
    ])
    .default("all"),
  priority: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
  search: z.string().trim().min(1).max(80).optional(),
  sinceDays: z.coerce.number().min(1).max(30).default(1),
});

const liveScanBodySchema = z
  .object({
    limit: z.coerce.number().min(1).max(150).default(100),
    minSignalRefreshMinutes: z.coerce.number().min(5).max(360).default(45),
  })
  .default({
    limit: 100,
    minSignalRefreshMinutes: 45,
  });

const walletDiscoveryBodySchema = z
  .object({
    sinceHours: z.coerce.number().min(1).max(168).default(24),
    tokenLimit: z.coerce.number().min(1).max(50).default(12),
    transactionsPerToken: z.coerce.number().min(1).max(100).default(25),
    walletLimit: z.coerce.number().min(1).max(30).default(8),
    minCandidateScore: z.coerce.number().min(1).max(100).default(8),
  })
  .default({
    sinceHours: 24,
    tokenLimit: 12,
    transactionsPerToken: 25,
    walletLimit: 8,
    minCandidateScore: 8,
  });

function getScannerWindow(query: z.infer<typeof querySchema>) {
  if (!query.timeframe) return getRecentWindow(query.sinceDays);

  const minutes = {
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "4h": 240,
    "24h": 1440,
    "7d": 10080,
    "30d": 43200,
  }[query.timeframe];

  return new Date(Date.now() - minutes * 60_000);
}

function buildLatestSnapshotFilter(since: Date, predicate: ReturnType<typeof sql>) {
  return sql`exists (
    select 1
    from token_snapshots latest_filter_snapshot
    where latest_filter_snapshot.token_address = ${schema.signals.tokenAddress}
      and latest_filter_snapshot.snapshot_at >= ${since.toISOString()}::timestamp
      and latest_filter_snapshot.snapshot_at = (
        select max(latest_filter_snapshot_inner.snapshot_at)
        from token_snapshots latest_filter_snapshot_inner
        where latest_filter_snapshot_inner.token_address = ${schema.signals.tokenAddress}
          and latest_filter_snapshot_inner.snapshot_at >= ${since.toISOString()}::timestamp
      )
      and ${predicate}
  )`;
}

export const scannerRoute: FastifyPluginAsync = async (app) => {
  app.get("/scanner", async (request, reply) => {
    const query = querySchema.parse(request.query);
    const db = getDb();

    const pairCreatedAtExpr = sql`(
      select coalesce(
        nullif(latest_pair_age_launch.metadata->>'pairCreatedAt', '')::timestamp,
        latest_pair_age_launch.launched_at
      )
      from token_launches latest_pair_age_launch
      where latest_pair_age_launch.token_address = ${schema.signals.tokenAddress}
      order by latest_pair_age_launch.launched_at desc
      limit 1
    )`;
    const orderCol =
      query.sortBy === "signal_score"
        ? schema.signals.signalScore
        : query.sortBy === "priority"
          ? schema.signals.priority
          : query.sortBy === "pair_age"
            ? pairCreatedAtExpr
            : schema.signals.detectedAt;
    const orderFn =
      query.sortBy === "pair_age"
        ? query.sortOrder === "asc"
          ? desc
          : asc
        : query.sortOrder === "asc"
          ? asc
          : desc;
    const since = getScannerWindow(query);

    const conditions = [
      gte(schema.signals.detectedAt, since),
      eq(schema.signals.strategyId, MARKET_OBSERVATION_STRATEGY_ID),
    ];
    if (query.dedupeTokens === "true") {
      conditions.push(sql`${schema.signals.detectedAt} = (
        select max(latest_signal.detection_time)
        from (
          select inner_signal.detected_at as detection_time
          from signals inner_signal
          where inner_signal.token_address = ${schema.signals.tokenAddress}
            and inner_signal.strategy_id = ${MARKET_OBSERVATION_STRATEGY_ID}
            and inner_signal.detected_at >= ${since.toISOString()}::timestamp
        ) latest_signal
      )`);
    }
    if (query.search) {
      const searchPattern = `%${query.search}%`;
      conditions.push(sql`(
        ${schema.signals.tokenAddress} ilike ${searchPattern}
        or coalesce(${schema.tokens.symbol}, '') ilike ${searchPattern}
        or coalesce(${schema.tokens.name}, '') ilike ${searchPattern}
      )`);
    }
    if (query.minScore !== undefined) {
      conditions.push(sql`${schema.signals.signalScore} >= ${query.minScore}`);
    }
    if (query.priority !== undefined) {
      conditions.push(sql`${schema.signals.priority} = ${query.priority}`);
    }
    if (query.dataSource !== "all") {
      conditions.push(sql`(
        ${schema.signals.metadata}->>'marketDataProvider' = ${query.dataSource}
        OR (
          ${schema.signals.metadata}->>'marketDataProvider' is null
          AND ${schema.signals.metadata}->>'discoveryProvider' = ${query.dataSource}
        )
      )`);
    }
    if (query.discoverySource !== "all") {
      conditions.push(sql`(
        ${schema.signals.metadata}->>'discoverySource' = ${query.discoverySource}
        OR exists (
          select 1
          from token_launches discovery_source_launch
          where discovery_source_launch.token_address = ${schema.signals.tokenAddress}
            and discovery_source_launch.metadata->>'source' = ${query.discoverySource}
        )
      )`);
    }
    if (query.minLiquidityUsd !== undefined) {
      conditions.push(
        buildLatestSnapshotFilter(
          since,
          sql`latest_filter_snapshot.liquidity_usd >= ${String(query.minLiquidityUsd)}`,
        ),
      );
    }
    if (query.maxLiquidityUsd !== undefined) {
      conditions.push(
        buildLatestSnapshotFilter(
          since,
          sql`latest_filter_snapshot.liquidity_usd <= ${String(query.maxLiquidityUsd)}`,
        ),
      );
    }
    if (query.minVolume1hUsd !== undefined) {
      conditions.push(
        buildLatestSnapshotFilter(
          since,
          sql`latest_filter_snapshot.volume_1h_usd >= ${String(query.minVolume1hUsd)}`,
        ),
      );
    }
    if (query.minVolume24hUsd !== undefined) {
      conditions.push(
        buildLatestSnapshotFilter(
          since,
          sql`latest_filter_snapshot.volume_24h_usd >= ${String(query.minVolume24hUsd)}`,
        ),
      );
    }
    if (query.minMarketCapUsd !== undefined) {
      conditions.push(
        buildLatestSnapshotFilter(
          since,
          sql`latest_filter_snapshot.market_cap_usd >= ${String(query.minMarketCapUsd)}`,
        ),
      );
    }
    if (query.maxMarketCapUsd !== undefined) {
      conditions.push(
        buildLatestSnapshotFilter(
          since,
          sql`latest_filter_snapshot.market_cap_usd <= ${String(query.maxMarketCapUsd)}`,
        ),
      );
    }
    if (query.minPairAgeMinutes !== undefined) {
      conditions.push(sql`exists (
        select 1
        from token_launches pair_age_filter_launch
        where pair_age_filter_launch.token_address = ${schema.signals.tokenAddress}
          and extract(epoch from (now() - coalesce(
            nullif(pair_age_filter_launch.metadata->>'pairCreatedAt', '')::timestamp,
            pair_age_filter_launch.launched_at
          ))) / 60 >= ${query.minPairAgeMinutes}
      )`);
    }
    if (query.hasWalletEvidence === "true") {
      conditions.push(sql`exists (
        select 1
        from wallet_trades evidence_filter_trade
        where evidence_filter_trade.token_address = ${schema.signals.tokenAddress}
          and evidence_filter_trade.traded_at >= ${since.toISOString()}::timestamp
      )`);
    }
    if (query.minWalletCount !== undefined) {
      conditions.push(sql`(
        select count(distinct wallet_count_filter_trade.wallet_address)
        from wallet_trades wallet_count_filter_trade
        where wallet_count_filter_trade.token_address = ${schema.signals.tokenAddress}
          and wallet_count_filter_trade.traded_at >= ${since.toISOString()}::timestamp
      ) >= ${query.minWalletCount}`);
    }
    if (query.minQualifiedWalletCount !== undefined) {
      conditions.push(sql`(
        select count(distinct qualified_filter_trade.wallet_address)
        from wallet_trades qualified_filter_trade
        inner join wallets qualified_filter_wallet on qualified_filter_wallet.id = qualified_filter_trade.wallet_id
        left join wallet_performance qualified_filter_perf on qualified_filter_perf.wallet_id = qualified_filter_wallet.id
        where qualified_filter_trade.token_address = ${schema.signals.tokenAddress}
          and qualified_filter_trade.traded_at >= ${since.toISOString()}::timestamp
          and (
            qualified_filter_wallet.metadata->'qualification'->>'isQualified' = 'true'
            or coalesce(qualified_filter_perf.score, 0) >= 60
          )
      ) >= ${query.minQualifiedWalletCount}`);
    }
    if (query.excludeBundlers === "true") {
      conditions.push(sql`not exists (
        select 1
        from wallet_trades bundler_filter_trade
        inner join wallets bundler_filter_wallet on bundler_filter_wallet.id = bundler_filter_trade.wallet_id
        where bundler_filter_trade.token_address = ${schema.signals.tokenAddress}
          and bundler_filter_trade.traded_at >= ${since.toISOString()}::timestamp
          and bundler_filter_wallet.classification = 'bundler'
      )`);
    }
    if (query.maxPairAgeMinutes !== undefined) {
      conditions.push(sql`exists (
        select 1
        from token_launches pair_age_filter_launch
        where pair_age_filter_launch.token_address = ${schema.signals.tokenAddress}
          and extract(epoch from (now() - coalesce(
            nullif(pair_age_filter_launch.metadata->>'pairCreatedAt', '')::timestamp,
            pair_age_filter_launch.launched_at
          ))) / 60 <= ${query.maxPairAgeMinutes}
      )`);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const offset = (query.page - 1) * query.limit;

    const [results, countResult] = await Promise.all([
      db
        .select({
          id: schema.signals.id,
          tokenAddress: schema.signals.tokenAddress,
          signalScore: schema.signals.signalScore,
          confidence: schema.signals.confidence,
          priority: schema.signals.priority,
          rulesetVersion: schema.signals.rulesetVersion,
          metadata: schema.signals.metadata,
          detectedAt: schema.signals.detectedAt,
          tokenSymbol: schema.tokens.symbol,
          tokenName: schema.tokens.name,
          tokenFirstSeenAt: schema.tokens.firstSeenAt,
        })
        .from(schema.signals)
        .leftJoin(schema.tokens, sql`${schema.signals.tokenAddress} = ${schema.tokens.address}`)
        .where(whereClause)
        .orderBy(orderFn(orderCol))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.signals)
        .where(whereClause),
    ]);

    const total = Number(countResult[0]?.count || 0);
    const tokenAddresses = [...new Set(results.map((result) => result.tokenAddress))];

    const [snapshotRows, launchRows] =
      tokenAddresses.length > 0
        ? await Promise.all([
            db
              .select({
                tokenAddress: schema.tokenSnapshots.tokenAddress,
                snapshotAt: schema.tokenSnapshots.snapshotAt,
                marketCapUsd: schema.tokenSnapshots.marketCapUsd,
                priceUsd: schema.tokenSnapshots.priceUsd,
                volume1hUsd: schema.tokenSnapshots.volume1hUsd,
                volume24hUsd: schema.tokenSnapshots.volume24hUsd,
                liquidityUsd: schema.tokenSnapshots.liquidityUsd,
                holderCount: schema.tokenSnapshots.holderCount,
                priceChange1h: schema.tokenSnapshots.priceChange1h,
                priceChange24h: schema.tokenSnapshots.priceChange24h,
              })
              .from(schema.tokenSnapshots)
              .where(
                and(
                  inArray(schema.tokenSnapshots.tokenAddress, tokenAddresses),
                  gte(schema.tokenSnapshots.snapshotAt, since),
                ),
              )
              .orderBy(desc(schema.tokenSnapshots.snapshotAt)),
            db
              .select({
                tokenAddress: schema.tokenLaunches.tokenAddress,
                launchedAt: schema.tokenLaunches.launchedAt,
                metadata: schema.tokenLaunches.metadata,
              })
              .from(schema.tokenLaunches)
              .where(
                and(
                  inArray(schema.tokenLaunches.tokenAddress, tokenAddresses),
                  gte(schema.tokenLaunches.launchedAt, since),
                ),
              )
              .orderBy(desc(schema.tokenLaunches.launchedAt)),
          ])
        : [[], []];

    const snapshotByToken = new Map<
      string,
      {
        snapshotAt: Date;
        marketCapUsd: string | null;
        priceUsd: string | null;
        volume1hUsd: string | null;
        volume24hUsd: string | null;
        liquidityUsd: string | null;
        holderCount: number | null;
        priceChange1h: string | null;
        priceChange24h: string | null;
      }
    >();
    for (const snapshot of snapshotRows) {
      if (!snapshotByToken.has(snapshot.tokenAddress)) {
        snapshotByToken.set(snapshot.tokenAddress, snapshot);
      }
    }

    const launchByToken = new Map<string, { launchedAt: Date; metadata: unknown }>();
    for (const launch of launchRows) {
      if (!launchByToken.has(launch.tokenAddress)) {
        launchByToken.set(launch.tokenAddress, launch);
      }
    }

    const tradeRows =
      tokenAddresses.length > 0
        ? await db
            .select()
            .from(schema.walletTrades)
            .where(
              and(
                inArray(schema.walletTrades.tokenAddress, tokenAddresses),
                gte(schema.walletTrades.tradedAt, since),
              ),
            )
            .orderBy(desc(schema.walletTrades.tradedAt))
            .limit(500)
        : [];
    const tradeWalletIds = [...new Set(tradeRows.map((trade) => trade.walletId))];
    const [tradeWalletRows, performanceRows] =
      tradeWalletIds.length > 0
        ? await Promise.all([
            db.select().from(schema.wallets).where(inArray(schema.wallets.id, tradeWalletIds)),
            db
              .select()
              .from(schema.walletPerformance)
              .where(inArray(schema.walletPerformance.walletId, tradeWalletIds)),
          ])
        : [[], []];

    const walletById = new Map(tradeWalletRows.map((wallet) => [wallet.id, wallet]));
    const latestPerformanceByWallet = new Map<string, (typeof performanceRows)[number]>();
    for (const performance of performanceRows.sort(
      (a, b) => b.calculatedAt.getTime() - a.calculatedAt.getTime(),
    )) {
      if (!latestPerformanceByWallet.has(performance.walletId)) {
        latestPerformanceByWallet.set(performance.walletId, performance);
      }
    }

    const evidenceByToken = new Map<
      string,
      {
        tradeCount: number;
        walletAddresses: Set<string>;
        qualifiedWalletAddresses: Set<string>;
        latestTradeAt: Date | null;
        topWallets: Array<{
          walletAddress: string;
          label: string | null;
          classification: string;
          score: number | null;
          isQualified: boolean;
          tradeType: string;
          valueUsd: number | null;
          tradedAt: string;
        }>;
      }
    >();
    for (const trade of tradeRows) {
      const wallet = walletById.get(trade.walletId);
      const performance = latestPerformanceByWallet.get(trade.walletId);
      const isQualified = wallet ? isQualifiedWallet(wallet, performance) : false;
      const evidence = evidenceByToken.get(trade.tokenAddress) ?? {
        tradeCount: 0,
        walletAddresses: new Set<string>(),
        qualifiedWalletAddresses: new Set<string>(),
        latestTradeAt: null,
        topWallets: [],
      };
      evidence.tradeCount += 1;
      evidence.walletAddresses.add(trade.walletAddress);
      if (isQualified) evidence.qualifiedWalletAddresses.add(trade.walletAddress);
      if (!evidence.latestTradeAt || trade.tradedAt > evidence.latestTradeAt) {
        evidence.latestTradeAt = trade.tradedAt;
      }
      if (evidence.topWallets.length < 3) {
        evidence.topWallets.push({
          walletAddress: trade.walletAddress,
          label: wallet?.label || null,
          classification: wallet?.classification || "unknown",
          score: performance?.score ?? null,
          isQualified,
          tradeType: trade.tradeType,
          valueUsd: trade.valueUsd ? Number(trade.valueUsd) : null,
          tradedAt: trade.tradedAt.toISOString(),
        });
      }
      evidenceByToken.set(trade.tokenAddress, evidence);
    }

    return {
      success: true,
      data: results.map((r) => {
        const signalMetadata = asRecord(r.metadata);
        const holderEvidence = asRecord(signalMetadata.holderEvidence);
        const riskMetadata = asRecord(signalMetadata.risk);

        return {
          ...resolveSourceMetadata({
            signalMetadata: r.metadata,
            launchMetadata: launchByToken.get(r.tokenAddress)?.metadata,
            snapshotAt: snapshotByToken.get(r.tokenAddress)?.snapshotAt,
            detectedAt: r.detectedAt,
            launchedAt: launchByToken.get(r.tokenAddress)?.launchedAt,
            firstSeenAt: r.tokenFirstSeenAt,
          }),
          id: r.id,
          tokenAddress: r.tokenAddress,
          tokenSymbol: r.tokenSymbol || "UNKNOWN",
          tokenName: r.tokenName || "Unknown Token",
          signalScore: r.signalScore,
          confidence: Number(r.confidence),
          priority: r.priority,
          rulesetVersion: r.rulesetVersion,
          holderEvidence: {
            provider: typeof holderEvidence.provider === "string" ? holderEvidence.provider : null,
            sampledHolders:
              typeof holderEvidence.sampledHolders === "number" ? holderEvidence.sampledHolders : 0,
            topHolderConcentrationPct:
              typeof holderEvidence.topHolderConcentrationPct === "number"
                ? holderEvidence.topHolderConcentrationPct
                : null,
          },
          risk: {
            score: typeof riskMetadata.score === "number" ? riskMetadata.score : null,
            rating: typeof riskMetadata.rating === "string" ? riskMetadata.rating : null,
          },
          pair: (() => {
            const pairCreatedAt = getPairCreatedAt(launchByToken.get(r.tokenAddress));
            return {
              pairCreatedAt: pairCreatedAt?.toISOString() ?? null,
              pairAgeMinutes: pairCreatedAt
                ? Math.max(0, Math.floor((Date.now() - pairCreatedAt.getTime()) / 60_000))
                : null,
            };
          })(),
          market: snapshotByToken.get(r.tokenAddress)
            ? {
                marketCapUsd: Number(snapshotByToken.get(r.tokenAddress)?.marketCapUsd || 0),
                priceUsd: Number(snapshotByToken.get(r.tokenAddress)?.priceUsd || 0),
                volume1hUsd: Number(snapshotByToken.get(r.tokenAddress)?.volume1hUsd || 0),
                volume24hUsd: Number(snapshotByToken.get(r.tokenAddress)?.volume24hUsd || 0),
                liquidityUsd: Number(snapshotByToken.get(r.tokenAddress)?.liquidityUsd || 0),
                holderCount: snapshotByToken.get(r.tokenAddress)?.holderCount ?? null,
                priceChange1h: Number(snapshotByToken.get(r.tokenAddress)?.priceChange1h || 0),
                priceChange24h: Number(snapshotByToken.get(r.tokenAddress)?.priceChange24h || 0),
              }
            : null,
          walletEvidence: (() => {
            const evidence = evidenceByToken.get(r.tokenAddress);
            return {
              tradeCount: evidence?.tradeCount ?? 0,
              walletCount: evidence?.walletAddresses.size ?? 0,
              qualifiedWalletCount: evidence?.qualifiedWalletAddresses.size ?? 0,
              latestTradeAt: evidence?.latestTradeAt?.toISOString() ?? null,
              topWallets: evidence?.topWallets ?? [],
            };
          })(),
          detectedAt: r.detectedAt?.toISOString() || new Date().toISOString(),
        };
      }),
      requestId: request.id,
      timestamp: new Date().toISOString(),
      dataWindow: serializeRecentWindow(since),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  app.post(
    "/scanner/live-scan",
    { config: { rateLimit: { max: 4, timeWindow: "1 minute" } } },
    async (request) => {
      const body = liveScanBodySchema.parse(request.body ?? {});
      const db = getDb();
      const heliusApiKey = process.env.HELIUS_API_KEY;
      const isMainnet = !!heliusApiKey;
      const rpcUrl = isMainnet
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        : process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

      const providers = createProviderRegistry({
        solanaRpcUrl: rpcUrl,
        heliusApiKey,
        birdeyeApiKey: process.env.BIRDEYE_API_KEY,
      });

      const startedAt = new Date();
      log.info({ network: isMainnet ? "mainnet" : "devnet" }, "Manual live scanner run requested");

      const [marketHealth, chainHealth] = await Promise.all([
        providers.marketData.health(),
        providers.blockchain.health(),
      ]);

      if (!chainHealth.healthy) {
        return {
          success: false,
          error: "Live scan could not start because the Solana RPC provider is unhealthy.",
          data: {
            marketHealth,
            chainHealth,
            startedAt: startedAt.toISOString(),
          },
          requestId: request.id,
          timestamp: new Date().toISOString(),
        };
      }

      const result = await discoverTokens({
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        isMainnet,
        providers,
        repository: createTokenDiscoveryRepository(db),
        maxEvents: body.limit,
        minSignalRefreshMinutes: body.minSignalRefreshMinutes,
      });

      return {
        success: true,
        data: {
          ...result,
          provider: {
            blockchain: providers.blockchain.name,
            tokenDiscovery: providers.tokenDiscovery.name,
            marketData: providers.marketData.name,
          },
          marketHealth,
          chainHealth,
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
        },
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    },
  );

  app.post(
    "/scanner/discover-wallets",
    { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } },
    async (request) => {
      const body = walletDiscoveryBodySchema.parse(request.body ?? {});
      const heliusApiKey = process.env.HELIUS_API_KEY;
      const startedAt = new Date();

      if (!heliusApiKey) {
        return {
          success: false,
          error: "Wallet discovery requires HELIUS_API_KEY.",
          data: {
            startedAt: startedAt.toISOString(),
          },
          requestId: request.id,
          timestamp: new Date().toISOString(),
        };
      }

      log.info(
        {
          sinceHours: body.sinceHours,
          tokenLimit: body.tokenLimit,
          transactionsPerToken: body.transactionsPerToken,
          walletLimit: body.walletLimit,
        },
        "Token wallet discovery requested",
      );

      const result = await discoverWalletsFromRecentTokens({
        heliusApiKey,
        sinceHours: body.sinceHours,
        tokenLimit: body.tokenLimit,
        transactionsPerToken: body.transactionsPerToken,
        walletLimit: body.walletLimit,
        minCandidateScore: body.minCandidateScore,
      });

      return {
        success: true,
        data: {
          ...result,
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
        },
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    },
  );
};
