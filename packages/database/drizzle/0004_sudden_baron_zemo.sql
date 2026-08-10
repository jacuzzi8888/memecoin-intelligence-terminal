CREATE INDEX "raw_provider_events_status_ingest_idx" ON "raw_provider_events" USING btree ("processing_status","ingest_at");--> statement-breakpoint
CREATE INDEX "token_launches_token_launched_idx" ON "token_launches" USING btree ("token_address","launched_at");--> statement-breakpoint
CREATE INDEX "token_snapshots_token_snapshot_idx" ON "token_snapshots" USING btree ("token_address","snapshot_at");--> statement-breakpoint
CREATE INDEX "token_snapshots_snapshot_liquidity_idx" ON "token_snapshots" USING btree ("snapshot_at","liquidity_usd");--> statement-breakpoint
CREATE INDEX "wallet_cohort_members_cohort_wallet_idx" ON "wallet_cohort_members" USING btree ("cohort_id","wallet_id");--> statement-breakpoint
CREATE INDEX "wallet_labels_wallet_assigned_idx" ON "wallet_labels" USING btree ("wallet_id","assigned_at");--> statement-breakpoint
CREATE INDEX "wallet_performance_wallet_calculated_idx" ON "wallet_performance" USING btree ("wallet_id","calculated_at");--> statement-breakpoint
CREATE INDEX "wallet_trades_token_traded_idx" ON "wallet_trades" USING btree ("token_address","traded_at");--> statement-breakpoint
CREATE INDEX "wallet_trades_wallet_traded_idx" ON "wallet_trades" USING btree ("wallet_id","traded_at");--> statement-breakpoint
CREATE INDEX "alert_deliveries_alert_idx" ON "alert_deliveries" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "alert_outcomes_alert_type_idx" ON "alert_outcomes" USING btree ("alert_id","outcome_type");--> statement-breakpoint
CREATE INDEX "alert_outcomes_recorded_idx" ON "alert_outcomes" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "alerts_status_triggered_idx" ON "alerts" USING btree ("status","triggered_at");--> statement-breakpoint
CREATE INDEX "alerts_token_triggered_idx" ON "alerts" USING btree ("token_address","triggered_at");--> statement-breakpoint
CREATE INDEX "alerts_strategy_triggered_idx" ON "alerts" USING btree ("strategy_id","triggered_at");--> statement-breakpoint
CREATE INDEX "signal_factors_signal_idx" ON "signal_factors" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "signals_token_detected_idx" ON "signals" USING btree ("token_address","detected_at");--> statement-breakpoint
CREATE INDEX "signals_strategy_detected_idx" ON "signals" USING btree ("strategy_id","detected_at");--> statement-breakpoint
CREATE INDEX "signals_detected_score_idx" ON "signals" USING btree ("detected_at","signal_score");--> statement-breakpoint
CREATE INDEX "strategy_versions_strategy_version_idx" ON "strategy_versions" USING btree ("strategy_id","version");--> statement-breakpoint
INSERT INTO "strategies" ("id", "name", "description", "current_version", "is_active")
VALUES ('system-market-scan', 'Market Observation', 'All scored market observations; never emits alerts directly.', 'v0.2.0', 'false')
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "current_version" = EXCLUDED."current_version",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = now();--> statement-breakpoint
INSERT INTO "strategy_versions" ("id", "strategy_id", "version", "is_active", "config")
VALUES ('system-market-scan-v0.2.0', 'system-market-scan', 'v0.2.0', 'true', '{"alertThreshold":100,"cooldownMinutes":15,"conditions":[],"channels":[],"priority":"medium"}')
ON CONFLICT ("id") DO UPDATE SET "config" = EXCLUDED."config", "is_active" = 'true';--> statement-breakpoint
UPDATE "strategy_versions" AS version
SET "config" = '{"alertThreshold":70,"cooldownMinutes":60,"priority":"high","channels":["web"],"conditions":[{"field":"token_score","operator":"gte","value":70,"weight":0.4},{"field":"qualified_wallet_count","operator":"gte","value":2,"weight":0.3},{"field":"liquidity_usd","operator":"gte","value":10000,"weight":0.15},{"field":"token_age_minutes","operator":"lt","value":60,"weight":0.15}]}'
FROM "strategies" AS strategy
WHERE version."strategy_id" = strategy."id"
  AND version."version" = strategy."current_version"
  AND strategy."name" = 'Alpha Alert';--> statement-breakpoint
UPDATE "strategy_versions" AS version
SET "config" = '{"alertThreshold":60,"cooldownMinutes":30,"priority":"critical","channels":["web"],"conditions":[{"field":"token_age_minutes","operator":"lt","value":30,"weight":0.3},{"field":"qualified_wallet_count","operator":"gte","value":1,"weight":0.3},{"field":"token_score","operator":"gte","value":50,"weight":0.2},{"field":"risk_score","operator":"lt","value":50,"weight":0.2}]}'
FROM "strategies" AS strategy
WHERE version."strategy_id" = strategy."id"
  AND version."version" = strategy."current_version"
  AND strategy."name" = 'Early Entry';--> statement-breakpoint
UPDATE "alerts" AS alert
SET "status" = 'superseded'
FROM "signals" AS signal
WHERE alert."signal_id" = signal."id"
  AND alert."status" = 'pending'
  AND NOT (signal."metadata" ? 'strategyEvaluation');
