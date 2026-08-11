import { fileURLToPath } from "url";
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { logger } from "@memecoin/logger";
import { getDb } from "@memecoin/database";
import { createProviderRegistry } from "@memecoin/solana";
import { runProcessorService } from "@memecoin/processor";
import { runAlertsService } from "@memecoin/alerts";
import { startTransactionStreamIngestion } from "./stream-ingestion.js";
import { runWalletSyncService, scheduleTrackedWalletSync } from "./wallet-sync-service.js";
import { createTokenDiscoveryRepository, discoverTokens } from "./discovery/discover-tokens.js";
import { discoverWalletsFromRecentTokens } from "./token-wallet-discovery.js";
import { backfillSignalScores } from "./signal-score-backfill.js";
import { backfillAlertOutcomes } from "./alert-outcomes.js";
import { runTokenAnalysisService } from "./token-analysis-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });
export { ingestRawTokenEvent, runIngestionPipeline } from "./pipeline.js";
export type { RawTokenEvent } from "./pipeline.js";
export { runWalletIntelligencePipeline } from "./wallet-pipeline.js";
export { isValidSolanaWalletAddress } from "./wallet-pipeline.js";
export { processStreamEvent, startTransactionStreamIngestion } from "./stream-ingestion.js";
export {
  enqueueWalletSyncJob,
  getLatestWalletSyncJob,
  runWalletSyncService,
  scheduleTrackedWalletSync,
} from "./wallet-sync-service.js";
export {
  createTokenDiscoveryRepository,
  discoverTokens,
} from "./discovery/discover-tokens.js";
export {
  discoverWalletsFromRecentTokens,
  discoverWalletsForToken,
} from "./token-wallet-discovery.js";
export {
  enqueueTokenAnalysisJob,
  getLatestTokenAnalysisJob,
  runTokenAnalysisService,
} from "./token-analysis-service.js";
export { isValidTokenAddress, runTokenAnalysisPipeline } from "./token-analysis.js";
export {
  backfillAlertOutcomes,
  getAlertOutcomeSummary,
} from "./alert-outcomes.js";
export { backfillSignalScores } from "./signal-score-backfill.js";
export type {
  DiscoverTokensOptions,
  DiscoverTokensResult,
  TokenDiscoveryRepository,
} from "./discovery/discover-tokens.js";
export type {
  TokenWalletDiscoveryOptions,
  TokenWalletDiscoveryResult,
} from "./token-wallet-discovery.js";
export type {
  AlertOutcomeBackfillResult,
} from "./alert-outcomes.js";
export type { SignalScoreBackfillResult } from "./signal-score-backfill.js";

const log = logger("indexer-service");

function parseBooleanEnv(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  return value === "true";
}

function parseNumberEnv(value: string | undefined, defaultValue: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

async function runSupervisedLoop(
  name: string,
  task: () => Promise<void>,
  options: { restartDelayMs?: number; shouldRun?: () => boolean } = {},
) {
  const restartDelayMs = options.restartDelayMs ?? 5000;

  while (options.shouldRun?.() ?? true) {
    try {
      await task();
      return;
    } catch (error) {
      log.error({ error, service: name }, "Service loop crashed");
      if (!(options.shouldRun?.() ?? true)) {
        return;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, restartDelayMs));
    }
  }
}

export async function runIndexerService() {
  let shuttingDown = false;
  const walletScheduleMs = parseNumberEnv(process.env.WALLET_SYNC_SCHEDULE_MS, 5 * 60 * 1000);
  const walletStaleAfterMs = parseNumberEnv(process.env.WALLET_SYNC_STALE_AFTER_MS, 30 * 60 * 1000);
  const walletSyncBatchLimit = parseNumberEnv(process.env.WALLET_SYNC_BATCH_LIMIT, 2);
  const walletDiscoveryScheduleMs = parseNumberEnv(process.env.WALLET_DISCOVERY_SCHEDULE_MS, 15 * 60 * 1000);
  const discoveryScheduleMs = parseNumberEnv(process.env.DISCOVERY_SCHEDULE_MS, 15_000);
  const outcomeScheduleMs = parseNumberEnv(process.env.ALERT_OUTCOME_SCHEDULE_MS, 15 * 60 * 1000);
  const streamEnabled = parseBooleanEnv(process.env.INDEXER_ENABLE_STREAM, true);
  const walletSchedulerEnabled = parseBooleanEnv(process.env.WALLET_SYNC_AUTOMATION_ENABLED, true);
  const walletDiscoveryEnabled = parseBooleanEnv(process.env.WALLET_DISCOVERY_AUTOMATION_ENABLED, false);
  const discoveryEnabled = parseBooleanEnv(process.env.INDEXER_ENABLE_DISCOVERY, true);
  const embedProcessor = parseBooleanEnv(process.env.INDEXER_EMBED_PROCESSOR, false);
  const embedAlerts = parseBooleanEnv(process.env.INDEXER_EMBED_ALERTS, true);
  const outcomeAutomationEnabled = parseBooleanEnv(process.env.ALERT_OUTCOME_AUTOMATION_ENABLED, true);
  const scoreBackfillEnabled = parseBooleanEnv(process.env.SIGNAL_SCORE_BACKFILL_ON_START, true);

  if (scoreBackfillEnabled) {
    try {
      await backfillSignalScores({
        limit: parseNumberEnv(process.env.SIGNAL_SCORE_BACKFILL_LIMIT, 2000),
        sinceDays: parseNumberEnv(process.env.SIGNAL_SCORE_BACKFILL_SINCE_DAYS, 7),
      });
    } catch (error) {
      log.error({ error }, "Signal score startup backfill failed");
    }
  }

  if (embedProcessor) {
    await runProcessorService();
  }
  const alertsWorker = embedAlerts ? await runAlertsService() : null;
  const walletWorker = await runWalletSyncService();
  const tokenAnalysisWorker = await runTokenAnalysisService();
  let walletTimer: NodeJS.Timeout | null = null;
  let walletDiscoveryTimer: NodeJS.Timeout | null = null;
  let discoveryTimer: NodeJS.Timeout | null = null;
  let outcomeTimer: NodeJS.Timeout | null = null;
  let discoveryRunning = false;
  let walletDiscoveryRunning = false;

  const runDiscovery = async () => {
    if (discoveryRunning) return;

    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      log.warn("Skipping live discovery because HELIUS_API_KEY is not configured");
      return;
    }

    discoveryRunning = true;
    try {
      const providers = createProviderRegistry({
        heliusApiKey,
        solanaRpcUrl: process.env.SOLANA_RPC_URL,
        birdeyeApiKey: process.env.BIRDEYE_API_KEY,
      });
      const result = await discoverTokens({
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        isMainnet: true,
        providers,
        repository: createTokenDiscoveryRepository(getDb()),
        maxEvents: Number(process.env.DISCOVERY_MAX_EVENTS ?? 150),
        minSignalRefreshMinutes: Number(process.env.DISCOVERY_SIGNAL_REFRESH_MINUTES ?? 45),
      });
      log.info(result, "Live discovery pass complete");
    } catch (error) {
      log.error({ error }, "Live discovery pass failed");
    } finally {
      discoveryRunning = false;
    }
  };

  if (discoveryEnabled) {
    void runDiscovery();
    discoveryTimer = setInterval(() => {
      void runDiscovery();
    }, discoveryScheduleMs);
  }

  if (outcomeAutomationEnabled) {
    const runOutcomeBackfill = async () => {
      try {
        const result = await backfillAlertOutcomes({
          limit: parseNumberEnv(process.env.ALERT_OUTCOME_LIMIT, 500),
          sinceDays: parseNumberEnv(process.env.ALERT_OUTCOME_SINCE_DAYS, 7),
        });
        if (result.outcomesInserted > 0) log.info(result, "Scheduled alert outcomes recorded");
      } catch (error) {
        log.error({ error }, "Scheduled alert outcome backfill failed");
      }
    };
    void runOutcomeBackfill();
    outcomeTimer = setInterval(() => void runOutcomeBackfill(), outcomeScheduleMs);
  }

  const runWalletDiscovery = async () => {
    if (walletDiscoveryRunning) return;

    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      log.warn("Skipping automated wallet discovery because HELIUS_API_KEY is not configured");
      return;
    }

    walletDiscoveryRunning = true;
    try {
      const result = await discoverWalletsFromRecentTokens({
        heliusApiKey,
        sinceHours: Number(process.env.DISCOVER_WALLET_SINCE_HOURS ?? 24),
        tokenLimit: Number(process.env.DISCOVER_WALLET_TOKEN_LIMIT ?? 12),
        transactionsPerToken: Number(process.env.DISCOVER_WALLET_TX_LIMIT ?? 25),
        walletLimit: Number(process.env.DISCOVER_WALLET_LIMIT ?? 8),
        minCandidateScore: Number(process.env.DISCOVER_WALLET_MIN_SCORE ?? 8),
      });
      log.info(result, "Live wallet discovery pass complete");
    } catch (error) {
      log.error({ error }, "Live wallet discovery pass failed");
    } finally {
      walletDiscoveryRunning = false;
    }
  };

  if (walletDiscoveryEnabled) {
    void runWalletDiscovery();
    walletDiscoveryTimer = setInterval(() => {
      void runWalletDiscovery();
    }, walletDiscoveryScheduleMs);
  }

  if (walletSchedulerEnabled) {
    const runSchedule = async () => {
      const result = await scheduleTrackedWalletSync({
        staleAfterMs: walletStaleAfterMs,
        limit: walletSyncBatchLimit,
      });
      if (result.queued > 0) {
        log.info(result, "Queued stale wallets for background sync");
      }
    };

    await runSchedule();
    walletTimer = setInterval(() => {
      void runSchedule().catch((error) => {
        log.error({ error }, "Wallet sync scheduler pass failed");
      });
    }, walletScheduleMs);
  }

  const cleanup = async () => {
    shuttingDown = true;
    if (walletTimer) {
      clearInterval(walletTimer);
      walletTimer = null;
    }
    if (walletDiscoveryTimer) {
      clearInterval(walletDiscoveryTimer);
      walletDiscoveryTimer = null;
    }
    if (discoveryTimer) {
      clearInterval(discoveryTimer);
      discoveryTimer = null;
    }
    if (outcomeTimer) {
      clearInterval(outcomeTimer);
      outcomeTimer = null;
    }
    if (alertsWorker) await alertsWorker.close();
    await tokenAnalysisWorker.close();
    await walletWorker.close();
  };

  process.once("SIGINT", () => {
    void cleanup().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void cleanup().finally(() => process.exit(0));
  });

  if (streamEnabled) {
    void runSupervisedLoop(
      "transaction-stream-ingestion",
      () => startTransactionStreamIngestion(),
      { shouldRun: () => !shuttingDown },
    );
  }

  log.info({
    streamEnabled,
    walletSchedulerEnabled,
    walletScheduleMs,
    walletStaleAfterMs,
    walletSyncBatchLimit,
    walletDiscoveryEnabled,
    walletDiscoveryScheduleMs,
    discoveryEnabled,
    discoveryScheduleMs,
    embedProcessor,
    embedAlerts,
    outcomeAutomationEnabled,
    outcomeScheduleMs,
    scoreBackfillEnabled,
  }, "Indexer service started");

  await new Promise(() => undefined);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  runIndexerService().catch((error) => {
    log.error({ error }, "Indexer service failed");
    process.exit(1);
  });
}
