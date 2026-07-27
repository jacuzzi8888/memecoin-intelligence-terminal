# Agent Instructions

## Before Making Any Changes

1. **Read project documentation** in `docs/` directory
2. **Check `CURRENT_STATE.md`** for current phase and status
3. **Check `IMPLEMENTATION_PLAN.md`** for planned work
4. **Work one approved phase at a time** - do not skip ahead
5. **Understand the architecture** in `SYSTEM_ARCHITECTURE.md`

## Core Rules

### Documentation
- Update `CURRENT_STATE.md` after completing work
- Update `IMPLEMENTATION_PLAN.md` when roadmap status changes or phase progress shifts materially
- Update `DECISIONS.md` when making architecture decisions
- Update `KNOWN_ISSUES.md` when discovering issues
- Update `CHANGELOG.md` when completing features
- Never claim mocked features are complete

### Code Quality
- Run `pnpm typecheck` before marking work complete
- Run `pnpm lint` before marking work complete
- Run `pnpm test` before marking work complete
- Keep provider-specific code behind interfaces
- Keep business logic out of React components
- Keep scoring logic deterministic and testable

### Database
- Never delete or modify existing migration files
- Always create new migrations for schema changes
- Document schema decisions in `DATABASE_SCHEMA.md`
- Preserve append-only nature of raw data tables

### Security
- **NEVER expose secrets** in code, logs, or error messages
- **NEVER store private keys** in the database
- **NEVER use production funds** or real wallets
- **NEVER execute live trades** without explicit user approval
- Keep development-only routes disabled in production
- Validate all external inputs with Zod

### Scoring
- Record score and schema versions
- Include factor contributions in all scores
- Handle missing data explicitly (never fabricate)
- Keep scoring outside the UI layer
- Make scoring independently testable

### Testing
- Write tests for new functionality
- Update tests when behavior changes
- Do not disable failing tests
- Use fixtures from `packages/testing`

## Architecture Boundaries

### Provider Abstraction
All external data sources must use provider interfaces:
- `BlockchainDataProvider`
- `TokenDiscoveryProvider`
- `MarketDataProvider`
- `TransactionStreamProvider`
- `WalletHistoryProvider`
- `SwapQuoteProvider`
- `SwapExecutionProvider`
- `NotificationProvider`

Never call Helius, Birdeye, Jupiter, or other providers directly from business logic.

### Data Flow
```
Raw events -> Normalized entities -> Derived intelligence -> Signals -> Alerts
```

Maintain this separation. Raw data is append-only. Intelligence is reproducible.

### Versioning
All derived intelligence includes:
- `rulesetVersion`
- `calculatedAt`
- Factor contributions

### UI Layer
- React components for display only
- Business logic in packages/services
- API calls through typed client functions
- No direct database access from components

## What NOT To Build Ahead Of The Roadmap

Do not implement later-phase work unless it is explicitly requested and consistent with the active roadmap phase:
- Live paid-provider ingestion
- Complete wallet PnL calculation
- Advanced wallet clustering
- Historical backtesting engine
- Machine learning models
- Automated copy trading
- Live order execution
- Custodial wallet storage
- Cross-chain support
- WhatsApp production delivery
- Advanced social sentiment
- Native mobile applications
- Complex graph visualization

Create interfaces and documentation for these when helpful, but do not present them as completed product capabilities.

## Common Commands

```bash
# Development
pnpm dev                    # Start all services
pnpm dev:ingest-sample      # Ingest sample token event

# Database
pnpm db:generate            # Generate migration from schema changes
pnpm db:migrate             # Apply migrations
pnpm db:seed                # Seed development data
pnpm db:studio              # Open Drizzle Studio

# Validation
pnpm typecheck              # Type check all packages
pnpm lint                   # Lint all packages
pnpm test                   # Run all tests
pnpm test:unit              # Unit tests only
pnpm test:integration       # Integration tests only
pnpm test:e2e               # Browser tests only

# Build
pnpm build                  # Build all packages
```
