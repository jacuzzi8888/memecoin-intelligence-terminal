# Wallet Intelligence Specification

## Overview

Wallet intelligence is the core differentiator. The system identifies wallets that consistently profit from memecoin trading, classifies them, and monitors their activity.

## Wallet Classification

### Labels
| Label | Description | Confidence Required |
|-------|-------------|-------------------|
| `legitimate_trader` | Consistently profitable, organic behavior | High |
| `early_buyer` | Buys tokens before mainstream attention | Medium |
| `bot` | Automated trading patterns | High |
| `insider` | Pre-funded, buys before public launch | High |
| `bundler` | Uses bundled transactions for sniping | High |
| `farmer` | Part of coordinated farm network | Medium |
| `whale` | Large position sizes relative to market | Low |
| `sniper` | Fast entry, fast exit, high frequency | Medium |
| `diamond_hands` | Long hold times, high conviction | Medium |
| `paper_hands` | Short hold times, quick exits | Medium |

### Classification Rules
- Bot detection: Transaction frequency > threshold, consistent timing patterns
- Insider detection: Funded within 24h of launch, buys in first N transactions
- Bundler detection: Multiple wallets funded from same source, coordinated buys
- Farm detection: Cluster of wallets with similar behavior patterns

## Wallet Scoring

### Score Components (0-100)
| Component | Weight | Description |
|-----------|--------|-------------|
| Profitability | 30% | Realized + unrealized PnL |
| Win Rate | 20% | Percentage of profitable trades |
| Consistency | 15% | Variance in returns |
| Hold Time | 10% | Average position duration |
| Diversity | 10% | Number of tokens traded |
| Recency | 10% | Activity in last 7/30/90 days |
| Risk | 5% | Exposure to known rugs/scams |

### Score Versioning
- Each score includes `ruleset_version`
- Score changes when ruleset version changes
- Historical scores preserved for backtesting
- Recalculation can be triggered on demand

## Wallet Cohorts

### Definition
A cohort is a named group of qualified wallets that meet specific criteria.

### Qualification Criteria
1. **Minimum trades**: >= 50 completed trades
2. **Minimum PnL**: Positive realized PnL over 30 days
3. **Win rate**: >= 55% profitable trades
4. **Classification**: Must be `legitimate_trader` or `early_buyer`
5. **Activity**: Active within last 7 days
6. **No flags**: Not classified as bot, insider, bundler, or farmer

### Dynamic Membership
- Cohort membership is recalculated periodically
- Wallets can be promoted or demoted
- Membership changes are tracked with timestamps

## Wallet Relationships

### Types
| Type | Description | Detection Method |
|------|-------------|-----------------|
| `funding` | Wallet A funded Wallet B | SOL transfer tracing |
| `co_buy` | Both bought same token within N minutes | Transaction timing |
| `cluster` | Part of same behavioral cluster | ML clustering |
| `counterparty` | Sold to each other | Swap analysis |

### Confidence
- Each relationship has a confidence score (0-1)
- Relationships below threshold are not stored
- High-confidence relationships trigger alerts

## Implementation Phases

### Phase 1 (Current): Foundation
- Wallet entity schema
- Basic label assignment (dev data)
- Simple scoring with development features
- Cohort definition schema

### Phase 2: Live Classification
- Real wallet history ingestion
- Bot detection algorithms
- Insider detection algorithms
- Bundler detection algorithms

### Phase 3: Advanced Intelligence
- Wallet clustering
- Funding relationship tracing
- Behavioral pattern recognition
- ML-based classification
