import { fileURLToPath } from "url";
import { resolve } from "path";
import { logger } from "@memecoin/logger";
import { startTransactionStreamIngestion } from "./stream-ingestion.js";
import { runWalletSyncService, scheduleTrackedWalletSync } from "./wallet-sync-service.js";
export { ingestRawTokenEvent, runIngestionPipeline } from "./pipeline.js";
export type { RawTokenEvent } from "./pipeline.js";
export { runWalletIntelligencePipeline } from "./wallet-pipeline.js";
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
export type {
  DiscoverTokensOptions,
  DiscoverTokensResult,
  TokenDiscoveryRepository,
} from "./discovery/discover-tokens.js";

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
  const streamEnabled = parseBooleanEnv(process.env.INDEXER_ENABLE_STREAM, true);
  const walletSchedulerEnabled = parseBooleanEnv(process.env.WALLET_SYNC_AUTOMATION_ENABLED, true);

  const walletWorker = await runWalletSyncService();
  let walletTimer: NodeJS.Timeout | null = null;

  if (walletSchedulerEnabled) {
    const runSchedule = async () => {
      const result = await scheduleTrackedWalletSync({ staleAfterMs: walletStaleAfterMs });
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
