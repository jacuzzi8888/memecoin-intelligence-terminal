# Current State

**Last Updated**: 2026-07-25
**Phase**: Phase 2 - Live Data Integration (In Progress)
**Status**: Core monorepo is operational, live provider plumbing exists, and the product is still a mixed seeded-data plus incremental live-data build.

## What Works

### Infrastructure
- Docker Compose for PostgreSQL 16 on port 5433 and Redis 7
- Drizzle migrations and development seeding
- Turborepo and pnpm workspace scripts
- Repo-wide typechecking across all 20 packages
- Repo-wide unit test command now completes without failing on packages that do not yet define local test files

### API and Data Access
- Fastify API server with health, status, scanner, token, alerts, and dev ingest routes
- Zod validation, CORS, request IDs, and structured logging
- Database-backed dashboard and API responses for seeded development data
- Alerts route now joins strategies through the actual foreign key

### Provider Layer
- Solana RPC provider with transaction parsing
- Helius provider wiring for token discovery and wallet history when `HELIUS_API_KEY` is set
- DexScreener market data provider available by default
- Birdeye market data provider available when `BIRDEYE_API_KEY` is set
- Provider registry fallback logic for missing paid-provider credentials

### Intelligence Logic
- Deterministic token scoring with explainable factor output
- Wallet classification heuristics for bot, insider, bundler, sniper, whale, and related labels
- Unit tests for scoring, notification formatting, and Solana provider behavior

### Product Surfaces
- Next.js web app with dashboard, scanner, alerts, token detail, watchlists, wallets, settings, and terminal routes
- Telegram bot commands for `/start`, `/help`, `/status`, `/alerts`, and `/scan`
- Development ingestion commands for sample events, token discovery, wallet ingestion, and wallet classification

## What Is Partially Implemented

### Live Data Coverage
- Real provider integrations exist, but not every product surface consumes live market or wallet-history data end to end
- Seed data is still the main source for the default dashboard and demo flows
- Helius-enhanced discovery and wallet history depend on optional credentials

### Trading
- Trading terminal UI shell exists
- Swap quote and execution providers still use development fallbacks
- No wallet connection or transaction submission flow is enabled

### Notifications
- Telegram formatting is implemented
- Bot startup is credential-gated and alert delivery infrastructure is minimal
- Discord, email, web push, and WhatsApp are not implemented

### Workers and Background Processing
- Indexer commands exist and raw provider events can be stored
- The dedicated alerts service is still mostly a stub
- End-to-end queue-driven background orchestration is not complete

## What Is Still Seeded or Stubbed

- Default dashboard metrics and demo flows rely on seeded database records
- Telegram delivery is limited by missing credentials in local development
- Swap quotes and execution are stubbed
- Some wallet and holder enrichment paths fall back to development behavior when provider credentials are missing

## Validation Snapshot

```bash
pnpm typecheck   # passes across 20 packages
pnpm test:unit   # passes; packages without local tests no longer fail the workspace run
```

Implemented unit tests currently cover:
- intelligence scoring
- notification formatters
- Solana providers and registry behavior

## Known Gaps

- No live trading execution
- No complete wallet-history ingestion pipeline
- No fully productionized alert delivery pipeline
- No full real-time transaction streaming workflow wired into the product
- No production auth provider configuration

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

1. Wire live provider output into the scanner, token detail, and dashboard surfaces consistently.
2. Finish the background pipeline so indexer, processor, scoring, and alerts run end to end outside demo commands.
3. Implement real quote retrieval and execution for the trading terminal.
4. Expand test coverage beyond the current intelligence, notification, and provider packages.
