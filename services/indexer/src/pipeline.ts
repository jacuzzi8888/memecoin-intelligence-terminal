import { randomUUID } from "crypto";
import { createBackgroundJobRecord, getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { logger } from "@memecoin/logger";
import { createRawEventProcessingQueue, RAW_EVENT_PROCESSING_QUEUE } from "@memecoin/queue";

const log = logger("indexer");

export interface RawTokenEvent {
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  deployer: string;
  initialLiquidity: number;
  timestamp: string;
}

export interface RawTokenEventSourceOptions {
  provider?: string;
  txSignature?: string;
}

export interface IngestionPipelineResult {
  eventId: string;
  processing: {
    mode: "queue";
    queued: number;
    jobId: string | null;
    processed: number;
    failed: number;
  };
  delivery: {
    mode: "queue";
    queued: number;
    jobId: string | null;
    delivered: number;
    failed: number;
  };
}

export async function ingestRawTokenEvent(
  event: RawTokenEvent,
  options: RawTokenEventSourceOptions = {},
): Promise<string> {
  const db = getDb();
  const eventId = randomUUID();
  const provider = options.provider || "development";

  log.info({ eventId, tokenAddress: event.tokenAddress }, "Ingesting raw token event");

  await db.insert(schema.rawProviderEvents).values({
    id: eventId,
    provider,
    eventType: "token_launch",
    rawJson: event as unknown as Record<string, unknown>,
    txSignature: options.txSignature || `dev-tx-${eventId.slice(0, 8)}`,
    processingStatus: "pending",
  });

  log.info({ eventId }, "Raw token event stored");
  return eventId;
}

export async function runIngestionPipeline(
  event: RawTokenEvent,
  options: RawTokenEventSourceOptions = {},
): Promise<IngestionPipelineResult> {
  const eventId = await ingestRawTokenEvent(event, options);
  const db = getDb();
  const processingQueue = createRawEventProcessingQueue();
  const processingJob = await processingQueue.add("process-pending-raw-events", {
    eventId,
    limit: 25,
    trigger: "ingest",
  });
  await createBackgroundJobRecord(db, {
    queueName: RAW_EVENT_PROCESSING_QUEUE,
    jobType: "process-pending-raw-events",
    bullJobId: processingJob.id ? String(processingJob.id) : null,
    payload: { eventId, limit: 25, trigger: "ingest" },
  });

  const result = {
    eventId,
    processing: {
      mode: "queue" as const,
      queued: 1,
      jobId: processingJob.id ? String(processingJob.id) : null,
      processed: 0,
      failed: 0,
    },
    delivery: {
      mode: "queue" as const,
      queued: 0,
      jobId: null,
      delivered: 0,
      failed: 0,
    },
  };

  log.info({ eventId, processingJobId: result.processing.jobId }, "Ingestion pipeline queued");
  return result;
}
