import { pgTable, text, timestamp, integer, numeric, jsonb, boolean, index } from "drizzle-orm/pg-core";

export const tokens = pgTable("tokens", {
  id: text("id").primaryKey(),
  address: text("address").notNull().unique(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  decimals: integer("decimals").default(9).notNull(),
  logoUrl: text("logo_url"),
  description: text("description"),
  website: text("website"),
  twitter: text("twitter"),
  telegram: text("telegram"),
  discord: text("discord"),
  totalSupply: numeric("total_supply", { precision: 40, scale: 20 }),
  isVerified: boolean("is_verified").default(false).notNull(),
  firstSeenAt: timestamp("first_seen_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const tokenLaunches = pgTable("token_launches", {
  id: text("id").primaryKey(),
  tokenId: text("token_id").notNull().references(() => tokens.id),
  tokenAddress: text("token_address").notNull(),
  deployerAddress: text("deployer_address").notNull(),
  launchedAt: timestamp("launched_at", { mode: "date" }).notNull(),
  initialLiquidityUsd: numeric("initial_liquidity_usd", { precision: 30, scale: 15 }),
  initialPrice: numeric("initial_price", { precision: 30, scale: 15 }),
  launchProgram: text("launch_program"),
  txSignature: text("tx_signature"),
  slot: numeric("slot", { precision: 20, scale: 0 }),
  metadata: jsonb("metadata").default("{}").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
  tokenLaunchedIdx: index("token_launches_token_launched_idx").on(table.tokenAddress, table.launchedAt),
}));

export const markets = pgTable("markets", {
  id: text("id").primaryKey(),
  tokenAddress: text("token_address").notNull(),
  poolAddress: text("pool_address").notNull().unique(),
  baseMint: text("base_mint").notNull(),
  quoteMint: text("quote_mint").notNull(),
  dexProgram: text("dex_program").notNull(),
  liquidityUsd: numeric("liquidity_usd", { precision: 30, scale: 15 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const tokenSnapshots = pgTable("token_snapshots", {
  id: text("id").primaryKey(),
  tokenId: text("token_id").notNull().references(() => tokens.id),
  tokenAddress: text("token_address").notNull(),
  marketCapUsd: numeric("market_cap_usd", { precision: 30, scale: 15 }),
  priceUsd: numeric("price_usd", { precision: 30, scale: 15 }),
  volume1hUsd: numeric("volume_1h_usd", { precision: 30, scale: 15 }),
  volume24hUsd: numeric("volume_24h_usd", { precision: 30, scale: 15 }),
  liquidityUsd: numeric("liquidity_usd", { precision: 30, scale: 15 }),
  holderCount: integer("holder_count"),
  walletCount: integer("wallet_count"),
  qualifiedWalletCount: integer("qualified_wallet_count"),
  cohortEntryCount: integer("cohort_entry_count"),
  cohortQualityScore: numeric("cohort_quality_score", { precision: 10, scale: 4 }),
  walletEvidenceAvailable: boolean("wallet_evidence_available").default(false).notNull(),
  walletEvidenceSource: text("wallet_evidence_source"),
  priceChange1h: numeric("price_change_1h", { precision: 10, scale: 4 }),
  priceChange24h: numeric("price_change_24h", { precision: 10, scale: 4 }),
  snapshotAt: timestamp("snapshot_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
  tokenSnapshotIdx: index("token_snapshots_token_snapshot_idx").on(table.tokenAddress, table.snapshotAt),
  snapshotLiquidityIdx: index("token_snapshots_snapshot_liquidity_idx").on(table.snapshotAt, table.liquidityUsd),
}));

export const tokenHolderSnapshots = pgTable("token_holder_snapshots", {
  id: text("id").primaryKey(),
  tokenId: text("token_id").notNull().references(() => tokens.id, { onDelete: "cascade" }),
  tokenAddress: text("token_address").notNull(),
  walletId: text("wallet_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  rank: integer("rank").notNull(),
  balance: numeric("balance", { precision: 78, scale: 0 }).notNull(),
  percentage: numeric("percentage", { precision: 12, scale: 6 }),
  source: text("source").notNull(),
  snapshotAt: timestamp("snapshot_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
  tokenHolderSnapshotIdx: index("token_holder_snapshots_token_snapshot_idx").on(
    table.tokenAddress,
    table.snapshotAt,
  ),
  holderWalletSnapshotIdx: index("token_holder_snapshots_wallet_snapshot_idx").on(
    table.walletAddress,
    table.snapshotAt,
  ),
}));

export const marketSnapshots = pgTable("market_snapshots", {
  id: text("id").primaryKey(),
  marketId: text("market_id").notNull().references(() => markets.id),
  poolAddress: text("pool_address").notNull(),
  baseReserve: numeric("base_reserve", { precision: 40, scale: 20 }),
  quoteReserve: numeric("quote_reserve", { precision: 40, scale: 20 }),
  liquidityUsd: numeric("liquidity_usd", { precision: 30, scale: 15 }),
  volume24hUsd: numeric("volume_24h_usd", { precision: 30, scale: 15 }),
  txCount24h: integer("tx_count_24h"),
  snapshotAt: timestamp("snapshot_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const rawProviderEvents = pgTable("raw_provider_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  eventType: text("event_type").notNull(),
  rawJson: jsonb("raw_json").notNull(),
  txSignature: text("tx_signature"),
  slot: numeric("slot", { precision: 20, scale: 0 }),
  blockTime: timestamp("block_time", { mode: "date" }),
  processedAt: timestamp("processed_at", { mode: "date" }),
  processingStatus: text("processing_status").default("pending").notNull(),
  ingestAt: timestamp("ingest_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
  processingStatusIdx: index("raw_provider_events_status_ingest_idx").on(table.processingStatus, table.ingestAt),
}));

export const normalisedTokenEvents = pgTable("normalised_token_events", {
  id: text("id").primaryKey(),
  tokenId: text("token_id").references(() => tokens.id),
  tokenAddress: text("token_address").notNull(),
  eventType: text("event_type").notNull(),
  eventSubtype: text("event_subtype"),
  rawEventId: text("raw_event_id").references(() => rawProviderEvents.id),
  txSignature: text("tx_signature"),
  slot: numeric("slot", { precision: 20, scale: 0 }),
  blockTime: timestamp("block_time", { mode: "date" }),
  metadata: jsonb("metadata").default("{}").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});
