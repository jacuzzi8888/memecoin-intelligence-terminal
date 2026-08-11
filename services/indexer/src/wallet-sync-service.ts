import { desc, eq } from "drizzle-orm";
import {
  createBackgroundJobRecord,
  getDb,
  markBackgroundJobCompleted,
  markBackgroundJobDeadLettered,
  markBackgroundJobFailed,
  markBackgroundJobRetrying,
  markBackgroundJobRunning,
} from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { logger } from "@memecoin/logger";
import {
  WALLET_SYNC_QUEUE,
  createWalletSyncQueue,
  createWorker,
  type WalletSyncJobData,
} from "@memecoin/queue";
import { isValidSolanaWalletAddress, runWalletIntelligencePipeline } from "./wallet-pipeline.js";

const log = logger("wallet-sync-service");
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;
const DEFAULT_SYNC_LIMIT = 25;

export async function enqueueWalletSyncJob(
  walletAddress: string,
  trigger: WalletSyncJobData["trigger"] = "api",
) {
  if (!isValidSolanaWalletAddress(walletAddress)) {
    throw new Error("Invalid Solana wallet address");
  }

  const queue = createWalletSyncQueue();
  const job = await queue.add("sync-wallet", {
    walletAddress,
    trigger,
  });

  await createBackgroundJobRecord(getDb(), {
    queueName: WALLET_SYNC_QUEUE,
    jobType: "sync-wallet",
    bullJobId: job.id ? String(job.id) : null,
    payload: {
      walletAddress,
      trigger,
    },
  });

  return {
    queue: WALLET_SYNC_QUEUE,
    jobId: job.id ? String(job.id) : null,
    walletAddress,
    trigger,
  };
}

function walletNeedsSync(
  wallet: {
    address: string;
    metadata: unknown;
    updatedAt: Date;
  },
  staleAfterMs: number,
) {
  const metadata = typeof wallet.metadata === "object" && wallet.metadata !== null
    ? wallet.metadata as Record<string, unknown>
    : {};
  const lastSyncedAtValue = metadata.lastSyncedAt;
  const lastSyncedAt = typeof lastSyncedAtValue === "string" ? new Date(lastSyncedAtValue) : wallet.updatedAt;
  return Date.now() - lastSyncedAt.getTime() >= staleAfterMs;
}

export async function scheduleTrackedWalletSync(options?: {
  staleAfterMs?: number;
  limit?: number;
}) {
  const staleAfterMs = options?.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const limit = options?.limit ?? DEFAULT_SYNC_LIMIT;
  const db = getDb();
  const inFlightJobs = await createWalletSyncQueue().getJobs(["waiting", "active", "delayed"], 0, -1);
  const inFlightAddresses = new Set(inFlightJobs.map((job) => job.data.walletAddress));

  const wallets = await db.select({
    address: schema.wallets.address,
    metadata: schema.wallets.metadata,
    updatedAt: schema.wallets.updatedAt,
  })
    .from(schema.wallets)
    .orderBy(desc(schema.wallets.updatedAt))
    .limit(limit * 4);

  const staleWallets = wallets
    .filter((wallet) => isValidSolanaWalletAddress(wallet.address))
    .filter((wallet) => !inFlightAddresses.has(wallet.address))
    .filter((wallet) => walletNeedsSync(wallet, staleAfterMs))
    .slice(0, limit);

  for (const wallet of staleWallets) {
    await enqueueWalletSyncJob(wallet.address, "scheduler");
  }

  return {
    scanned: wallets.length,
    queued: staleWallets.length,
    skippedInFlight: inFlightAddresses.size,
  };
}

export async function runWalletSyncService() {
  const configuredConcurrency = Number(process.env.WALLET_SYNC_CONCURRENCY ?? 1);
  const concurrency = Number.isFinite(configuredConcurrency)
    ? Math.max(1, Math.min(5, Math.floor(configuredConcurrency)))
    : 1;

  const worker = createWorker<WalletSyncJobData>(WALLET_SYNC_QUEUE, async (job) => {
    const bullJobId = job.id ? String(job.id) : null;
    const db = getDb();

    if (bullJobId) {
      await markBackgroundJobRunning(db, WALLET_SYNC_QUEUE, bullJobId);
    }

    try {
      const result = await runWalletIntelligencePipeline(job.data.walletAddress);
      if (bullJobId) {
        await markBackgroundJobCompleted(db, WALLET_SYNC_QUEUE, bullJobId, result as unknown as Record<string, unknown>);
      }
    } catch (error) {
      if (bullJobId) {
        const attempts = job.opts.attempts ?? 1;
        const terminalFailure = job.attemptsMade + 1 >= attempts;
        if (terminalFailure) {
          await markBackgroundJobFailed(db, WALLET_SYNC_QUEUE, bullJobId, error);
        } else {
          await markBackgroundJobRetrying(db, WALLET_SYNC_QUEUE, bullJobId, error);
        }
      }
      throw error;
    }
  }, {
    concurrency,
    onTerminalFailure: async (job, error) => {
      const bullJobId = job.id ? String(job.id) : null;
      if (!bullJobId) return;
      await markBackgroundJobDeadLettered(getDb(), WALLET_SYNC_QUEUE, bullJobId, error);
    },
  });

  await worker.waitUntilReady();
  log.info({ queue: WALLET_SYNC_QUEUE, concurrency }, "Wallet sync worker started");
  return worker;
}

export async function getLatestWalletSyncJob(walletAddress: string) {
  const rows = await getDb().select()
    .from(schema.backgroundJobs)
    .where(eq(schema.backgroundJobs.queueName, WALLET_SYNC_QUEUE))
    .orderBy(desc(schema.backgroundJobs.createdAt))
    .limit(50);

  return rows.find((row) => {
    const payload = typeof row.payload === "object" && row.payload !== null
      ? row.payload as Record<string, unknown>
      : {};
    return payload.walletAddress === walletAddress;
  }) ?? null;
}
