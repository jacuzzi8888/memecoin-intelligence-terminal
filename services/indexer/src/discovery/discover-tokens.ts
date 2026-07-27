import { randomUUID } from "crypto";
import * as schema from "@memecoin/database/schema";
import { calculateSignalScore, calculateTokenRiskScore, type FactorContribution } from "@memecoin/intelligence";
import { generateDeepLinks } from "@memecoin/notifications";
import type { IProviderRegistry, TokenInfo } from "@memecoin/solana";
import { and, eq } from "drizzle-orm";
import { logger as createLogger } from "@memecoin/logger";
import type { getDb } from "@memecoin/database";

const log = createLogger("discover-tokens");

type Database = ReturnType<typeof getDb>;

interface DiscoveredTokenEvent {
  tokenAddress: string;
  deployer: string;
  timestamp: number;
  slot: number;
  signature: string;
  decimals: number;
  tokenInfo: TokenInfo | null;
}

interface StrategyRecord {
  id: string;
  config: Record<string, unknown>;
}

interface PersistedTokenRecord {
  id: string;
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
    priceChange1h: string;
    priceChange24h: string;
    snapshotAt: Date;
  }): Promise<void>;
  getActiveStrategies(): Promise<StrategyRecord[]>;
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
}

export interface DiscoverTokensResult {
  network: "mainnet" | "devnet";
  eventsFound: number;
  tokensFound: number;
  tokensProcessed: number;
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
    async getActiveStrategies() {
      const rows = await db.select({
        id: schema.strategies.id,
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
        config: typeof row.config === "object" && row.config !== null ? row.config as Record<string, unknown> : {},
      }));
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

function serializeSignalFactor(signalId: string, factor: FactorContribution) {
  return {
    signalId,
    factorName: factor.factorName,
    factorType: factor.factorType,
    rawValue: String(factor.rawValue ?? 0),
    contribution: String(factor.contribution),
    weight: String(factor.weight),
  };
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
    rawValue: String(factor.value ?? 0),
    contribution: String(factor.impact === "mitigation" ? Math.abs(factor.contribution) : -Math.abs(factor.contribution)),
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
  if (event.tokenInfo) {
    return { symbol: event.tokenInfo.symbol, name: event.tokenInfo.name };
  }

  return {
    symbol: "NEW",
    name: `Token ${event.tokenAddress.slice(0, 8)}`,
  };
}

function getPriority(score: number) {
  return score >= 80 ? "critical" : score >= 60 ? "high" : "medium";
}

function strategyMatches(
  strategy: StrategyRecord,
  signalScore: number,
  tokenAgeMinutes: number,
  liquidityUsd: number,
) {
  const minScore = typeof strategy.config.minScore === "number" ? strategy.config.minScore : 0;
  const maxAgeMinutes = typeof strategy.config.maxAgeMinutes === "number" ? strategy.config.maxAgeMinutes : null;
  const minLiquidityUsd = typeof strategy.config.minLiquidityUsd === "number" ? strategy.config.minLiquidityUsd : 0;

  if (signalScore < minScore) return false;
  if (maxAgeMinutes !== null && tokenAgeMinutes > maxAgeMinutes) return false;
  if (liquidityUsd < minLiquidityUsd) return false;

  return true;
}

export async function discoverTokens(options: DiscoverTokensOptions): Promise<DiscoverTokensResult> {
  const { appUrl, isMainnet, providers, repository } = options;
  const network = isMainnet ? "mainnet" : "devnet";

  log.info({ network }, "Scanning for new tokens...");

  let tokenEvents: DiscoveredTokenEvent[] = [];
  if (providers.tokenDiscovery.name !== "dev-token-discovery") {
    log.info({ provider: providers.tokenDiscovery.name }, "Using registry-backed token discovery...");
    tokenEvents = await discoverHeliusTokens({ tokenDiscovery: providers.tokenDiscovery });
  }

  if (tokenEvents.length === 0) {
    log.info("No tokens from registry discovery, falling back to RPC scan...");
    tokenEvents = await discoverRpcTokens({ blockchain: providers.blockchain });
  }

  log.info({ totalEvents: tokenEvents.length }, "Processing discovered tokens...");

  let tokensFound = 0;
  let tokensProcessed = 0;

  for (const event of tokenEvents.slice(0, 20)) {
    try {
      const existingToken = await repository.findTokenByAddress(event.tokenAddress);
      if (existingToken) {
        log.debug({ address: event.tokenAddress }, "Token already exists, skipping");
        continue;
      }

      tokensFound++;

      const tokenMeta = buildTokenMetadata(event);
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
        initialLiquidityUsd: "0",
        launchProgram: "Token Program",
        txSignature: event.signature,
        slot: String(event.slot),
        metadata: {
          network,
          discoveryProvider,
          marketDataProvider: providers.marketData.name,
        },
      });

      const marketData = await providers.marketData.getMarketData(event.tokenAddress);
      const now = Math.floor(Date.now() / 1000);
      const tokenAgeMinutes = Math.max(1, Math.floor((now - event.timestamp) / 60));

      log.info(
        { tokenAddress: event.tokenAddress, hasMarketData: !!marketData, provider: providers.marketData.name },
        "Fetched market data",
      );

      if (marketData) {
        try {
          await repository.insertTokenSnapshot({
            tokenId: persistedToken.id,
            tokenAddress: event.tokenAddress,
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
      const riskResult = calculateTokenRiskScore({
        tokenAgeMinutes,
        liquidityUsd: marketData?.liquidityUsd ?? null,
        volume1hUsd: marketData?.volume1hUsd ?? null,
        holderCount: marketData?.holderCount || null,
        bundledSupplyPct: null,
        deployerRisk: null,
        topHolderConcentration: null,
        lpLocked: null,
      });

      const strategies = await repository.getActiveStrategies();
      if (strategies.length === 0) continue;

      const priority = getPriority(scoreResult.score);
      const matchingStrategies = strategies.filter((strategy) =>
        strategyMatches(strategy, scoreResult.score, tokenAgeMinutes, marketData?.liquidityUsd ?? 0),
      );

      const links = generateDeepLinks(event.tokenAddress, appUrl);
      for (const strategy of matchingStrategies) {
        const signalId = await repository.insertSignal({
          strategyId: strategy.id,
          tokenAddress: event.tokenAddress,
          tokenId: persistedToken.id,
          signalScore: scoreResult.score,
          confidence: String(scoreResult.confidence),
          rulesetVersion: scoreResult.rulesetVersion,
          priority,
          metadata: {
            network,
            discoveryProvider,
            marketDataProvider: providers.marketData.name,
            snapshotAvailable: !!marketData,
            risk: {
              score: riskResult.riskScore,
              rating: riskResult.rating,
              confidence: riskResult.confidence,
              rulesetVersion: riskResult.rulesetVersion,
              missingFeatures: riskResult.missingFeatures,
            },
          },
        });
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
          title: `New Token: ${tokenMeta.symbol} (${event.tokenAddress.slice(0, 12)}...)`,
          message: `New ${tokenMeta.name} detected on Solana ${network}. Score: ${scoreResult.score}/100. Risk: ${riskResult.rating} (${riskResult.riskScore}/100).`,
          signalScore: scoreResult.score,
          webDeepLink: links.webUrl,
          telegramDeepLink: links.telegramUrl,
          status: "pending",
        });

        await repository.insertAlertDelivery({
          alertId,
          channel: "dev_outbox",
          destination: "log",
          status: "delivered",
          deliveredAt: new Date(),
        });
      }

      log.info(
        { token: tokenMeta.symbol, address: event.tokenAddress, score: scoreResult.score },
        "Signal + alert created for new token",
      );

      tokensProcessed++;
    } catch (err) {
      log.error({ error: err, tokenAddress: event.tokenAddress }, "Failed to process token");
    }
  }

  return {
    network,
    eventsFound: tokenEvents.length,
    tokensFound,
    tokensProcessed,
  };
}
