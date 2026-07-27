# Current State

**Last Updated**: 2026-07-27
**Phase**: Phase 2 - Live Data Integration (Completed)
**Status**: Core monorepo is operational, provider-backed discovery and market-data plumbing are live, supervised stream ingestion and automated wallet sync now run as always-on services, alert delivery supports persisted destinations, and the core Phase 2 product surfaces are backed by persisted runtime data.

## What Works

### Infrastructure
- Docker Compose for PostgreSQL 16 on port 5433 and Redis 7
- Drizzle migrations and development seeding
- Turborepo and pnpm workspace scripts
- Repo-wide typechecking across all 20 packages
- Repo-wide unit test command completes without failing packages that do not yet define local test files

### API and Data Access
- Fastify API server with health, status, scanner, token, alerts, and dev ingest routes
- Zod validation, CORS, request IDs, and structured logging
- Alerts route now joins strategies through the actual foreign key
- Scanner and token-detail APIs now derive `dataSource` and `dataFreshness` from persisted signal, launch, and snapshot metadata
- Scanner filtering now correctly applies `minScore` and `priority` constraints to both result and count queries
- Status responses now include queue depth, dead-letter depth, and background-job counts for raw-event, alert-delivery, and wallet-sync workers

### Provider Layer
- Solana RPC provider with transaction parsing
- Helius provider wiring for token discovery and wallet history when `HELIUS_API_KEY` is set
- DexScreener market data provider available by default
- Birdeye market data provider available when `BIRDEYE_API_KEY` is set
- Provider registry fallback logic for missing paid-provider credentials
- Shared token discovery service and repository abstraction used by the indexer command path

### Intelligence Logic
- Deterministic token scoring with explainable factor output
- Token risk scoring with versioned risk factors persisted onto signal metadata
- Wallet classification heuristics for bot, insider, bundler, sniper, whale, and related labels
- Wallet scoring and qualification rules persisted onto wallet metadata and performance snapshots
- Discovery and raw-event processing now evaluate all active strategies against their current versioned config instead of hard-coding a single default strategy
- Unit tests for scoring, notification formatting, Solana provider behavior, and shared token discovery orchestration

### Product Surfaces
- Next.js web app with dashboard, scanner, alerts, token detail, watchlists, wallets, settings, and terminal routes
- Settings UI now manages notification destinations and persisted strategies in addition to JSON preferences
- Telegram bot commands for `/start`, `/help`, `/status`, `/alerts`, and `/scan`
- Development ingestion commands for sample events, token discovery, wallet ingestion, and wallet classification

### Trading
- Trading terminal UI shell exists
- Swap quote and execution providers still use development fallbacks
- No wallet connection or transaction submission flow is enabled

### Notifications
- Telegram formatting is implemented
- Alerts worker now routes through persisted destinations and can deliver to Telegram, Discord webhooks, or the development outbox
- Discord, email, web push, and WhatsApp are not implemented

### Workers and Background Processing
- Indexer commands exist and raw provider events can be stored
- Shared ingestion pipeline now stores raw events and enqueues processor work through BullMQ for development-triggered flows
- Shared discovery logic now persists provider provenance into launches and signals
- Processor service now consumes queue jobs, normalizes pending raw token-launch events, and enqueues downstream alert-delivery work
- Alerts service now consumes alert-delivery queue jobs into persisted deliveries and marks alerts delivered, suppressed, or failed based on routing outcome
- Wallet ingestion and wallet classification now share a reusable wallet-intelligence pipeline that is callable from CLI commands, the API queue path, and the automated wallet sync worker
- Indexer runtime now starts a supervised transaction-stream ingestion loop and a periodic stale-wallet sync scheduler
- Queue lifecycle is mirrored into `background_jobs`, worker retries move through persisted statuses, and terminal failures are mirrored into dead-letter queues

## What Is Still Seeded or Stubbed

- Some watchlist and settings data still starts from seeded development users until full auth is wired
- Telegram delivery is limited by missing credentials in local development
- Swap quotes and execution are stubbed
- Some wallet and holder enrichment paths fall back to development behavior when provider credentials are missing

## Validation Snapshot

```bash
pnpm typecheck   # passes across 20 packages
pnpm test:unit   # passes across the workspace
```

Implemented unit tests currently cover:
- intelligence scoring
- token-risk and wallet-score rulesets
- notification formatters
- Solana providers and registry behavior
- shared token discovery orchestration
- shared ingestion pipeline queue orchestration
- stream event to ingestion handoff
- API route metadata behavior for scanner, token detail, alerts, and dashboard
- API route behavior for watchlists, wallets, settings, and wallet sync
- raw-event processor and alert-delivery worker behavior

## Known Gaps

- No live trading execution
- No production auth provider configuration
- Web push, email, and WhatsApp notification channels are not implemented

## Required Environment Variables

Required:
- `DATABASE_URL`
- `REDIS_URL`
- `NEXTAUTH_SECRET`

Optional:
- `TELEGRAM_BOT_TOKEN`
- `HELIUS_API_KEY`
- `BIRDEYE_API_KEY`

## Next Recommended Tasks

1. Start Phase 3 by wiring real Jupiter quote retrieval and execution into the trading terminal.
2. Add wallet connection and explicit signing flows for non-custodial execution.
3. Extend notifications to web push and richer end-user channel management once auth is fully wired.
4. Harden production auth and multi-user session configuration.
