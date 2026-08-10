import { pgTable, text, timestamp, integer, numeric, jsonb, index } from "drizzle-orm/pg-core";
import { tokens } from "./tokens";

export const strategies = pgTable("strategies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  userId: text("user_id"),
  isActive: text("is_active").default("true").notNull(),
  currentVersion: text("current_version").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const strategyVersions = pgTable("strategy_versions", {
  id: text("id").primaryKey(),
  strategyId: text("strategy_id").notNull().references(() => strategies.id),
  version: text("version").notNull(),
  config: jsonb("config").notNull(),
  isActive: text("is_active").default("false").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
  strategyVersionLookupIdx: index("strategy_versions_strategy_version_idx").on(table.strategyId, table.version),
}));

export const signals = pgTable("signals", {
  id: text("id").primaryKey(),
  strategyId: text("strategy_id").notNull().references(() => strategies.id),
  tokenAddress: text("token_address").notNull(),
  tokenId: text("token_id").references(() => tokens.id),
  signalScore: integer("signal_score").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
  rulesetVersion: text("ruleset_version").notNull(),
  priority: text("priority").notNull(),
  metadata: jsonb("metadata").default("{}").notNull(),
  detectedAt: timestamp("detected_at", { mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
  tokenDetectedIdx: index("signals_token_detected_idx").on(table.tokenAddress, table.detectedAt),
  strategyDetectedIdx: index("signals_strategy_detected_idx").on(table.strategyId, table.detectedAt),
  detectedScoreIdx: index("signals_detected_score_idx").on(table.detectedAt, table.signalScore),
}));

export const signalFactors = pgTable("signal_factors", {
  id: text("id").primaryKey(),
  signalId: text("signal_id").notNull().references(() => signals.id, { onDelete: "cascade" }),
  factorName: text("factor_name").notNull(),
  factorType: text("factor_type").notNull(),
  rawValue: numeric("raw_value", { precision: 30, scale: 15 }),
  contribution: numeric("contribution", { precision: 10, scale: 4 }).notNull(),
  weight: numeric("weight", { precision: 5, scale: 4 }),
  details: jsonb("details").default("{}").notNull(),
}, (table) => ({
  signalIdx: index("signal_factors_signal_idx").on(table.signalId),
}));

export const alerts = pgTable("alerts", {
  id: text("id").primaryKey(),
  signalId: text("signal_id").notNull().references(() => signals.id),
  userId: text("user_id"),
  tokenAddress: text("token_address").notNull(),
  priority: text("priority").notNull(),
  strategyId: text("strategy_id").notNull().references(() => strategies.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  signalScore: integer("signal_score").notNull(),
  webDeepLink: text("web_deep_link"),
  telegramDeepLink: text("telegram_deep_link"),
  status: text("status").default("pending").notNull(),
  triggeredAt: timestamp("triggered_at", { mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
  statusTriggeredIdx: index("alerts_status_triggered_idx").on(table.status, table.triggeredAt),
  tokenTriggeredIdx: index("alerts_token_triggered_idx").on(table.tokenAddress, table.triggeredAt),
  strategyTriggeredIdx: index("alerts_strategy_triggered_idx").on(table.strategyId, table.triggeredAt),
}));

export const alertDeliveries = pgTable("alert_deliveries", {
  id: text("id").primaryKey(),
  alertId: text("alert_id").notNull().references(() => alerts.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  destination: text("destination").notNull(),
  status: text("status").default("pending").notNull(),
  messageId: text("message_id"),
  error: text("error"),
  deliveredAt: timestamp("delivered_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
  alertIdx: index("alert_deliveries_alert_idx").on(table.alertId),
}));

export const alertOutcomes = pgTable("alert_outcomes", {
  id: text("id").primaryKey(),
  alertId: text("alert_id").notNull().references(() => alerts.id),
  outcomeType: text("outcome_type").notNull(),
  outcomeValue: numeric("outcome_value", { precision: 30, scale: 15 }),
  recordedAt: timestamp("recorded_at", { mode: "date" }).defaultNow().notNull(),
  metadata: jsonb("metadata").default("{}").notNull(),
}, (table) => ({
  alertOutcomeIdx: index("alert_outcomes_alert_type_idx").on(table.alertId, table.outcomeType),
  recordedIdx: index("alert_outcomes_recorded_idx").on(table.recordedAt),
}));

export const alertReviews = pgTable("alert_reviews", {
  alertId: text("alert_id").primaryKey().references(() => alerts.id, { onDelete: "cascade" }),
  verdict: text("verdict").notNull(),
  notes: text("notes"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { mode: "date" }).defaultNow().notNull(),
});
