# Changelog

All notable changes to this project will be documented in this file.

## [0.1.9] - 2026-08-11

### Added

- Deployed migration `0005` and verified the contract-intelligence worker end to end against a live Solana contract.
- Added a paced public-RPC holder fallback that resolves real owner wallets and supply without spending Helius historical quota.
- Added production coverage reporting for holder snapshots, observed buyers, relationship evidence, and unavailable funding paths.

### Fixed

- Preserved partial contract analysis when historical provider capacity is unavailable instead of reporting fabricated empty evidence.
- Kept seed wallets visible in the relationship map when no relationship edges are inferred.
- Redacted provider credentials from logs and paused automated wallet backfills while free-provider capacity is reserved for targeted analysis.

## [0.1.8] - 2026-08-10

### Added

- Added queued contract-address analysis for unknown and previously indexed Solana tokens
- Added append-only top-holder snapshots backed by ranked token accounts and parsed owner resolution
- Added top observed trader and earliest observed buyer analysis with honest coverage labels
- Added persisted co-entry, repeat co-entry, and repeat-deployer-circle relationships with evidence confidence
- Added a two-hop wallet relationship map and deployment-circle dossier to token research
- Added token-analysis queue health reporting and migration `0005_fantastic_avengers.sql`

### Corrected

- Relabeled the wallet-history native swap leg as SOL rather than USD across dashboard, scanner, and token research
- Kept direct funding paths explicitly unavailable instead of inferring common control from co-entry
- Allowed Next.js React Refresh evaluation only in development so the local app hydrates while production CSP remains unchanged

## [0.1.7] - 2026-08-10

### Fixed

- Unified live and replay strategy evaluation and prevented empty or weak legacy rules from creating alerts
- Separated broad scanner observations from strategy alerts and added material-change deduplication
- Added uncertainty-aware token risk, primary query indexes, corrected system strategies, and legacy alert supersession migration
- Added personal write-key protection, private settings reads, expensive-route rate limits, and browser unlock controls
- Embedded the alert worker, added recovery delivery and scheduled outcome measurement, and changed discovery to a protected 15-second loop
- Replaced fabricated shell metrics, false risk labels, placeholder research, inert search, and synthetic charts with real data or explicit unavailable states
- Changed the scanner default from score 40 to the full observed market while retaining an optional score filter
- Added scanner text search, terminal search, micro-price formatting, CI, and frontend access-key tests

## [0.1.6] - 2026-08-10

### Fixed

- Replaced the saturating signal-score calculation with confidence-adjusted normalization under `token-signal-v0.2.0`
- Preserved signed negative factor contributions instead of converting them into positive score
- Added exact score, sparse-evidence, negative-factor, and backfill reconstruction regression tests
- Added an idempotent seven-day startup repair for persisted signals, factors, and linked alerts
- Recalculated 861 production signals with no remaining score of 100 in the live Scanner result set
- Changed the Scanner default minimum score from 80 to 40 at that release; `0.1.7` now shows the full observed market by default

## [0.1.4] - 2026-08-02

### Added

- Added historical strategy replay with return, win rate, adverse excursion, max upside, failure classes, and explicit coverage gaps
- Added 24-hour MAE and maximum-return outcome backfill for alert performance review
- Added persisted alert review verdicts and notes with a needs-review queue and measured-outcome recommendation
- Added the database migration for `alert_reviews`

## [0.1.5] - 2026-08-02

### Added

- Added wallet and cohort evidence fields to historical token snapshots
- Added wallet-aware strategy replay with fail-closed missing-data behavior
- Added strategy evidence-gate thresholds for completed outcomes, win rate, return, MAE, manual review coverage, false-positive rate, and replay field coverage
- Added wallet evidence coverage and gate status to the Strategies UI

## [0.1.3] - 2026-07-28

### Changed

#### Live Data Reliability
- Added a real DexScreener latest Solana profile fallback for scanner live scans when Helius registry discovery returns no token events
- Enriched DexScreener-discovered tokens with pair-level symbol/name metadata and upgraded existing `NEW`/`UNKNOWN` token rows
- Added functional scanner filters for displayed data source, minimum liquidity, priority, score, and data window
- Exposed scanner row market fields so liquidity and volume filters are visible in the UI
- Added scanner wallet-evidence summaries from indexed wallet trades, including trade count, wallet count, qualified wallet count, and top wallets
- Enriched token-detail wallet evidence with wallet qualification status, wallet score, win rate, and PnL context
- Normalized signal-factor numeric persistence in discovery and raw-event processing so text/boolean risk values do not break database inserts
- Rejected invalid Solana wallet and known program addresses before wallet sync or wallet ingestion can call providers
- Filtered invalid seeded wallet noise out of default wallet and dashboard surfaces

#### Product Validation
- Rebuilt and restarted the local web app, then verified `/scanner` and token-detail pages in-browser against the local API
- Confirmed live scanner rows use current DexScreener-backed data and token detail remains preparation-only for execution
- Confirmed scanner rows display real token symbols/names and use custom Aegis dropdown controls instead of native browser selects

#### UI System
- Added a reusable custom Aegis dropdown component and replaced native selects in scanner, settings, watchlists, and strategies

#### Roadmap
- Reframed the active roadmap around Phase 2.5 real-data reliability and Phase 2.6 evidence/backtesting before Phase 3 trading
- Documented that Phase 3 trading should remain last until real data and edge validation are proven

## [0.1.2] - 2026-07-27

### Added

#### Runtime and Automation
- Added supervised indexer runtime behavior with always-on transaction stream ingestion and automated stale-wallet sync scheduling
- Added a dedicated wallet sync queue, dead-letter queue support, and richer persisted background-job states for retries and terminal failures

#### Intelligence
- Added wallet scoring and qualification rules plus token-risk scoring rules with direct unit coverage

#### Alerting and Configuration
- Added persisted destination-backed alert delivery for Telegram, Discord webhooks, and development outbox routing
- Added strategy creation/deletion and notification destination management APIs and corresponding settings UI controls

### Changed

#### API and Product Behavior
- Changed wallet sync API behavior from inline execution to queue-backed background processing with persisted job visibility
- Changed wallet performance persistence to store qualification metadata, average hold time, average return, and ruleset-backed wallet scores
- Changed discovery and processor signal generation to persist token-risk metadata and full factor rows consistently
- Updated status reporting to include wallet-sync and dead-letter queue visibility

## [0.1.1] - 2026-07-26

### Changed

#### Live Data Integration
- Extracted shared token discovery orchestration into a reusable indexer service and repository abstraction
- Updated the token-discovery command to use the shared service instead of duplicating persistence and scoring logic
- Persisted provider provenance metadata on discovery-generated launches and signals for downstream consumers

#### API Behavior
- Replaced hardcoded token and scanner `dataSource` reporting with values derived from persisted signal, launch, and snapshot metadata
- Replaced placeholder freshness handling with snapshot- and event-based `dataFreshness`
- Fixed scanner filtering so `minScore` and `priority` constraints affect both returned rows and pagination counts
- Added a dedicated dashboard API that returns live overview, pipeline backlog, failure counts, and recent activity from persisted records
- Added live watchlists, wallets, settings, and wallet-sync API routes for the Phase 2 web surfaces
- Extended the status API with queue-depth and background-job visibility for ingestion and alert workers

#### Tests and Validation
- Added unit coverage for shared token discovery orchestration
- Added route-level API tests for scanner, token-detail, alerts, and dashboard metadata responses
- Added route-level API tests for watchlists, wallets, settings, and wallet-sync behavior
- Added unit coverage for stream event to ingestion handoff
- Added unit coverage for raw-event processor and alert-delivery worker behavior
- Confirmed `pnpm typecheck` and `pnpm test:unit` pass across the workspace after the Phase 2 updates

#### Background Processing
- Replaced processor and alerts service stubs with real polling workers for pending raw token-launch events and pending alerts
- Added development-log delivery flow that records alert deliveries and marks alerts delivered
- Routed the dev-ingest API and sample-ingestion command through the shared ingestion pipeline instead of duplicating manual token, signal, and alert creation
- Switched the shared development-ingestion path to enqueue raw-event processing jobs through BullMQ
- Updated the processor service to enqueue downstream alert-delivery jobs, and updated the alerts service to consume queued delivery work
- Extracted wallet ingestion and classification into a shared wallet-intelligence pipeline reused by CLI commands and the API
- Added persisted `background_jobs` lifecycle tracking for queued ingestion and alert-delivery work
- Added an initial transaction-stream ingestion command that feeds streamed token events into the shared queued ingestion pipeline

#### Strategy Runtime
- Replaced single-strategy signal generation with active-strategy evaluation against current versioned strategy config in discovery and raw-event processing paths

#### Documentation
- Updated current-state, roadmap, known-issues, PRD, and agent-instruction documents to reflect that the repo is in Phase 2 rather than Phase 1
- Documented the remaining gap around route-level API regression tests

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
