# Current State

**Last Updated**: 2026-08-11
**Current Phase**: Phase 2.7, operator value and contract intelligence
**Deployment State**: Live. The web app runs on Vercel and the API, indexer, PostgreSQL, and Redis run on Railway under the `jacuzzi8888` project accounts. Migrations `0004` and `0005`, personal write access, embedded workers, and 15-second discovery are active in production.

## Production Endpoints

- Web: `https://memecoin-intelligence-terminal-inky.vercel.app`
- API: `https://api-production-f1a50.up.railway.app`
- API health: `https://api-production-f1a50.up.railway.app/health`

## Product State

- The Aegis Terminal UI covers dashboard, scanner, research, token dossiers, alerts, wallets, watchlists, strategies, terminal preparation, and settings.
- Market discovery polls every 15 seconds by default and processes up to 150 candidates per pass with overlap protection.
- Every discovered token receives a deduplicated `system-market-scan` observation so the scanner can show the broad observed market.
- Alerts are separate from market observations. An alert is created only when an active versioned strategy actually matches.
- Scanner filters support timeframe, liquidity, market cap, volume, pair age, source, discovery source, priority, wallet evidence, qualified wallets, bundler exclusion, score, and text search.
- Wallet Intelligence filters the discovered wallet set by score band, PnL band, and legitimacy, with score, PnL, win-rate, and recency ranking.
- Research is an evidence workbench backed by current scanner observations, not a placeholder.
- The deployed workspace adds queued contract-address analysis with current holder snapshots, observed early-buyer ordering, top-trader ranking, two-hop wallet relationships, and repeat deployer-circle evidence. Coverage is labeled per evidence source and does not imply complete genesis history or funding proof.
- Dashboard, scanner, research, token, wallet, alert, watchlist, strategy, terminal, and settings surfaces now form one deep-linked investigation workflow instead of isolated pages.
- The dashboard prioritizes operator queues and verified evidence; the previous decorative chart has been removed.
- Scanner live refresh can be paused, saved views can be restored, result totals and pagination are explicit, and refresh failures retain the last verified ranking.
- Settings uses guided Aegis controls for refresh, scanner timeframe, alert delivery, destinations, and write access; raw JSON configuration is no longer exposed.
- Token and terminal surfaces do not draw synthetic price charts or show fabricated quotes, fees, TPS, gas, or latency.
- Terminal is an explicit Phase 3 readiness checklist. Buy, sell, signing, simulation, and transaction submission controls are not presented as live.

## Intelligence State

- `token-signal-v0.2.0` produces non-saturated signed scores with missing-data confidence penalties.
- `token-risk-v0.2.0` returns `unknown` when evidence coverage is insufficient rather than treating missing evidence as safety.
- Strategy evaluation uses one canonical engine in discovery, raw-event processing, and backtesting.
- Legacy strategy fields are normalized into strict all-required conditions. Empty strategies cannot match.
- Signal refreshes require a cooldown plus a material score or priority change, reducing duplicate rows and alerts.
- Alert outcomes are measured on 5m, 15m, 1h, 4h, and 24h windows, including 24h adverse excursion and maximum return.
- Strategy graduation remains blocked until enough completed outcomes, wallet coverage, and manual reviews exist.

## Runtime State

- Fastify API, PostgreSQL, Redis/BullMQ, indexer, processor, wallet worker, token-analysis worker, and alert worker are implemented.
- The always-on indexer can embed the processor and alert consumer for a low-cost single-service deployment.
- Production wallet-sync and wallet-discovery automation are paused while free-provider capacity is reserved for live market discovery and targeted contract analysis; manual sync and CA analysis remain available.
- DexScreener discovery lists are cached with stale fallback and automatic `429` backoff. Token pair lookups are deduplicated and batched in groups of 30.
- Alert delivery performs a recovery pass on startup, consumes queue jobs, and records delivered, skipped, or failed destinations.
- Alert outcome backfill runs every 15 minutes by default.
- API status reports data freshness, pending alerts, queue depth, dead letters, and persisted entity counts.
- Migration `0005_fantastic_avengers.sql` adds append-only token-holder snapshots and wallet-relationship indexes and is applied in production.
- Database migration `0004_sudden_baron_zemo.sql` adds query indexes, the market observation strategy, corrected strategy configs, and supersedes invalid legacy alerts.
- The container runs as a non-root user and supports `api`, `indexer`, `processor`, and `alerts` roles.

## Access Model

- This is a personal app and has no account sign-in flow.
- Public market reads remain available.
- When `API_WRITE_TOKEN` is configured, every mutation requires `x-aegis-write-key` or a valid signed service token.
- Settings and notification destination reads also require the personal key.
- The key is entered in Settings and stored only in that browser's local storage. It is not included in the web bundle.
- Production personal mode fails closed at startup if `API_WRITE_TOKEN` is absent.

## Data Sources

- DexScreener provides current profiles, boosts, pair metadata, and fallback market data.
- Helius provides token metadata, stream events, and wallet history when configured and available. Current holder ranking uses a paced public Solana RPC fallback, with a public mainnet RPC batch for supply and owner resolution.
- Birdeye enriches market data when a key is configured.
- The current free discovery set is not a complete firehose of every Solana token launch. Coverage must be measured rather than inferred from poll frequency.

## Validation Snapshot

Verified in the current workspace:

- API, web, indexer, processor, database, and intelligence TypeScript checks
- Repository-wide ESLint checks, including Next.js core web vitals and React hooks
- API unit tests, including personal write access
- API wallet-filter tests covering trusted/profitable and flagged/losing classifications
- Intelligence unit tests, including strict strategy and uncertainty-aware risk behavior
- Indexer unit tests, including market observation without false alerts
- Web unit tests for personal-key request handling
- Optimized Next.js production build for all 13 routes
- CI workflow for frozen install, lint, typecheck, unit tests, and web build

Verified in production on 2026-08-11:

- Railway API health returned PostgreSQL and Redis `up`.
- Six consecutive indexer passes processed 57 live events each with zero rate-limit, batch-failure, or error-level log events.
- Production scanner returned current DexScreener observations with varied signal scores, current market fields, pair ages, and wallet evidence.
- Unauthenticated mutations returned `401`; the saved personal key verified successfully and an authorized mainnet live scan reported healthy chain and market providers.
- The Vercel production build completed all 13 routes and was promoted to the stable web alias.
- Wallet Intelligence score, PnL, legitimacy, and ranking controls were deployed and verified against the production API and web surface.
- The operator-workflow rebuild was deployed to the stable Vercel alias and browser-verified across Dashboard, Scanner, Research, Alerts, Wallets, Strategies, Terminal, and Settings with no application console errors.
- The live dashboard exposed 457 observed tokens, 118 ranked observations, 370 active wallets, varied scores, fresh timestamps, and 24 strategy alerts awaiting review at verification time.
- Scanner liquidity filtering was corrected to evaluate the latest rendered market snapshot. The production `$15k-$50k` request returned 20 matches with zero out-of-range rows, and the browser showed the same 20-match result.
- Wallet PnL filtering returned 109 profitable wallets from 374 persisted wallets at verification time.
- Terminal rendered fresh market snapshots and its Phase 3 readiness gate while exposing zero Buy or Sell controls.
- Local responsive browser verification confirmed keyboard access to all seven timeframe options, persistent degraded-state controls, visible mobile navigation, and no page-level scanner overflow.
- The production CA-analysis job completed for `8Fs2YLsayR4awLB79nMM3QCpG3pqvcAGP7hHb8fX4L2G`: 20 holders, 22 observed traders, 20 earliest observed buyers, and 24 graph nodes. Coverage reported `top_20`, `indexed_and_observed`, `no_relationships_observed`, and `unavailable` for funding.
- The Vercel token dossier rendered the same live evidence, custom Aegis UI, holder links, buyer ordering, graph map, and Phase 3 execution lock with HTTP 200 and no visible application error.

## Remaining Gates

- Enter the saved personal key in Settings for each browser that will perform mutations; read-only market data remains public.
- Review and retry or supersede the existing wallet-sync dead letters after confirming their provider failure causes; scheduled wallet sync/discovery is intentionally paused until provider capacity is available.
- Accumulate enough fresh wallet-enriched snapshots and reviewed alert outcomes to evaluate strategy edge.
- Verify contract analysis across additional fresh and previously indexed contracts, including provider-failure and partial-coverage cases.
- Implement direct funding-source evidence. Co-entry and repeat-deployer links are useful behavioral evidence but are not funding proof.
- Improve launch coverage beyond DexScreener profiles/boosts if near-firehose coverage is required.
- Add repeatable browser tests for the core investigation flow, responsive layouts, write unlock, and degraded-data retention.
- Complete API/database performance and load testing after real dataset growth is observed.
- Start final Phase 3 only after the evidence gate passes.
