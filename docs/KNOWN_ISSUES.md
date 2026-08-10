# Known Issues

## Open

### KI-001: Workspace fixes are not deployed yet
**Severity**: High
The migration, write key, worker embedding, 15-second polling, corrected strategy behavior, and UI changes exist in the workspace only. Production remains on the previous release until an approved rollout is performed.

### KI-002: Launch coverage is not a complete Solana firehose
**Severity**: High
DexScreener profiles and boosts are useful current discovery feeds, but they do not represent every token launched. Helius stream reliability and exact launch coverage still need production measurement. A 15-second loop improves freshness, not source completeness.

### KI-003: Strategy edge is not proven
**Severity**: High
The scoring, backtest, outcome, review, and evidence-gate mechanisms are implemented, but the app has not accumulated enough fresh wallet-enriched history and manual reviews to justify trading.

### KI-004: Wallet evidence is still sparse
**Severity**: Medium
Wallet discovery and qualification work, but only a subset of observed candidates has qualified-wallet evidence. This limits confidence and correctly produces `unknown` risk on many tokens.

### KI-005: External notifications require credentials
**Severity**: Medium
Telegram and Discord delivery code is implemented, but real delivery requires a valid bot token or webhook plus an enabled destination. The recovery worker cannot prove an external channel without those credentials.

### KI-006: Provider quality depends on credentials and quotas
**Severity**: Medium
Helius and Birdeye improve metadata, holders, RPC reliability, and wallet history. Missing keys, free-tier quotas, or provider errors reduce evidence coverage. DexScreener remains the free fallback.

### KI-007: Hot-path caching is not implemented
**Severity**: Low
Database indexes now cover scanner, strategy, alert, snapshot, wallet, and outcome access patterns. Redis response caching should be added only after production measurements identify the actual hot queries.

### KI-008: Automated browser coverage is limited
**Severity**: Low
The web app has unit and production-build coverage, but repeatable end-to-end tests should be expanded for mobile layouts, scanner filtering, unlock behavior, and degraded API states.

### KI-009: Trading is intentionally unavailable
**Severity**: Expected
The terminal is preparation-only. Jupiter quotes, wallet connection, simulation, signing, execution, and position controls belong to final Phase 3 after the evidence gate passes.

## Resolved in Workspace

- Signal scores no longer saturate at 100.
- Empty or weak legacy strategies no longer create alerts.
- Scanner market observations are separated from strategy matches.
- Duplicate signal emission now requires material change and cooldown expiry.
- Risk no longer treats missing evidence as low risk.
- Scanner text, timeframe, liquidity, volume, market-cap, pair-age, wallet, source, and bundler filters are functional.
- Generic browser selects were replaced by the Aegis custom select component.
- The Research route is functional.
- Static TPS, gas, latency, fake risk labels, and synthetic charts were removed.
- Personal production mutations and settings reads are protected without account sign-in.
- The alert queue now has an embedded always-on consumer and startup recovery pass.
- Scheduled alert outcome measurement is enabled.
- Query indexes and CI validation were added.
