import { pgTable, text, timestamp, numeric, jsonb, integer } from "drizzle-orm/pg-core";

export const tradingAccounts = pgTable("trading_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  label: text("label"),
  isPrimary: text("is_primary").default("false").notNull(),
  connectedAt: timestamp("connected_at", { mode: "date" }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const tradeIntents = pgTable("trade_intents", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id").references(() => tradingAccounts.id),
  userId: text("user_id").notNull(),
  tokenAddress: text("token_address").notNull(),
  tradeType: text("trade_type").notNull(),
  amount: numeric("amount", { precision: 40, scale: 20 }).notNull(),
  amountType: text("amount_type").notNull(),
  slippageBps: integer("slippage_bps").notNull(),
  priorityFeeLamports: integer("priority_fee_lamports"),
  status: text("status").default("pending").notNull(),
  metadata: jsonb("metadata").default("{}").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const quoteRecords = pgTable("quote_records", {
  id: text("id").primaryKey(),
  tradeIntentId: text("trade_intent_id").references(() => tradeIntents.id),
  provider: text("provider").notNull(),
  inputMint: text("input_mint").notNull(),
  outputMint: text("output_mint").notNull(),
  inputAmount: numeric("input_amount", { precision: 40, scale: 20 }).notNull(),
  expectedOutput: numeric("expected_output", { precision: 40, scale: 20 }).notNull(),
  minimumOutput: numeric("minimum_output", { precision: 40, scale: 20 }).notNull(),
  priceImpactPct: numeric("price_impact_pct", { precision: 10, scale: 4 }),
  routePlan: jsonb("route_plan").default("[]").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const simulatedOrders = pgTable("simulated_orders", {
  id: text("id").primaryKey(),
  tradeIntentId: text("trade_intent_id").references(() => tradeIntents.id),
  quoteId: text("quote_id").references(() => quoteRecords.id),
  success: text("success").notNull(),
  expectedOutput: numeric("expected_output", { precision: 40, scale: 20 }),
  actualOutput: numeric("actual_output", { precision: 40, scale: 20 }),
  fees: numeric("fees", { precision: 30, scale: 15 }),
  error: text("error"),
  simulatedAt: timestamp("simulated_at", { mode: "date" }).defaultNow().notNull(),
});

export const executionAttempts = pgTable("execution_attempts", {
  id: text("id").primaryKey(),
  tradeIntentId: text("trade_intent_id").references(() => tradeIntents.id),
  attemptNumber: integer("attempt_number").notNull(),
  txSignature: text("tx_signature"),
  status: text("status").notNull(),
  error: text("error"),
  blockhash: text("blockhash"),
  submittedAt: timestamp("submitted_at", { mode: "date" }).defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at", { mode: "date" }),
});

export const transactionRecords = pgTable("transaction_records", {
  id: text("id").primaryKey(),
  tradeIntentId: text("trade_intent_id").references(() => tradeIntents.id),
  txSignature: text("tx_signature").notNull().unique(),
  status: text("status").notNull(),
  slot: numeric("slot", { precision: 20, scale: 0 }),
  blockTime: timestamp("block_time", { mode: "date" }),
  fee: numeric("fee", { precision: 30, scale: 15 }),
  metadata: jsonb("metadata").default("{}").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});
