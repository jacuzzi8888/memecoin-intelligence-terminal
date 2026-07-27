# Known Issues

### KI-002: Trading terminal remains read-only
**Severity**: Expected
**Description**: The trading UI exists, but quote retrieval, wallet connection, and execution are not enabled.
**Impact**: Users can inspect the interface but cannot complete trading workflows.
**Resolution**: Implement swap quote provider, wallet integration, simulation, and transaction submission.

### KI-003: Live external delivery still depends on credentials
**Severity**: Medium
**Description**: Telegram and Discord delivery paths are implemented, but they require valid bot tokens or webhook destinations to deliver outside the development outbox.
**Impact**: Local demos without credentials fall back to the dev outbox and do not prove real external delivery.
**Resolution**: Configure real destination credentials and validate end-to-end delivery in the target environment.

### KI-004: Optional provider credentials gate the best data paths
**Severity**: Medium
**Description**: Helius and Birdeye-backed behavior depends on optional API keys.
**Impact**: Local environments without those keys fall back to weaker or seeded behavior.
**Resolution**: Configure `HELIUS_API_KEY` and `BIRDEYE_API_KEY`, then validate the live flows against real traffic.

### KI-005: Workspace tests were previously noisy
**Severity**: Resolved in current workspace
**Description**: `pnpm test:unit` used to fail when a package had no local test files.
**Impact**: Repo-wide test status was misleading.
**Resolution**: Package `vitest` scripts now use `--passWithNoTests`.

### KI-006: API route coverage is still selective
**Severity**: Low
**Description**: Route-level tests now cover scanner, token detail, alerts, dashboard, watchlists, wallets, settings, and wallet-sync queueing happy paths, but pagination edges and broader negative-path coverage are still incomplete.
**Impact**: Regressions in other endpoints or more complex query behavior could still slip through without direct route tests.
**Resolution**: Expand API tests to cover status, dev ingestion, pagination edges, and negative-path error handling.

## Architecture Limitations

### KI-011: No production auth configuration
**Severity**: Low
**Description**: The codebase is prepared for auth, but external OAuth providers are not configured.
**Impact**: The app is not production-ready for multi-user authentication.
**Resolution**: Configure real auth providers and verify secure session handling.

### KI-012: Query and caching strategy is still early-stage
**Severity**: Low
**Description**: The API currently favors straightforward database reads over an optimized caching strategy.
**Impact**: Performance may degrade once the dataset grows.
**Resolution**: Add targeted indexes, query review, and Redis caching for hot paths.

## Operational Notes

### KI-020: Public Solana RPC can still rate-limit aggressively
**Severity**: Medium
**Description**: Public RPC endpoints may return 429 responses during heavier discovery or parsing workloads.
**Impact**: Discovery and enrichment can become unreliable without provider-backed access.
**Resolution**: Prefer Helius-backed RPC for repeatable development and production usage.
