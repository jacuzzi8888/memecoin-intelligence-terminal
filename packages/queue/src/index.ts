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

export function createQueue(config: QueueConfig): Queue {
  const connection = getConnection();
  const queue = new Queue(config.name, {
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

export function createWorker<T = unknown>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
): Worker<T> {
  const connection = getConnection();
  const worker = new Worker<T>(queueName, processor, {
    connection,
    concurrency: 5,
  });

  worker.on("completed", (job) => {
    log.debug({ queue: queueName, jobId: job.id }, "Job completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ queue: queueName, jobId: job?.id, error: err.message }, "Job failed");
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
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

export async function closeAll(): Promise<void> {
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}

export { Queue, Worker, type Job };
