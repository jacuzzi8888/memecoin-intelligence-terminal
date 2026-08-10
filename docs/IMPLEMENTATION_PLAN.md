# Implementation Plan

Phase 3 is the final phase. All intelligence, evidence, reliability, and production-hardening work must finish before trading begins.

## Phase 1: Foundation

**Status**: Complete

- Monorepo, TypeScript, pnpm, Turborepo, shared packages, and service boundaries
- PostgreSQL/Drizzle schema and migrations
- Redis/BullMQ queue foundation
- Fastify API, Next.js web app, provider interfaces, logging, and validation

## Phase 2.1: Live Data and Product Surfaces

**Status**: Complete in the workspace

- Helius, DexScreener, Birdeye, and Solana RPC provider paths
- Dashboard, scanner, research, token, alerts, wallets, watchlists, strategies, terminal, and settings pages
- Current-token discovery, market snapshots, source provenance, freshness, wallet history, and holder samples
- Custom Aegis controls and responsive desktop/mobile shell

## Phase 2.5: Reliability and Signal Integrity

**Status**: Implementation complete; production rollout pending

- [x] Non-saturated signed scoring
- [x] Unknown risk for incomplete evidence
- [x] Canonical versioned strategy engine across live processing and replay
- [x] Strict legacy strategy normalization
- [x] Broad market observations separated from alerts
- [x] Material-change and cooldown signal deduplication
- [x] 15-second discovery schedule with overlap protection
- [x] 150-candidate manual and scheduled scan capacity
- [x] Functional scanner filters and text search
- [x] Query indexes for primary read/write paths
- [x] Personal write key and sensitive-settings protection
- [x] Embedded alert delivery consumer and recovery pass
- [x] Scheduled alert outcome backfill
- [x] CI workflow and frontend unit coverage
- [ ] Deploy, migrate, and verify the updated production stack
- [ ] Measure provider coverage, quotas, freshness, and failure rates for at least seven continuous days

## Phase 2.6: Evidence and Strategy Proof

**Status**: Mechanisms complete; evidence accumulation in progress

- [x] Multi-window alert outcomes
- [x] Return, win rate, MAE, maximum return, and failure classes
- [x] Historical strategy replay with coverage reporting
- [x] Manual false-positive review workflow
- [x] Evidence gate for strategy graduation
- [x] Wallet-enriched snapshots and qualified-wallet conditions
- [ ] Accumulate enough completed 24h outcomes for each candidate strategy
- [ ] Review enough alerts to estimate false-positive rate
- [ ] Demonstrate acceptable return, drawdown, coverage, and failure-class results
- [ ] Disable or revise strategies that fail the gate

## Phase 2.7: Coverage and Operator Value

**Status**: Next after production rollout

- [ ] Measure what percentage of daily launches each discovery source captures
- [ ] Add a broader free launch source or reliable Helius launch parser if coverage is insufficient
- [ ] Increase qualified-wallet evidence coverage and expose wallet cohort reasoning
- [ ] Add provider health history, ingestion lag, and per-source failure telemetry
- [ ] Add saved scanner views and watchlist-to-alert workflows
- [ ] Add repeatable browser tests for mobile, filters, unlock, and degraded states

## Phase 2.8: Production Hardening

**Status**: Planned before trading

- [ ] Load-test scanner, dashboard, outcomes, and strategy replay with production-sized data
- [ ] Add targeted Redis caching based on measured hot queries
- [ ] Add retention and archival policy for snapshots, raw events, jobs, and failures
- [ ] Add alerting for stale data, dead letters, worker downtime, and provider quota errors
- [ ] Complete the final security review and credential rotation
- [ ] Produce a seven-day reliability and edge report

## Phase 3: Trading and Delivery

**Status**: Final phase, blocked

Start only when Phase 2.6 evidence gates pass and Phase 2.7/2.8 production criteria are complete.

- [ ] Jupiter live quote integration
- [ ] Solana Wallet Adapter with client-side signing
- [ ] Transaction simulation and explicit risk confirmation
- [ ] Non-custodial transaction submission and status tracking
- [ ] Position, PnL, and trade outcome tracking
- [ ] Simulated Telegram commands before any live trading command
- [ ] Final external notification channels required by the operator

## Phase 3 Start Gate

1. Production data has remained fresh and workers healthy for seven continuous days.
2. Discovery coverage and provider failure rates are measured and acceptable.
3. Candidate strategies pass minimum sample size, return, drawdown, coverage, and false-positive gates.
4. No critical or high-severity open defects remain.
5. Security review confirms no server-side custody of wallet private keys.
6. The user explicitly approves beginning trading implementation.
