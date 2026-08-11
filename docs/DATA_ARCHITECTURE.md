# Data Architecture

## Core Principle

**Raw facts are append-only with provider provenance. Derived intelligence is reproducible from raw or normalized facts.**

## Data Categories

### 1. Raw Facts (Append-Only)
Blockchain events and provider responses stored exactly as received.

| Entity | Source | Retention |
|--------|--------|-----------|
| `raw_provider_events` | Helius, Birdeye, RPC | Permanent |
| `raw_token_events` | Token creation logs | Permanent |
| `raw_swap_events` | DEX swap logs | Permanent |
| `raw_transfer_events` | Token transfer logs | Permanent |
| `raw_pool_events` | Liquidity pool events | Permanent |

### 2. Normalized Entities
Clean, provider-agnostic domain entities derived from raw facts.

| Entity | Description |
|--------|-------------|
| `tokens` | Canonical token records |
| `token_launches` | Token creation/launch events |
| `markets` | Trading pairs / liquidity pools |
| `wallets` | Canonical wallet records |
| `wallet_trades` | Normalized swap/trade records |
| `wallet_positions` | Current and historical positions |
| `token_holder_snapshots` | Ranked token-owner balances at an observed point in time |

### 3. Derived Intelligence
Calculated values that can be reproduced from raw/normalized data.

| Entity | Description | Versioned |
|--------|-------------|-----------|
| `wallet_performance_snapshots` | PnL, win rate, avg hold time | Yes |
| `wallet_labels` | Classification labels | Yes |
| `wallet_relationships` | Co-entry, repeat-deployer, and eventually funding evidence | Yes |
| `wallet_cohort_memberships` | Elite wallet group membership | Yes |
| `token_snapshots` | Market metrics at point in time | Yes |
| `market_snapshots` | Pool metrics at point in time | Yes |
| `token_risk_scores` | Token risk assessment | Yes |
| `wallet_scores` | Wallet quality assessment | Yes |
| `signal_scores` | Opportunity signal assessment | Yes |

### 4. Operational Data
System state for monitoring, debugging, and reliability.

| Entity | Description |
|--------|-------------|
| `data_providers` | Registered provider configurations |
| `ingestion_checkpoints` | Resume points for data ingestion |
| `background_jobs` | Job execution records |
| `processing_failures` | Failed processing records |
| `feature_versions` | Calculation version registry |

## Data Flow Diagram

```
                    SOLANA BLOCKCHAIN
                          │
                          ▼
┌─────────────────────────────────────────────┐
│           RAW DATA LAYER                    │
│                                             │
│  raw_provider_events                        │
│  raw_token_events                           │
│  raw_swap_events                            │
│  raw_transfer_events                        │
│  raw_pool_events                            │
│                                             │
│  Properties:                                │
│  - Append-only                              │
│  - Provider provenance (provider, raw_json) │
│  - Ingestion timestamp                      │
│  - Processing status                        │
└──────────────────┬──────────────────────────┘
                   │ Processor
                   ▼
┌─────────────────────────────────────────────┐
│         NORMALIZED LAYER                    │
│                                             │
│  tokens, token_launches, markets            │
│  token_holder_snapshots                     │
│  wallets, wallet_trades, wallet_positions   │
│                                             │
│  Properties:                                │
│  - Provider-agnostic                        │
│  - Deduplicated                             │
│  - Enriched (metadata, labels)              │
│  - Indexed for queries                      │
└──────────────────┬──────────────────────────┘
                   │ Intelligence Engine
                   ▼
┌─────────────────────────────────────────────┐
│         INTELLIGENCE LAYER                  │
│                                             │
│  wallet_scores, wallet_performance          │
│  wallet_labels, wallet_relationships        │
│  token_risk_scores, signal_scores           │
│                                             │
│  Properties:                                │
│  - Versioned (ruleset_version)              │
│  - Reproducible from normalized data        │
│  - Include factor contributions             │
│  - Include confidence metrics               │
│  - Timestamped                              │
└──────────────────┬──────────────────────────┘
                   │ Strategy Engine
                   ▼
┌─────────────────────────────────────────────┐
│         SIGNAL LAYER                        │
│                                             │
│  signals, signal_factors                    │
│  alerts, alert_deliveries                   │
│  alert_outcomes                             │
│                                             │
│  Properties:                                │
│  - Strategy versioned                       │
│  - Explainable factors                      │
│  - Delivery tracked                         │
│  - Outcome recorded                         │
└─────────────────────────────────────────────┘
```

## Versioning Strategy

All derived intelligence includes:
- `ruleset_version`: Semantic version of calculation rules
- `feature_version`: Version of feature extraction
- `calculated_at`: Timestamp of calculation
- `input_hash`: Hash of input data for reproducibility

When rules change:
1. New version is deployed
2. Old scores remain (historical record)
3. New calculations use new version
4. Recalculation can be triggered for affected entities

## Data Retention

| Category | Retention | Reason |
|----------|-----------|--------|
| Raw events | Permanent | Audit trail, reproducibility |
| Normalized entities | Permanent | Core domain data |
| Intelligence snapshots | 90 days rolling | Performance, recent analysis |
| Latest intelligence | Permanent | Current state |
| Operational data | 30 days | Debugging, monitoring |
| Alert outcomes | Permanent | Strategy feedback loop |

## Consistency Model

- **Raw data**: Eventual consistency (append-only, no conflicts)
- **Normalized data**: Strong consistency within single processing step
- **Intelligence**: Eventual consistency (recalculated asynchronously)
- **Signals/Alerts**: Strong consistency (single-writer pattern per entity)

## Query Patterns

### Hot Path (Sub-second)
- Token lookup by address
- Wallet lookup by address
- Latest score for token/wallet
- Recent alerts for user
- Scanner results (paginated)

### Warm Path (Seconds)
- Historical scores for token/wallet
- Wallet performance time series
- Cohort member lists
- Strategy evaluation results

### Cold Path (Minutes/Hours)
- Full wallet history
- Backtesting queries
- Cluster analysis
- Graph exploration

## Contract Analysis Flow

1. `POST /api/v1/tokens/:address/analyze` creates a BullMQ `token-analysis` job.
2. The indexer resolves token metadata and market data, resolves the owners of the 20 largest token accounts, and expands observed wallet history.
3. Deterministic rules persist co-entry, repeat co-entry, and repeat-deployer relationships with source, confidence, timestamps, and supporting token addresses.
4. `GET /api/v1/tokens/:address/graph` returns current holders, top observed traders, earliest observed buyers, a two-hop graph, deployment history, and explicit coverage gaps.
5. Direct funding evidence remains unavailable until native-transfer tracing is implemented; it is never inferred from co-entry.
