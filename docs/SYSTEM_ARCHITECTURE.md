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
│  │ Access   │ Rate     │ Request   │ Zod      │ Structured   │  │
│  │ Boundary │ Limiting │ IDs       │ Validate │ Logging      │  │
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
- **Web App** (Next.js): Full-featured SPA with SSR for SEO. Handles data display and trading interactions in a local single-user workspace.
- **Telegram Bot**: Mobile-first interface for alerts, scanning, and quick actions. Uses grammY framework.
- **API Clients**: Future mobile apps, Discord bots, or third-party integrations.

### API Layer
- **Fastify**: Lightweight, fast HTTP server with schema-based validation.
- **Access boundary**: Personal production mutations and sensitive settings require a browser-entered write key; signed service tokens remain supported for trusted automation.
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

### Discovery and Ingestion Pipeline
```
DexScreener/Helius/RPC -> Indexer -> Market Observation -> Scanner
                                  -> Canonical Strategy Match -> Alert Queue -> Delivery Worker
Raw Chain Event -> Raw Event Queue -> Processor -> Same Strategy/Alert Path
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

## Deployment Architecture

Current target:
- Vercel hosts the Next.js web app.
- Railway hosts the Fastify API, PostgreSQL, Redis, and the always-on indexer container.
- The indexer can embed processor and alert workers to fit a small personal deployment.
- The API runs migrations before startup.
- Local Docker Compose remains available for development and self-hosting.

Kubernetes, service mesh, horizontal scaling, and read replicas are not current project requirements. Add them only if measured load justifies the operational cost.

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
| Access | Personal write key plus optional signed service tokens | No account UI while mutations fail closed |
| Validation | Zod | Type-safe, composable, good errors |
| Telegram | grammY | Modern, typed, good middleware |
| Testing | Vitest + Playwright | Fast unit tests, E2E browser tests |
| Logging | Pino | Fast, structured, JSON output |
