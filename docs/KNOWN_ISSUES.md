# Known Issues

## Foundation Phase (Phase 1)

### KI-001: No real blockchain data
**Severity**: Expected (Phase 1 scope)
**Description**: All blockchain data is mocked/development data. No real Solana events are ingested.
**Impact**: Cannot test with real token launches or wallet behavior.
**Resolution**: Phase 2 will implement real Solana RPC integration.
**Workaround**: Use `pnpm dev:ingest-sample` to demonstrate the pipeline with development data.

### KI-002: No real Telegram delivery
**Severity**: Low
**Description**: Telegram bot formats messages but does not deliver them (no bot token configured).
**Impact**: Cannot test actual Telegram notifications.
**Resolution**: Configure `TELEGRAM_BOT_TOKEN` to enable delivery.
**Workaround**: Alert messages are logged to structured output.

### KI-003: Trading terminal is non-functional
**Severity**: Expected (Phase 1 scope)
**Description**: Trading terminal UI exists but cannot execute trades.
**Impact**: Cannot test trading flows.
**Resolution**: Phase 3 will implement Jupiter integration and wallet connection.
**Workaround**: UI clearly labeled "Execution Unavailable".

### KI-004: Development auth mode
**Severity**: Low (development only)
**Description**: Authentication uses development mode (no external OAuth).
**Impact**: Not suitable for production use.
**Resolution**: Configure OAuth providers for production deployment.
**Workaround**: Dev mode is clearly isolated behind `ENABLE_DEV_AUTH=true` feature flag.

### KI-005: No wallet classification
**Severity**: Expected (Phase 1 scope)
**Description**: Wallets have labels but no real classification algorithms.
**Impact**: All wallets appear as "legitimate_trader" in development data.
**Resolution**: Phase 2 will implement bot/insider/bundler detection.

### KI-006: Single scoring ruleset
**Severity**: Expected (Phase 1 scope)
**Description**: Only one scoring ruleset (token-signal-v0.1.0) exists.
**Impact**: Cannot test multiple scoring strategies.
**Resolution**: Phase 2 will add configurable scoring rulesets.

## Architecture Limitations

### KI-010: No connection pooling optimization
**Severity**: Low
**Description**: PostgreSQL connection pooling not yet optimized for production load.
**Impact**: May have connection overhead under heavy load.
**Resolution**: Add PgBouncer or optimize Drizzle connection pool in Phase 2.

### KI-011: No Redis persistence
**Severity**: Low
**Description**: Redis data is not persisted to disk (default for development).
**Impact**: Redis data lost on restart.
**Resolution**: Enable Redis AOF persistence for production.

### KI-012: No rate limiting on ingestion
**Severity**: Medium
**Description**: Development ingestion endpoint has no rate limiting.
**Impact**: Could be abused in production if not disabled.
**Resolution**: Endpoint disabled in production via `ENABLE_DEV_INGESTION=false`.
**Mitigation**: Rate limiting framework exists, just not applied to dev endpoint.

## Performance Notes

### KI-020: No query optimization
**Severity**: Low (current data volume)
**Description**: Queries not yet optimized for large datasets.
**Impact**: May be slow with millions of records.
**Resolution**: Phase 2 will add query optimization and indexing review.

### KI-021: No caching layer
**Severity**: Low (current data volume)
**Description**: No application-level caching implemented.
**Impact**: Every request hits the database.
**Resolution**: Phase 2 will implement Redis caching for hot data.
