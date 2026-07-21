# Current State

**Last Updated**: 2026-07-21
**Phase**: Phase 2 - Live Data Integration (In Progress)
**Status**: Real Solana RPC connected, token discovery pipeline working

## What Works

### Infrastructure
- Docker Compose with PostgreSQL 16 (port 5433) and Redis 7
- Database migrations via Drizzle Kit (43 tables)
- Seed data with development tokens, wallets, signals, alerts
- Development event ingestion command
- Real Solana devnet RPC connection

### Data Pipeline
- Raw event ingestion (dev + real Solana events)
- Event normalization (token, launch, market records)
- Deterministic scoring with explainable factors
- Strategy evaluation (default alpha strategy)
- Alert generation and storage
- Telegram alert formatting (logged to structured output)
- **Real token discovery from Solana Token Program**

### Provider System (Phase 2)
- Typed provider interfaces (BlockchainData, TokenDiscovery, MarketData, etc.)
- SolanaRpcProvider with full transaction parsing
- HeliusProvider for enhanced token discovery and wallet history
- Provider registry with automatic fallback (Helius → dev fallback)
- Rate limiting for public RPC

### API Server
- Health, status, scanner, tokens, alerts endpoints
- Zod validation, structured logging, request IDs, CORS
- Dev ingestion endpoint (dev-only)

### Web Application
- Dashboard, Scanner, Token Detail, Alerts, Terminal (read-only)
- Responsive design, dark mode, keyboard navigation

### Telegram Bot
- /start, /help, /status, /alerts, /scan commands
- Graceful handling of missing credentials

### Testing
- **40 unit tests passing** (13 scoring + 14 formatters + 13 solana)
- Solana RPC provider tests (live devnet connection)
- Provider registry tests

## What Is Partially Implemented

### Authentication
- Development login works (no external OAuth)
- Session handling works
- Production auth (Google, GitHub) not configured

### Trading Terminal
- UI shell exists with all form elements
- No actual quote retrieval
- No wallet connection
- Clearly labeled "Execution Unavailable"

### Notifications
- Telegram formatting works
- No actual delivery (credentials not configured)
- Discord, web push, email not implemented

## What Is Mocked

- Market data (static development values)
- Telegram message delivery (logged instead)
- Token holder data (when no Helius key)
- Wallet history/positions (when no Helius key)
- Swap quotes and execution

## What Is Not Implemented

- Birdeye/DexScreener market data integration
- Real-time transaction streaming (Yellowstone gRPC)
- Wallet classification algorithms (bot, insider, bundler)
- Full wallet scoring engine
- Full token risk scoring (with real market data)
- Multiple strategy support
- User-configurable strategies
- Live trading execution
- Discord/email notifications

## Database State

- 24 tables created
- All migrations applied
- Seed data includes:
  - 1 system user + 1 admin user
  - 5 development tokens
  - 5 development wallets
  - 2 strategies
  - 5 signals with factors
  - 5 alerts with deliveries
  - 5 markets with snapshots
  - Raw provider events for vertical slice

## Commands That Pass

```bash
pnpm install           # ✅ Installs all dependencies
pnpm typecheck         # ✅ 20/20 packages typecheck
pnpm test:unit         # ✅ 40 unit tests pass
pnpm db:migrate        # ✅ Applies 43-table migration
pnpm db:seed           # ✅ Seeds development data
pnpm dev:ingest-sample # ✅ Ingests sample event
pnpm dev:discover-tokens # ✅ Scans real Solana devnet for new tokens
```

## Known Issues

- Public Solana RPC rate limits aggressively (429 errors) - add HELIUS_API_KEY to resolve
- Devnet has sparse token launch activity - switch to mainnet for real data
- Market data still uses mock values - need Birdeye/DexScreener integration

## Required Environment Variables

Required: `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`
Optional: `TELEGRAM_BOT_TOKEN`, `HELIUS_API_KEY` (enables enhanced discovery + wallet history)

## Next Recommended Tasks

1. Add Helius API key for enhanced token discovery and wallet history
2. Implement bot/insider detection algorithms
3. Build wallet history ingestion pipeline
4. Connect market data provider (Birdeye or DexScreener)
