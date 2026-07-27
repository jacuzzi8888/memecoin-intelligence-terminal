import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { logger } from "@memecoin/logger";

const log = logger("queue");

let _connection: IORedis | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

export interface QueueConfig {
  name: string;
  defaultJobOptions?: JobsOptions;
}

export interface RawEventProcessingJobData {
  eventId?: string;
  limit?: number;
  trigger: "ingest" | "recovery";
}

export interface AlertDeliveryJobData {
  eventId?: string;
  limit?: number;
  trigger: "processor" | "recovery";
}

export interface WalletSyncJobData {
  walletAddress: string;
  trigger: "api" | "scheduler" | "recovery";
}

export interface DeadLetterJobData<T = unknown> {
  sourceQueue: string;
  jobId: string | null;
  attemptsMade: number;
  payload: T;
  error: string;
  failedAt: string;
}

export const RAW_EVENT_PROCESSING_QUEUE = "raw-event-processing";
export const ALERT_DELIVERY_QUEUE = "alert-delivery";
export const WALLET_SYNC_QUEUE = "wallet-sync";

let _rawEventProcessingQueue: Queue<RawEventProcessingJobData> | null = null;
let _alertDeliveryQueue: Queue<AlertDeliveryJobData> | null = null;
let _walletSyncQueue: Queue<WalletSyncJobData> | null = null;
const _deadLetterQueues = new Map<string, Queue<DeadLetterJobData>>();

export function createQueue<T = unknown>(config: QueueConfig): Queue<T> {
  const connection = getConnection();
  const queue = new Queue<T>(config.name, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      ...config.defaultJobOptions,
    },
  });

  log.info({ queue: config.name }, "Queue created");
  return queue;
}

export function createRawEventProcessingQueue(): Queue<RawEventProcessingJobData> {
  if (!_rawEventProcessingQueue) {
    _rawEventProcessingQueue = createQueue<RawEventProcessingJobData>({
      name: RAW_EVENT_PROCESSING_QUEUE,
    });
  }

  return _rawEventProcessingQueue;
}

export function createAlertDeliveryQueue(): Queue<AlertDeliveryJobData> {
  if (!_alertDeliveryQueue) {
    _alertDeliveryQueue = createQueue<AlertDeliveryJobData>({
      name: ALERT_DELIVERY_QUEUE,
    });
  }

  return _alertDeliveryQueue;
}

export function createWalletSyncQueue(): Queue<WalletSyncJobData> {
  if (!_walletSyncQueue) {
    _walletSyncQueue = createQueue<WalletSyncJobData>({
      name: WALLET_SYNC_QUEUE,
    });
  }

  return _walletSyncQueue;
}

export function getDeadLetterQueueName(queueName: string) {
  return `${queueName}-dead-letter`;
}

export function createDeadLetterQueue<T = unknown>(queueName: string): Queue<DeadLetterJobData<T>> {
  const deadLetterQueueName = getDeadLetterQueueName(queueName);
  const existing = _deadLetterQueues.get(deadLetterQueueName);
  if (existing) {
    return existing as Queue<DeadLetterJobData<T>>;
  }

  const queue = createQueue<DeadLetterJobData<T>>({
    name: deadLetterQueueName,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 2000 },
      removeOnFail: false,
    },
  });
  _deadLetterQueues.set(deadLetterQueueName, queue as Queue<DeadLetterJobData>);
  return queue;
}

interface WorkerConfig<T> {
  concurrency?: number;
  onTerminalFailure?: (job: Job<T>, error: Error) => Promise<void> | void;
}

export function createWorker<T = unknown>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  config: WorkerConfig<T> = {},
): Worker<T> {
  const connection = getConnection();
  const worker = new Worker<T>(queueName, processor, {
    connection,
    concurrency: config.concurrency ?? 5,
  });

  worker.on("completed", (job) => {
    log.debug({ queue: queueName, jobId: job.id }, "Job completed");
  });

  worker.on("failed", async (job, err) => {
    log.error({ queue: queueName, jobId: job?.id, error: err.message }, "Job failed");

    if (!job) return;

    const attempts = job.opts.attempts ?? 1;
    const terminalFailure = job.attemptsMade >= attempts;

    if (!terminalFailure) {
      return;
    }

    try {
      await createDeadLetterQueue<T>(queueName).add(`${queueName}-dead-letter`, {
        sourceQueue: queueName,
        jobId: job.id ? String(job.id) : null,
        attemptsMade: job.attemptsMade,
        payload: job.data,
        error: err.message,
        failedAt: new Date().toISOString(),
      });

      if (config.onTerminalFailure) {
        await config.onTerminalFailure(job, err);
      }
    } catch (deadLetterError) {
      log.error(
        { queue: queueName, jobId: job.id, error: deadLetterError instanceof Error ? deadLetterError.message : String(deadLetterError) },
        "Failed to dead-letter job",
      );
    }
  });

  worker.on("error", (err) => {
    log.error({ queue: queueName, error: err.message }, "Worker error");
  });

  log.info({ queue: queueName }, "Worker created");
  return worker;
}

export async function getQueueStats(queue: Queue): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  deadLetter: number;
}> {
  const deadLetterQueue = createDeadLetterQueue(queue.name);
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  const deadLetter = await deadLetterQueue.getWaitingCount();

  return { waiting, active, completed, failed, delayed, deadLetter };
}

export async function closeAll(): Promise<void> {
  if (_rawEventProcessingQueue) {
    await _rawEventProcessingQueue.close();
    _rawEventProcessingQueue = null;
  }

  if (_alertDeliveryQueue) {
    await _alertDeliveryQueue.close();
    _alertDeliveryQueue = null;
  }

  if (_walletSyncQueue) {
    await _walletSyncQueue.close();
    _walletSyncQueue = null;
  }

  for (const queue of _deadLetterQueues.values()) {
    await queue.close();
  }
  _deadLetterQueues.clear();

  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}

export { Queue, Worker, type Job };
