INSERT INTO "strategies" ("id", "name", "description", "current_version", "is_active")
VALUES
  ('system-market-scan', 'Market Observation', 'All scored market observations; never emits alerts directly.', 'v0.2.0', 'false'),
  ('system-alpha-alert', 'Alpha Alert', 'High-confidence token signals with strong market evidence.', 'v0.1.0', 'true'),
  ('system-early-entry', 'Early Entry', 'Very recent token launches with a qualifying score.', 'v0.1.0', 'true')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "strategy_versions" ("id", "strategy_id", "version", "is_active", "config")
VALUES
  ('system-market-scan-v0.2.0', 'system-market-scan', 'v0.2.0', 'true', '{"alertThreshold":100,"cooldownMinutes":15,"conditions":[],"channels":[],"priority":"medium"}'),
  ('system-alpha-alert-v0.1.0', 'system-alpha-alert', 'v0.1.0', 'true', '{"alertThreshold":70,"cooldownMinutes":60,"priority":"high","channels":["web"],"conditions":[{"field":"token_score","operator":"gte","value":70,"weight":0.4},{"field":"qualified_wallet_count","operator":"gte","value":2,"weight":0.3},{"field":"liquidity_usd","operator":"gte","value":10000,"weight":0.15},{"field":"token_age_minutes","operator":"lt","value":60,"weight":0.15}]}'),
  ('system-early-entry-v0.1.0', 'system-early-entry', 'v0.1.0', 'true', '{"alertThreshold":60,"cooldownMinutes":30,"priority":"critical","channels":["web"],"conditions":[{"field":"token_age_minutes","operator":"lt","value":30,"weight":0.3},{"field":"qualified_wallet_count","operator":"gte","value":1,"weight":0.3},{"field":"token_score","operator":"gte","value":50,"weight":0.2},{"field":"risk_score","operator":"lt","value":50,"weight":0.2}]}')
ON CONFLICT ("id") DO NOTHING;
