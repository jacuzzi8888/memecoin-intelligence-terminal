# Memecoin Intelligence Terminal

A production-oriented Solana memecoin intelligence scanner and trading terminal that combines wallet-first alpha scanning, token intelligence, historical research, and real-time trading capabilities.

## Overview

This platform identifies profitable wallets hidden among top traders of successful memecoins, filters out unreliable actors, backtests remaining wallets, and monitors them continuously to alert users when multiple qualified wallets buy the same fresh token.

## Product Surfaces

- **Web Application**: Scanner, token intelligence, wallet intelligence, cohorts, graph explorer, strategy builder, backtesting, trading terminal
- **Telegram Bot**: Alerts, scanning, wallet analysis, trade execution
- **Notification System**: Telegram, Discord, web push, email, WhatsApp

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure
docker compose up -d

# Run database migrations
pnpm db:migrate

# Seed development data
pnpm db:seed

# Start all services
pnpm dev

# Ingest a sample token event (vertical slice demo)
pnpm dev:ingest-sample
```

## Access

- Web App: http://localhost:3000
- API: http://localhost:4000
- API Health: http://localhost:4000/health

## Architecture

```
apps/
├── web/              Next.js web application
├── api/              Fastify API server
└── telegram-bot/     Telegram bot

services/
├── indexer/          Blockchain data ingestion
├── processor/        Event normalization
├── scoring/          Intelligence scoring
├── alerts/           Alert generation and delivery
└── execution/        Trade execution

packages/
├── database/         Drizzle ORM schema and migrations
├── schemas/          Shared Zod schemas
├── config/           Configuration management
├── logger/           Structured logging
├── queue/            BullMQ job queue
├── solana/           Solana provider interfaces
├── market-data/      Market data abstractions
├── intelligence/     Intelligence calculations
├── trading/          Trading adapters
├── notifications/    Notification delivery
├── ui/               Shared UI components
└── testing/          Test utilities
```

## Documentation

See [docs/](./docs/) for detailed documentation:

- [Product Vision](docs/PRODUCT_VISION.md)
- [System Architecture](docs/SYSTEM_ARCHITECTURE.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [Current State](docs/CURRENT_STATE.md)
- [Agent Instructions](docs/AGENT_INSTRUCTIONS.md)

## Development

```bash
# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Format code
pnpm format
```

## Security

- Never store private keys
- Never execute live trades without explicit approval
- Never expose secrets in client code
- All provider integrations are behind interfaces

## Status

This is a foundation build. See [CURRENT_STATE.md](docs/CURRENT_STATE.md) for detailed implementation status.
