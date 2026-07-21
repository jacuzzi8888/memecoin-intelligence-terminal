CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "linked_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_destinations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"destination" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority_min" text DEFAULT 'medium' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"bio" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferences" jsonb DEFAULT '{}' NOT NULL,
	"notification_prefs" jsonb DEFAULT '{}' NOT NULL,
	"display_prefs" jsonb DEFAULT '{}' NOT NULL,
	"trading_prefs" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"watchlist_id" text NOT NULL,
	"item_type" text NOT NULL,
	"item_address" text NOT NULL,
	"note" text,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"pool_address" text NOT NULL,
	"base_reserve" numeric(40, 20),
	"quote_reserve" numeric(40, 20),
	"liquidity_usd" numeric(30, 15),
	"volume_24h_usd" numeric(30, 15),
	"tx_count_24h" integer,
	"snapshot_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" text PRIMARY KEY NOT NULL,
	"token_address" text NOT NULL,
	"pool_address" text NOT NULL,
	"base_mint" text NOT NULL,
	"quote_mint" text NOT NULL,
	"dex_program" text NOT NULL,
	"liquidity_usd" numeric(30, 15),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "markets_pool_address_unique" UNIQUE("pool_address")
);
--> statement-breakpoint
CREATE TABLE "normalised_token_events" (
	"id" text PRIMARY KEY NOT NULL,
	"token_id" text,
	"token_address" text NOT NULL,
	"event_type" text NOT NULL,
	"event_subtype" text,
	"raw_event_id" text,
	"tx_signature" text,
	"slot" numeric(20, 0),
	"block_time" timestamp,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_provider_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"raw_json" jsonb NOT NULL,
	"tx_signature" text,
	"slot" numeric(20, 0),
	"block_time" timestamp,
	"processed_at" timestamp,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"ingest_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_launches" (
	"id" text PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"token_address" text NOT NULL,
	"deployer_address" text NOT NULL,
	"launched_at" timestamp NOT NULL,
	"initial_liquidity_usd" numeric(30, 15),
	"initial_price" numeric(30, 15),
	"launch_program" text,
	"tx_signature" text,
	"slot" numeric(20, 0),
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"token_address" text NOT NULL,
	"market_cap_usd" numeric(30, 15),
	"price_usd" numeric(30, 15),
	"volume_1h_usd" numeric(30, 15),
	"volume_24h_usd" numeric(30, 15),
	"liquidity_usd" numeric(30, 15),
	"holder_count" integer,
	"price_change_1h" numeric(10, 4),
	"price_change_24h" numeric(10, 4),
	"snapshot_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"decimals" integer DEFAULT 9 NOT NULL,
	"logo_url" text,
	"description" text,
	"website" text,
	"twitter" text,
	"telegram" text,
	"discord" text,
	"total_supply" numeric(40, 20),
	"is_verified" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "wallet_cohort_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"criteria" jsonb DEFAULT '{}' NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_cohort_definitions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "wallet_cohort_members" (
	"id" text PRIMARY KEY NOT NULL,
	"cohort_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "wallet_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"label" text NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"source" text NOT NULL,
	"ruleset_version" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_performance" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"ruleset_version" text NOT NULL,
	"total_pnl_usd" numeric(30, 15),
	"realized_pnl_usd" numeric(30, 15),
	"win_rate" numeric(10, 4),
	"total_trades" integer DEFAULT 0 NOT NULL,
	"profitable_trades" integer DEFAULT 0 NOT NULL,
	"avg_hold_time_seconds" integer,
	"avg_return_pct" numeric(10, 4),
	"score" integer,
	"calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"token_address" text NOT NULL,
	"amount" numeric(40, 20) NOT NULL,
	"avg_entry_price" numeric(30, 15),
	"current_value_usd" numeric(30, 15),
	"realized_pnl_usd" numeric(30, 15),
	"unrealized_pnl_usd" numeric(30, 15),
	"opened_at" timestamp NOT NULL,
	"closed_at" timestamp,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_a_id" text NOT NULL,
	"wallet_b_id" text NOT NULL,
	"relationship_type" text NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"evidence" jsonb DEFAULT '{}' NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_trades" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"token_address" text NOT NULL,
	"trade_type" text NOT NULL,
	"amount" numeric(40, 20) NOT NULL,
	"price_usd" numeric(30, 15),
	"value_usd" numeric(30, 15),
	"tx_signature" text,
	"slot" numeric(20, 0),
	"traded_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"label" text,
	"classification" text DEFAULT 'unknown' NOT NULL,
	"first_seen_at" timestamp,
	"last_seen_at" timestamp,
	"total_trades" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "alert_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"channel" text NOT NULL,
	"destination" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message_id" text,
	"error" text,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"outcome_type" text NOT NULL,
	"outcome_value" numeric(30, 15),
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"signal_id" text NOT NULL,
	"user_id" text,
	"token_address" text NOT NULL,
	"priority" text NOT NULL,
	"strategy_id" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"signal_score" integer NOT NULL,
	"web_deep_link" text,
	"telegram_deep_link" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"signal_id" text NOT NULL,
	"factor_name" text NOT NULL,
	"factor_type" text NOT NULL,
	"raw_value" numeric(30, 15),
	"contribution" numeric(10, 4) NOT NULL,
	"weight" numeric(5, 4),
	"details" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" text PRIMARY KEY NOT NULL,
	"strategy_id" text NOT NULL,
	"token_address" text NOT NULL,
	"token_id" text,
	"signal_score" integer NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"ruleset_version" text NOT NULL,
	"priority" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"user_id" text,
	"is_active" text DEFAULT 'true' NOT NULL,
	"current_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"strategy_id" text NOT NULL,
	"version" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"trade_intent_id" text,
	"attempt_number" integer NOT NULL,
	"tx_signature" text,
	"status" text NOT NULL,
	"error" text,
	"blockhash" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "quote_records" (
	"id" text PRIMARY KEY NOT NULL,
	"trade_intent_id" text,
	"provider" text NOT NULL,
	"input_mint" text NOT NULL,
	"output_mint" text NOT NULL,
	"input_amount" numeric(40, 20) NOT NULL,
	"expected_output" numeric(40, 20) NOT NULL,
	"minimum_output" numeric(40, 20) NOT NULL,
	"price_impact_pct" numeric(10, 4),
	"route_plan" jsonb DEFAULT '[]' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulated_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"trade_intent_id" text,
	"quote_id" text,
	"success" text NOT NULL,
	"expected_output" numeric(40, 20),
	"actual_output" numeric(40, 20),
	"fees" numeric(30, 15),
	"error" text,
	"simulated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"trading_account_id" text,
	"user_id" text NOT NULL,
	"token_address" text NOT NULL,
	"trade_type" text NOT NULL,
	"amount" numeric(40, 20) NOT NULL,
	"amount_type" text NOT NULL,
	"slippage_bps" integer NOT NULL,
	"priority_fee_lamports" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"label" text,
	"is_primary" text DEFAULT 'false' NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_records" (
	"id" text PRIMARY KEY NOT NULL,
	"trade_intent_id" text,
	"tx_signature" text NOT NULL,
	"status" text NOT NULL,
	"slot" numeric(20, 0),
	"block_time" timestamp,
	"fee" numeric(30, 15),
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_records_tx_signature_unique" UNIQUE("tx_signature")
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"queue_name" text NOT NULL,
	"job_type" text NOT NULL,
	"bull_job_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"last_health_check" timestamp,
	"health_status" text DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "data_providers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "feature_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"feature_name" text NOT NULL,
	"version" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"checkpoint_type" text NOT NULL,
	"last_slot" numeric(20, 0),
	"last_timestamp" timestamp,
	"last_cursor" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_failures" (
	"id" text PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"raw_event_id" text,
	"entity_type" text,
	"entity_id" text,
	"error" text NOT NULL,
	"stack_trace" text,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"is_resolved" text DEFAULT 'false' NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_wallets" ADD CONSTRAINT "linked_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_destinations" ADD CONSTRAINT "notification_destinations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalised_token_events" ADD CONSTRAINT "normalised_token_events_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalised_token_events" ADD CONSTRAINT "normalised_token_events_raw_event_id_raw_provider_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_provider_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_launches" ADD CONSTRAINT "token_launches_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_snapshots" ADD CONSTRAINT "token_snapshots_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_cohort_members" ADD CONSTRAINT "wallet_cohort_members_cohort_id_wallet_cohort_definitions_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."wallet_cohort_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_cohort_members" ADD CONSTRAINT "wallet_cohort_members_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_labels" ADD CONSTRAINT "wallet_labels_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_performance" ADD CONSTRAINT "wallet_performance_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_positions" ADD CONSTRAINT "wallet_positions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_relationships" ADD CONSTRAINT "wallet_relationships_wallet_a_id_wallets_id_fk" FOREIGN KEY ("wallet_a_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_relationships" ADD CONSTRAINT "wallet_relationships_wallet_b_id_wallets_id_fk" FOREIGN KEY ("wallet_b_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_trades" ADD CONSTRAINT "wallet_trades_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_outcomes" ADD CONSTRAINT "alert_outcomes_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_factors" ADD CONSTRAINT "signal_factors_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_trade_intent_id_trade_intents_id_fk" FOREIGN KEY ("trade_intent_id") REFERENCES "public"."trade_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_records" ADD CONSTRAINT "quote_records_trade_intent_id_trade_intents_id_fk" FOREIGN KEY ("trade_intent_id") REFERENCES "public"."trade_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_orders" ADD CONSTRAINT "simulated_orders_trade_intent_id_trade_intents_id_fk" FOREIGN KEY ("trade_intent_id") REFERENCES "public"."trade_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulated_orders" ADD CONSTRAINT "simulated_orders_quote_id_quote_records_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_intents" ADD CONSTRAINT "trade_intents_trading_account_id_trading_accounts_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_records" ADD CONSTRAINT "transaction_records_trade_intent_id_trade_intents_id_fk" FOREIGN KEY ("trade_intent_id") REFERENCES "public"."trade_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_checkpoints" ADD CONSTRAINT "ingestion_checkpoints_provider_id_data_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."data_providers"("id") ON DELETE no action ON UPDATE no action;