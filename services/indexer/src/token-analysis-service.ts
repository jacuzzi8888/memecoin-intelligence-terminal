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
  TOKEN_ANALYSIS_QUEUE,
  createTokenAnalysisQueue,
  createWorker,
  type TokenAnalysisJobData,
} from "@memecoin/queue";
import { isValidTokenAddress, runTokenAnalysisPipeline } from "./token-analysis.js";

const log = logger("token-analysis-service");

export async function enqueueTokenAnalysisJob(
  tokenAddress: string,
  trigger: TokenAnalysisJobData["trigger"] = "api",
) {
  if (!isValidTokenAddress(tokenAddress)) throw new Error("Invalid Solana token address");
  const queue = createTokenAnalysisQueue();
  const job = await queue.add("analyze-token", { tokenAddress, trigger }, {
    jobId: `token-${tokenAddress}-${Date.now()}`,
  });

  await createBackgroundJobRecord(getDb(), {
    queueName: TOKEN_ANALYSIS_QUEUE,
    jobType: "analyze-token",
    bullJobId: job.id ? String(job.id) : null,
    payload: { tokenAddress, trigger },
    maxAttempts: 2,
  });

  return {
    queue: TOKEN_ANALYSIS_QUEUE,
    jobId: job.id ? String(job.id) : null,
    tokenAddress,
    trigger,
  };
}

export async function runTokenAnalysisService() {
  const worker = createWorker<TokenAnalysisJobData>(TOKEN_ANALYSIS_QUEUE, async (job) => {
    const bullJobId = job.id ? String(job.id) : null;
    const db = getDb();
    if (bullJobId) await markBackgroundJobRunning(db, TOKEN_ANALYSIS_QUEUE, bullJobId);

    try {
      const result = await runTokenAnalysisPipeline(job.data.tokenAddress);
      if (bullJobId) {
        await markBackgroundJobCompleted(
          db,
          TOKEN_ANALYSIS_QUEUE,
          bullJobId,
          result as unknown as Record<string, unknown>,
        );
      }
    } catch (error) {
      if (bullJobId) {
        const attempts = job.opts.attempts ?? 1;
        if (job.attemptsMade + 1 >= attempts) {
          await markBackgroundJobFailed(db, TOKEN_ANALYSIS_QUEUE, bullJobId, error);
        } else {
          await markBackgroundJobRetrying(db, TOKEN_ANALYSIS_QUEUE, bullJobId, error);
        }
      }
      throw error;
    }
  }, {
    concurrency: 1,
    onTerminalFailure: async (job, error) => {
      const bullJobId = job.id ? String(job.id) : null;
      if (bullJobId) {
        await markBackgroundJobDeadLettered(getDb(), TOKEN_ANALYSIS_QUEUE, bullJobId, error);
      }
    },
  });

  await worker.waitUntilReady();
  log.info({ queue: TOKEN_ANALYSIS_QUEUE }, "Token analysis worker started");
  return worker;
}

export async function getLatestTokenAnalysisJob(tokenAddress: string) {
  const rows = await getDb().select().from(schema.backgroundJobs)
    .where(eq(schema.backgroundJobs.queueName, TOKEN_ANALYSIS_QUEUE))
    .orderBy(desc(schema.backgroundJobs.createdAt))
    .limit(100);
  return rows.find((row) => {
    const payload = typeof row.payload === "object" && row.payload !== null
      ? row.payload as Record<string, unknown>
      : {};
    return payload.tokenAddress === tokenAddress;
  }) ?? null;
}
