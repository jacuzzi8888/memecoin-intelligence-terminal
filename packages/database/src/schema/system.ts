import { pgTable, text, timestamp, jsonb, integer, numeric } from "drizzle-orm/pg-core";

export const dataProviders = pgTable("data_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type").notNull(),
  config: jsonb("config").default("{}").notNull(),
  isActive: text("is_active").default("true").notNull(),
  lastHealthCheck: timestamp("last_health_check", { mode: "date" }),
  healthStatus: text("health_status").default("unknown").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const ingestionCheckpoints = pgTable("ingestion_checkpoints", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => dataProviders.id),
  checkpointType: text("checkpoint_type").notNull(),
  lastSlot: numeric("last_slot", { precision: 20, scale: 0 }),
  lastTimestamp: timestamp("last_timestamp", { mode: "date" }),
  lastCursor: text("last_cursor"),
  metadata: jsonb("metadata").default("{}").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const backgroundJobs = pgTable("background_jobs", {
  id: text("id").primaryKey(),
  queueName: text("queue_name").notNull(),
  jobType: text("job_type").notNull(),
  bullJobId: text("bull_job_id"),
  status: text("status").default("pending").notNull(),
  payload: jsonb("payload").default("{}").notNull(),
  result: jsonb("result"),
  error: text("error"),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const processingFailures = pgTable("processing_failures", {
  id: text("id").primaryKey(),
  stage: text("stage").notNull(),
  rawEventId: text("raw_event_id"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  error: text("error").notNull(),
  stackTrace: text("stack_trace"),
  payload: jsonb("payload").default("{}").notNull(),
  retryCount: integer("retry_count").default(0).notNull(),
  isResolved: text("is_resolved").default("false").notNull(),
  resolvedAt: timestamp("resolved_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const featureVersions = pgTable("feature_versions", {
  id: text("id").primaryKey(),
  featureName: text("feature_name").notNull(),
  version: text("version").notNull(),
  description: text("description"),
  config: jsonb("config").default("{}").notNull(),
  isActive: text("is_active").default("true").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});
