# System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
├──────────────┬──────────────────┬───────────────────────────────┤
│  Web App     │  Telegram Bot    │  API Clients                  │
│  (Next.js)   │  (GrammY)        │  (REST/WebSocket)             │
└──────┬───────┴────────┬─────────┴──────────────┬────────────────┘
       │                │                         │
       ▼                ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer                                 │
│                    Fastify API Server                            │
│  ┌──────────┬──────────┬───────────┬──────────┬──────────────┐  │
│  │ Auth     │ Rate     │ Request   │ Zod      │ Structured   │  │
│  │ (Auth.js)│ Limiting │ IDs       │ Validate │ Logging      │  │
│  └──────────┴──────────┴───────────┴──────────┴──────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ Intelligence │  │ Trading      │  │ Notification     │
│ Service      │  │ Service      │  │ Service          │
└──────┬───────┘  └──────┬───────┘  └────────┬─────────┘
       │                 │                    │
       ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Background Workers                           │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────────┐  │
│  │ Indexer  │Processor │ Scoring  │ Alerts   │ Execution    │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────────┘  │
│                     BullMQ + Redis                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ PostgreSQL   │  │ Redis        │  │ Provider         │
│ (Drizzle ORM)│  │ (Cache/Queue)│  │ Interfaces       │
└──────────────┘  └──────────────┘  └──────────────────┘
                                           │
                    ┌──────────────────────┤
                    ▼                      ▼
            ┌──────────────┐      ┌──────────────┐
            │ Solana RPC   │      │ Market Data  │
            │ (Mock/Dev)   │      │ Providers    │
            └──────────────┘      └──────────────┘
```

## Layer Responsibilities

### Client Layer
- **Web App** (Next.js): Full-featured SPA with SSR for SEO. Handles authentication, data display, and trading interactions.
- **Telegram Bot**: Mobile-first interface for alerts, scanning, and quick actions. Uses grammY framework.
- **API Clients**: Future mobile apps, Discord bots, or third-party integrations.

### API Layer
- **Fastify**: Lightweight, fast HTTP server with schema-based validation.
- **Authentication**: Auth.js with provider-neutral design. Dev mode allows login without external OAuth.
- **Rate Limiting**: Per-user rate limits on expensive endpoints.
- **Request Tracking**: Unique request IDs for distributed tracing.
- **Validation**: Zod schemas shared between API and clients.

### Service Layer
- **Intelligence Service**: Calculates wallet scores, token risk, and signal scores. Deterministic and versioned.
- **Trading Service**: Manages quote retrieval, transaction simulation, and execution (non-custodial).
- **Notification Service**: Formats and delivers alerts through multiple channels.

### Worker Layer
- **Indexer**: Ingests raw blockchain events and stores them with provenance.
- **Processor**: Normalizes raw events into domain entities.
- **Scoring**: Calculates intelligence scores from normalized data.
- **Alerts**: Evaluates strategies and generates alerts.
- **Execution**: Processes trade intents and manages transaction lifecycle.

### Data Layer
- **PostgreSQL**: Primary data store with Drizzle ORM. Append-oriented raw data + normalized entities + derived intelligence.
- **Redis**: Caching, BullMQ job queues, and short-lived state (rate limits, sessions).
- **Provider Interfaces**: Abstraction layer for all external data sources.

## Data Flow

### Ingestion Pipeline
```
Raw Event → Indexer (store raw) → Queue → Processor (normalize) → Queue → Scoring → Queue → Alerts → Notification
```

### Query Path
```
Client → API → Cache? → PostgreSQL → Response
```

### Trading Path
```
Client → API → Trading Service → Jupiter Quote → Simulate → User Sign → Submit → Track Outcome
```

## Provider Architecture

All external data sources are accessed through interfaces:

```typescript
interface BlockchainDataProvider { ... }
interface TokenDiscoveryProvider { ... }
interface MarketDataProvider { ... }
interface TransactionStreamProvider { ... }
interface WalletHistoryProvider { ... }
interface SwapQuoteProvider { ... }
interface SwapExecutionProvider { ... }
interface NotificationProvider { ... }
```

Each interface has:
- A development/mock implementation for local testing
- Production implementations (Helius, Birdeye, Jupiter, etc.)

## Security Boundaries

```
┌─────────────────────────────────────────────┐
│              Trust Boundary                  │
│                                             │
│  Browser ──────► API Server                 │
│                  │                           │
│                  ├── No secrets in client    │
│                  ├── Zod validation          │
│                  ├── Rate limiting           │
│                  ├── Request signing         │
│                  │                           │
│                  ▼                           │
│              Database / Redis                │
│                  │                           │
│                  ├── No private keys         │
│                  ├── Parameterized queries   │
│                  ├── Encrypted secrets       │
│                  │                           │
│                  ▼                           │
│              External Providers              │
│                  │                           │
│                  ├── API key management      │
│                  ├── Retry with backoff      │
│                  ├── Circuit breaking        │
│                  └── Rate limit awareness    │
└─────────────────────────────────────────────┘
```

## Deployment Architecture (Future)

Phase 1 (Current): Local Docker Compose
- Single PostgreSQL instance
- Single Redis instance
- All services run locally via `pnpm dev`

Phase 2 (Future): Containerized
- Docker containers for each service
- Managed PostgreSQL (Supabase/Neon)
- Managed Redis (Upstash/Redis Cloud)

Phase 3 (Future): Kubernetes
- Horizontal pod autoscaling for workers
- Service mesh for inter-service communication
- Managed database with read replicas

## Technology Choices

| Concern | Choice | Reason |
|---------|--------|--------|
| Language | TypeScript | Type safety, shared schemas, ecosystem |
| Runtime | Node.js 20+ | Performance, native ESM, good async I/O |
| Monorepo | Turborepo | Fast builds, caching, good DX |
| Package Manager | pnpm | Fast, disk-efficient, strict |
| Web Framework | Next.js 15 | SSR, API routes, good ecosystem |
| API Framework | Fastify | Fast, schema-based, plugin system |
| Database | PostgreSQL 16 | Relational, JSON support, mature |
| ORM | Drizzle | Type-safe, SQL-like, lightweight |
| Cache/Queue | Redis + BullMQ | Fast, reliable job processing |
| Auth | Auth.js | Provider-neutral, well-maintained |
| Validation | Zod | Type-safe, composable, good errors |
| Telegram | grammY | Modern, typed, good middleware |
| Testing | Vitest + Playwright | Fast unit tests, E2E browser tests |
| Logging | Pino | Fast, structured, JSON output |
