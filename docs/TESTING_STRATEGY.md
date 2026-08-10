# Testing Strategy

The CI workflow runs frozen dependency installation, repository linting, typechecking, unit tests, and the optimized web build on pushes to `main` and pull requests. Local validation must use the same commands before deployment.

## Test Levels

### Unit Tests (Vitest)
Fast, isolated tests for pure functions and business logic.

**Coverage targets:**
- Personal write-key request handling
- Score calculations
- Factor contributions
- Missing feature handling
- Strategy evaluation
- Telegram alert formatting
- Provider normalization
- Deep link generation
- Schema validation

### Integration Tests (Vitest)
Tests that verify component interactions with database and external systems.

**Coverage targets:**
- Development event ingestion
- Raw event persistence
- Token normalization
- Snapshot creation
- Signal creation
- Alert creation
- API endpoint responses

### Browser Tests (Playwright)
End-to-end tests that verify user-facing functionality.

**Coverage targets:**
- Application loads
- Local single-user access
- Dashboard renders correctly
- Scanner displays data
- Token page shows details
- Alerts page shows alerts
- Responsive navigation works
- Empty states render
- Error states render
- Keyboard navigation works
- Unlock, mutation rejection, and sensitive-settings protection work

## Test Organization

```
tests/
├── unit/              # Shared unit tests
│   ├── scoring/
│   ├── formatting/
│   └── validation/
├── integration/       # Shared integration tests
│   ├── api/
│   ├── ingestion/
│   └── processing/
└── e2e/               # Browser tests
    ├── app.spec.ts
    ├── scanner.spec.ts
    ├── token.spec.ts
    └── alerts.spec.ts
```

## Test Utilities

### Fixtures (`packages/testing/src/fixtures.ts`)
- Sample token events
- Sample wallet data
- Sample scores and signals
- Sample alerts

### Mocks (`packages/testing/src/mocks.ts`)
- Mock database client
- Mock provider implementations
- Mock queue
- Mock notification providers

### Helpers (`packages/testing/src/helpers.ts`)
- Database setup/teardown
- Test data insertion
- Cleanup utilities
- Assertion helpers

## Running Tests

```bash
# All tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests only
pnpm test:integration

# Browser tests only
pnpm test:e2e

# Tests for specific package
pnpm --filter @memecoin/scoring test
```

## Test Data Policy

- Tests use isolated test database (never production)
- Test data is deterministic (no random values without seed)
- Each test cleans up after itself
- Fixtures are versioned alongside schemas
- Mock providers return consistent, documented data

## Continuous Integration

Tests run on:
- Every push to main
- Every pull request
- Before deployment

Automated CI checks:
- Unit tests pass
- Type check passes
- Lint passes
- Build succeeds

Pre-deployment checks not yet fully automated:
- Integration tests pass against an isolated database and Redis
- Browser tests pass for desktop, mobile, unlock, filtering, and degraded states
