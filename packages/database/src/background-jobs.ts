import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import * as schema from "./schema/index.js";

export interface BackgroundJobCreateInput {
  queueName: string;
  jobType: string;
  bullJobId: string | null;
  payload: Record<string, unknown>;
  maxAttempts?: number;
}

export async function createBackgroundJobRecord(
  db: Database,
  input: BackgroundJobCreateInput,
) {
  const id = randomUUID();

  await db.insert(schema.backgroundJobs).values({
    id,
    queueName: input.queueName,
    jobType: input.jobType,
    bullJobId: input.bullJobId,
    status: "pending",
    payload: input.payload,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
  });

  return id;
}

export async function markBackgroundJobRunning(
  db: Database,
  queueName: string,
  bullJobId: string,
) {
  const rows = await db.select({
    id: schema.backgroundJobs.id,
    attempts: schema.backgroundJobs.attempts,
  })
    .from(schema.backgroundJobs)
    .where(and(
      eq(schema.backgroundJobs.queueName, queueName),
      eq(schema.backgroundJobs.bullJobId, bullJobId),
    ))
    .limit(1);

  const job = rows[0];
  if (!job) return;

  await db.update(schema.backgroundJobs)
    .set({
      status: "running",
      attempts: (job.attempts ?? 0) + 1,
      startedAt: new Date(),
      error: null,
    })
    .where(eq(schema.backgroundJobs.id, job.id));
}

export async function markBackgroundJobCompleted(
  db: Database,
  queueName: string,
  bullJobId: string,
  result: Record<string, unknown>,
) {
  await db.update(schema.backgroundJobs)
    .set({
      status: "completed",
      result,
      completedAt: new Date(),
      error: null,
    })
    .where(and(
      eq(schema.backgroundJobs.queueName, queueName),
      eq(schema.backgroundJobs.bullJobId, bullJobId),
    ));
}

export async function markBackgroundJobRetrying(
  db: Database,
  queueName: string,
  bullJobId: string,
  error: unknown,
) {
  await db.update(schema.backgroundJobs)
    .set({
      status: "retrying",
      error: error instanceof Error ? error.message : String(error),
      completedAt: null,
    })
    .where(and(
      eq(schema.backgroundJobs.queueName, queueName),
      eq(schema.backgroundJobs.bullJobId, bullJobId),
    ));
}

export async function markBackgroundJobFailed(
  db: Database,
  queueName: string,
  bullJobId: string,
  error: unknown,
) {
  await db.update(schema.backgroundJobs)
    .set({
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date(),
    })
    .where(and(
      eq(schema.backgroundJobs.queueName, queueName),
      eq(schema.backgroundJobs.bullJobId, bullJobId),
    ));
}

export async function markBackgroundJobDeadLettered(
  db: Database,
  queueName: string,
  bullJobId: string,
  error: unknown,
) {
  await db.update(schema.backgroundJobs)
    .set({
      status: "dead_lettered",
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date(),
    })
    .where(and(
      eq(schema.backgroundJobs.queueName, queueName),
      eq(schema.backgroundJobs.bullJobId, bullJobId),
    ));
}
