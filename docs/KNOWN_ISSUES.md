# Known Issues

## Phase 2 Reality Gaps

### KI-001: Product surfaces still lean on seeded development data
**Severity**: Medium
**Description**: The provider layer supports live integrations, but the main demo and dashboard flows still rely heavily on seeded records.
**Impact**: The app can look more complete than the end-to-end live-data path really is.
**Resolution**: Route scanner, token detail, dashboard, and alerts through the same live ingestion and enrichment pipeline.

### KI-002: Trading terminal remains read-only
**Severity**: Expected
**Description**: The trading UI exists, but quote retrieval, wallet connection, and execution are not enabled.
**Impact**: Users can inspect the interface but cannot complete trading workflows.
**Resolution**: Implement swap quote provider, wallet integration, simulation, and transaction submission.

### KI-003: Alerts service is not fully operational
**Severity**: Medium
**Description**: Alert records can be queried, but the dedicated alerts worker is still a stub and delivery channels are incomplete.
**Impact**: Local demos can show alerts in the database without proving a production-ready delivery path.
**Resolution**: Finish queue-driven alert generation and delivery workers, then add delivery retries and observability.

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

## Architecture Limitations

### KI-010: No production-grade queue orchestration yet
**Severity**: Medium
**Description**: The codebase defines queue and worker layers, but the full background-processing lifecycle is not yet productionized.
**Impact**: Operational behavior still depends on ad hoc development commands more than long-running workers.
**Resolution**: Complete queue consumers, retries, monitoring, and service lifecycle management.

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

### KI-021: Real-time streaming is not fully wired through the product
**Severity**: Medium
**Description**: Streaming provider abstractions exist, but the product does not yet expose a fully integrated real-time signal path.
**Impact**: New token detection and alert latency are still constrained by the current development workflow.
**Resolution**: Complete the transaction-stream ingestion path and connect it to scoring and alert generation.
