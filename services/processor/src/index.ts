import { fileURLToPath } from "url";
import { resolve } from "path";
import {
  createBackgroundJobRecord,
  getDb,
  markBackgroundJobCompleted,
  markBackgroundJobDeadLettered,
  markBackgroundJobFailed,
  markBackgroundJobRunning,
  markBackgroundJobRetrying,
} from "@memecoin/database";
import { logger } from "@memecoin/logger";
import {
  ALERT_DELIVERY_QUEUE,
  createAlertDeliveryQueue,
  createWorker,
  RAW_EVENT_PROCESSING_QUEUE,
  type RawEventProcessingJobData,
} from "@memecoin/queue";
import {
  createRawEventProcessorRepository,
  processPendingRawEvents,
} from "./raw-event-processor.js";

const log = logger("processor");
const DEFAULT_BATCH_SIZE = 25;

async function runProcessorPass(jobData?: RawEventProcessingJobData) {
  const repository = createRawEventProcessorRepository();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const alertQueue = createAlertDeliveryQueue();
  const result = await processPendingRawEvents({
    appUrl,
    limit: jobData?.limit ?? DEFAULT_BATCH_SIZE,
    repository,
  });

  if (result.processed > 0) {
    const deliveryJob = await alertQueue.add("deliver-pending-alerts", {
      eventId: jobData?.eventId,
      limit: DEFAULT_BATCH_SIZE,
      trigger: "processor",
    });
    await createBackgroundJobRecord(getDb(), {
      queueName: ALERT_DELIVERY_QUEUE,
      jobType: "deliver-pending-alerts",
      bullJobId: deliveryJob.id ? String(deliveryJob.id) : null,
      payload: {
        eventId: jobData?.eventId ?? null,
        limit: DEFAULT_BATCH_SIZE,
        trigger: "processor",
      },
    });

    log.info(
      {
        eventId: jobData?.eventId,
        processed: result.processed,
        failed: result.failed,
        deliveryJobId: deliveryJob.id ? String(deliveryJob.id) : null,
      },
      "Processor pass complete and alert delivery queued",
    );
  } else if (result.failed > 0) {
    log.warn({ eventId: jobData?.eventId, failed: result.failed }, "Processor pass completed with failures");
  }

  return result;
}

export async function runProcessorService() {
  createWorker<RawEventProcessingJobData>(RAW_EVENT_PROCESSING_QUEUE, async (job) => {
    const bullJobId = job.id ? String(job.id) : null;
    const db = getDb();

    if (bullJobId) {
      await markBackgroundJobRunning(db, RAW_EVENT_PROCESSING_QUEUE, bullJobId);
    }

    try {
      const result = await runProcessorPass(job.data);
      if (bullJobId) {
        await markBackgroundJobCompleted(db, RAW_EVENT_PROCESSING_QUEUE, bullJobId, {
          processed: result.processed,
          failed: result.failed,
        });
      }
    } catch (error) {
      if (bullJobId) {
        const attempts = job.opts.attempts ?? 1;
        const terminalFailure = job.attemptsMade + 1 >= attempts;
        if (terminalFailure) {
          await markBackgroundJobFailed(db, RAW_EVENT_PROCESSING_QUEUE, bullJobId, error);
        } else {
          await markBackgroundJobRetrying(db, RAW_EVENT_PROCESSING_QUEUE, bullJobId, error);
        }
      }
      throw error;
    }
  }, {
    onTerminalFailure: async (job, error) => {
      const bullJobId = job.id ? String(job.id) : null;
      if (!bullJobId) return;
      await markBackgroundJobDeadLettered(getDb(), RAW_EVENT_PROCESSING_QUEUE, bullJobId, error);
    },
  });

  log.info(
    {
      queue: RAW_EVENT_PROCESSING_QUEUE,
      downstreamQueue: ALERT_DELIVERY_QUEUE,
      batchSize: DEFAULT_BATCH_SIZE,
    },
    "Processor service started",
  );

  if (process.env.PROCESSOR_RUN_RECOVERY_PASS === "true") {
    const result = await runProcessorPass({
      limit: DEFAULT_BATCH_SIZE,
      trigger: "recovery",
    });

    if (result.processed > 0 || result.failed > 0) {
      log.info(result, "Processor recovery pass complete");
    }
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  runProcessorService().catch((error) => {
    log.error({ error }, "Processor service failed");
    process.exit(1);
  });
}

export {
  createRawEventProcessorRepository,
  processPendingRawEvents,
} from "./raw-event-processor.js";
