# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-07-21

### Added

#### Repository Foundation
- Turborepo monorepo with pnpm workspace
- TypeScript 5.7 configuration
- Prettier formatting
- ESLint configuration
- Docker Compose (PostgreSQL 16, Redis 7)

#### Documentation (21 files)
- Product Vision, PRD, System Architecture
- Data Architecture, Database Schema, Provider Strategy
- Wallet Intelligence, Token Intelligence, Scanner & Scoring specs
- Trading Terminal, Telegram Bot, Notification Architecture specs
- Security Model, Accessibility & Design System
- Testing Strategy, Implementation Plan
- Current State, Decisions Log, Known Issues
- Agent Instructions, Changelog

#### Infrastructure
- Docker Compose for local development
- PostgreSQL 16 with health checks
- Redis 7 with health checks

#### Database Package (`@memecoin/database`)
- Drizzle ORM schema with 24 tables
- Migration generation and application
- Seed data for development
- Schema groups: users, tokens, wallets, scanner, trading, system

#### Shared Packages
- `@memecoin/config` - Environment validation with Zod
- `@memecoin/logger` - Pino structured logging
- `@memecoin/schemas` - Shared Zod schemas (API, domain, scoring, notifications, trading)
- `@memecoin/queue` - BullMQ job queue with Redis
- `@memecoin/solana` - Solana provider interfaces
- `@memecoin/market-data` - Market data abstractions
- `@memecoin/intelligence` - Intelligence scoring engine
- `@memecoin/trading` - Trading adapter interfaces
- `@memecoin/notifications` - Notification formatting and delivery
- `@memecoin/ui` - Shared React UI components (shadcn/ui)
- `@memecoin/testing` - Test fixtures, mocks, and helpers

#### Services
- `@memecoin/indexer` - Raw event ingestion with dev ingestion command
- `@memecoin/processor` - Event normalization pipeline
- `@memecoin/scoring` - Deterministic scoring with explainable factors
- `@memecoin/alerts` - Strategy evaluation and alert generation
- `@memecoin/execution` - Trade execution foundation (non-functional)

#### API Server (`@memecoin/api`)
- Fastify HTTP server
- Health endpoint (`GET /health`)
- System status endpoint (`GET /api/v1/status`)
- Scanner results (`GET /api/v1/scanner`)
- Token details (`GET /api/v1/tokens/:address`)
- Recent alerts (`GET /api/v1/alerts`)
- Dev ingestion (`POST /api/v1/dev/ingest`)
- Zod validation, structured logging, request IDs, CORS

#### Web Application (`@memecoin/web`)
- Next.js 15 with App Router
- Auth.js development authentication
- Dashboard with system status
- Scanner with sorting and filtering
- Token detail page with score and factors
- Alerts page with delivery tracking
- Trading terminal shell (read-only)
- Responsive design (320px to desktop)
- Dark/light mode
- Accessibility (WCAG 2.2 AA)

#### Telegram Bot (`@memecoin/telegram-bot`)
- grammY framework
- Commands: `/start`, `/help`, `/status`, `/alerts`, `/scan`
- Alert formatting for Telegram
- Deep link generation
- Graceful handling of missing credentials

#### Tests
- Unit tests for scoring, formatting, validation
- Integration tests for ingestion, processing, API
- Browser tests (Playwright) for core flows
- Test fixtures and mock providers

#### Scripts
- `pnpm dev` - Start all services
- `pnpm build` - Build all packages
- `pnpm lint` / `pnpm typecheck` - Validation
- `pnpm test` / `pnpm test:unit` / `pnpm test:integration` / `pnpm test:e2e`
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed`
- `pnpm dev:ingest-sample` - Ingest sample event
