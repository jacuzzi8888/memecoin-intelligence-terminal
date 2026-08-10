import { fileURLToPath } from "url";
import { resolve } from "path";
import {
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
  createWorker,
  type AlertDeliveryJobData,
} from "@memecoin/queue";
import { createAlertsRepository, deliverPendingAlerts } from "./deliver-alerts.js";

const log = logger("alerts");
const DEFAULT_BATCH_SIZE = 25;

async function runAlertsPass(jobData?: AlertDeliveryJobData) {
  const repository = createAlertsRepository();
  const result = await deliverPendingAlerts({
    limit: jobData?.limit ?? DEFAULT_BATCH_SIZE,
    repository,
  });

  if (result.delivered > 0 || result.failed > 0) {
    log.info({ eventId: jobData?.eventId, ...result }, "Alerts pass complete");
  }

  return result;
}

export async function runAlertsService() {
  const worker = createWorker<AlertDeliveryJobData>(ALERT_DELIVERY_QUEUE, async (job) => {
    const bullJobId = job.id ? String(job.id) : null;
    const db = getDb();

    if (bullJobId) {
      await markBackgroundJobRunning(db, ALERT_DELIVERY_QUEUE, bullJobId);
    }

    try {
      const result = await runAlertsPass(job.data);
      if (bullJobId) {
        await markBackgroundJobCompleted(db, ALERT_DELIVERY_QUEUE, bullJobId, {
          delivered: result.delivered,
          failed: result.failed,
        });
      }
    } catch (error) {
      if (bullJobId) {
        const attempts = job.opts.attempts ?? 1;
        const terminalFailure = job.attemptsMade + 1 >= attempts;
        if (terminalFailure) {
          await markBackgroundJobFailed(db, ALERT_DELIVERY_QUEUE, bullJobId, error);
        } else {
          await markBackgroundJobRetrying(db, ALERT_DELIVERY_QUEUE, bullJobId, error);
        }
      }
      throw error;
    }
  }, {
    onTerminalFailure: async (job, error) => {
      const bullJobId = job.id ? String(job.id) : null;
      if (!bullJobId) return;
      await markBackgroundJobDeadLettered(getDb(), ALERT_DELIVERY_QUEUE, bullJobId, error);
    },
  });

  log.info(
    {
      queue: ALERT_DELIVERY_QUEUE,
      batchSize: DEFAULT_BATCH_SIZE,
    },
    "Alerts service started",
  );

  if (process.env.ALERTS_RUN_RECOVERY_PASS !== "false") {
    const result = await runAlertsPass({
      limit: DEFAULT_BATCH_SIZE,
      trigger: "recovery",
    });

    if (result.delivered > 0 || result.failed > 0) {
      log.info(result, "Alerts recovery pass complete");
    }
  }

  return worker;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  runAlertsService().catch((error) => {
    log.error({ error }, "Alerts service failed");
    process.exit(1);
  });
}

export { createAlertsRepository, deliverPendingAlerts } from "./deliver-alerts.js";
