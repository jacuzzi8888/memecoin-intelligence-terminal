# Decisions Log

## DEC-001: TypeScript-first monorepo

**Date**: 2026-07-21
**Decision**: Use TypeScript-first monorepo with Turborepo and pnpm
**Context**: Need shared code between web, API, workers, and Telegram bot
**Alternatives considered**:
- Separate repos per service: Harder to share types, slower iteration
- Nx: More complex, less community examples
- Yarn workspaces: Slower, less strict dependency resolution
**Reason**: TypeScript enables shared Zod schemas between API and clients. Turborepo provides fast builds with caching. pnpm is fastest and most strict.
**Consequences**: All code must be TypeScript. Shared packages require careful versioning. Build orchestration adds complexity.

## DEC-002: PostgreSQL over MongoDB

**Date**: 2026-07-21
**Decision**: Use PostgreSQL as primary database
**Context**: Need strong consistency for financial data, complex queries for wallet relationships
**Alternatives considered**:
- MongoDB: Flexible schema but weaker consistency, harder joins
- ClickHouse: Great for analytics but overkill for initial build
**Reason**: PostgreSQL provides strong consistency, complex joins for wallet relationships, JSON columns for flexibility, mature ecosystem.
**Consequences**: Schema migrations required for changes. JSON columns used sparingly. Read replicas possible later.

## DEC-003: Drizzle ORM over Prisma

**Date**: 2026-07-21
**Decision**: Use Drizzle ORM for database access
**Context**: Need type-safe database access with good migration support
**Alternatives considered**:
- Prisma: More mature but heavier, migration issues at scale
- TypeORM: Less type-safe, decorator-heavy
- Raw SQL with kysely: Maximum control but more boilerplate
**Reason**: Drizzle is lightweight, SQL-like, type-safe, and has excellent migration support. Better for complex queries.
**Consequences**: Less "magical" than Prisma. More manual migration management.

## DEC-004: Fastify over Express

**Date**: 2026-07-21
**Decision**: Use Fastify for API server
**Context**: Need fast, schema-based HTTP server
**Alternatives considered**:
- Express: Most popular but slower, no built-in validation
- Hono: Newer, less ecosystem
- NestJS: Heavy framework, overkill for API
**Reason**: Fastify is fastest Node.js framework, has built-in schema validation, plugin system, and good TypeScript support.
**Consequences**: Smaller ecosystem than Express. Some plugins less mature.

## DEC-005: BullMQ over direct Redis pub/sub

**Date**: 2026-07-21
**Decision**: Use BullMQ for background job processing
**Context**: Need reliable job queue for ingestion, processing, scoring, alerts
**Alternatives considered**:
- Direct Redis pub/sub: Simpler but no retries, no persistence
- RabbitMQ: More features but heavier infrastructure
- AWS SQS: Managed but vendor lock-in
**Reason**: BullMQ provides retries, job deduplication, rate limiting, and priority queues. Uses existing Redis infrastructure.
**Consequences**: Redis becomes critical infrastructure. Job monitoring needed.

## DEC-006: grammY for Telegram

**Date**: 2026-07-21
**Decision**: Use grammY framework for Telegram bot
**Context**: Need maintained, typed Telegram bot framework
**Alternatives considered**:
- node-telegram-bot-api: Older, less typed
- Telegraf: Good but grammY is more modern
- Custom HTTP: Too much boilerplate
**Reason**: grammY is modern, fully typed, has good middleware system, and active maintenance.
**Consequences**: Newer framework, smaller community than Telegraf.

## DEC-007: Local single-user mode

**Date**: 2026-07-21
**Decision**: Run the local app as a single-user workspace without an OAuth prompt
**Context**: This installation is personal and runs on localhost; external identity adds friction without providing local value.
**Alternatives considered**:
- Require OAuth locally: Unnecessary for a single operator
- Remove all server-side authorization: Unsafe if the app is later exposed
**Reason**: Local development uses a single development user automatically. Personal production uses a browser-entered write key so state changes fail closed without adding account friction.
**Consequences**: Public market reads remain available, mutations and sensitive settings require the key, and a real identity provider is required only if the product becomes multi-user.

## DEC-008: Append-only raw data

**Date**: 2026-07-21
**Decision**: Store raw blockchain events as append-only with provider provenance
**Context**: Need audit trail and ability to reprocess data
**Alternatives considered**:
- Update-in-place: Simpler but loses history
- Event sourcing: More complex, similar outcome
**Reason**: Append-only ensures data integrity, allows reprocessing, provides audit trail. Provider provenance enables debugging provider-specific issues.
**Consequences**: More storage required. Need cleanup/archival strategy for old data.

## DEC-009: Non-custodial trading only

**Date**: 2026-07-21
**Decision**: Never store private keys; use non-custodial wallet connection
**Context**: Trading terminal must execute swaps on Solana
**Alternatives considered**:
- Custodial wallets: More control but massive security risk
- Hybrid approach: Complex, still risky
**Reason**: Non-custodial (user signs in their wallet) eliminates the risk of key theft from our systems. Users maintain full control of their funds.
**Consequences**: Requires user to have wallet extension. More complex UX. Cannot automate trading without user interaction.

## DEC-010: Versioned scoring

**Date**: 2026-07-21
**Decision**: All intelligence scores include ruleset version
**Context**: Scoring rules will evolve; need to track changes
**Alternatives considered**:
- Overwrite scores: Simpler but loses history
- Version externally: Harder to correlate
**Reason**: Versioning enables backtesting (compare old vs new scores), reproducibility, and understanding score changes over time.
**Consequences**: More complex queries (need to filter by version). More storage for historical scores.
