import { pgTable, text, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";

export const wallets = pgTable("wallets", {
  id: text("id").primaryKey(),
  address: text("address").notNull().unique(),
  label: text("label"),
  classification: text("classification").default("unknown").notNull(),
  firstSeenAt: timestamp("first_seen_at", { mode: "date" }),
  lastSeenAt: timestamp("last_seen_at", { mode: "date" }),
  totalTrades: integer("total_trades").default(0).notNull(),
  metadata: jsonb("metadata").default("{}").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const walletLabels = pgTable("wallet_labels", {
  id: text("id").primaryKey(),
  walletId: text("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address").notNull(),
  label: text("label").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
  source: text("source").notNull(),
  rulesetVersion: text("ruleset_version").notNull(),
  assignedAt: timestamp("assigned_at", { mode: "date" }).defaultNow().notNull(),
});

export const walletTrades = pgTable("wallet_trades", {
  id: text("id").primaryKey(),
  walletId: text("wallet_id").notNull().references(() => wallets.id),
  walletAddress: text("wallet_address").notNull(),
  tokenAddress: text("token_address").notNull(),
  tradeType: text("trade_type").notNull(),
  amount: numeric("amount", { precision: 40, scale: 20 }).notNull(),
  priceUsd: numeric("price_usd", { precision: 30, scale: 15 }),
  valueUsd: numeric("value_usd", { precision: 30, scale: 15 }),
  txSignature: text("tx_signature"),
  slot: numeric("slot", { precision: 20, scale: 0 }),
  tradedAt: timestamp("traded_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const walletPositions = pgTable("wallet_positions", {
  id: text("id").primaryKey(),
  walletId: text("wallet_id").notNull().references(() => wallets.id),
  walletAddress: text("wallet_address").notNull(),
  tokenAddress: text("token_address").notNull(),
  amount: numeric("amount", { precision: 40, scale: 20 }).notNull(),
  avgEntryPrice: numeric("avg_entry_price", { precision: 30, scale: 15 }),
  currentValueUsd: numeric("current_value_usd", { precision: 30, scale: 15 }),
  realizedPnlUsd: numeric("realized_pnl_usd", { precision: 30, scale: 15 }),
  unrealizedPnlUsd: numeric("unrealized_pnl_usd", { precision: 30, scale: 15 }),
  openedAt: timestamp("opened_at", { mode: "date" }).notNull(),
  closedAt: timestamp("closed_at", { mode: "date" }),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const walletPerformance = pgTable("wallet_performance", {
  id: text("id").primaryKey(),
  walletId: text("wallet_id").notNull().references(() => wallets.id),
  walletAddress: text("wallet_address").notNull(),
  rulesetVersion: text("ruleset_version").notNull(),
  totalPnlUsd: numeric("total_pnl_usd", { precision: 30, scale: 15 }),
  realizedPnlUsd: numeric("realized_pnl_usd", { precision: 30, scale: 15 }),
  winRate: numeric("win_rate", { precision: 10, scale: 4 }),
  totalTrades: integer("total_trades").default(0).notNull(),
  profitableTrades: integer("profitable_trades").default(0).notNull(),
  avgHoldTimeSeconds: integer("avg_hold_time_seconds"),
  avgReturnPct: numeric("avg_return_pct", { precision: 10, scale: 4 }),
  score: integer("score"),
  calculatedAt: timestamp("calculated_at", { mode: "date" }).defaultNow().notNull(),
});

export const walletRelationships = pgTable("wallet_relationships", {
  id: text("id").primaryKey(),
  walletAId: text("wallet_a_id").notNull().references(() => wallets.id),
  walletBId: text("wallet_b_id").notNull().references(() => wallets.id),
  relationshipType: text("relationship_type").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
  evidence: jsonb("evidence").default("{}").notNull(),
  detectedAt: timestamp("detected_at", { mode: "date" }).defaultNow().notNull(),
});

export const walletCohortDefinitions = pgTable("wallet_cohort_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  criteria: jsonb("criteria").default("{}").notNull(),
  memberCount: integer("member_count").default(0).notNull(),
  isActive: text("is_active").default("true").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const walletCohortMembers = pgTable("wallet_cohort_members", {
  id: text("id").primaryKey(),
  cohortId: text("cohort_id").notNull().references(() => walletCohortDefinitions.id, { onDelete: "cascade" }),
  walletId: text("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address").notNull(),
  joinedAt: timestamp("joined_at", { mode: "date" }).defaultNow().notNull(),
  leftAt: timestamp("left_at", { mode: "date" }),
});
