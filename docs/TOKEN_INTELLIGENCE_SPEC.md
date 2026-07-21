# Token Intelligence Specification

## Overview

Token intelligence analyzes tokens themselves for risk, quality, and opportunity signals. It complements wallet intelligence by evaluating the asset, not just the wallets involved.

## Token Risk Assessment

### Risk Factors
| Factor | Weight | Description |
|--------|--------|-------------|
| Deployer Risk | 20% | Deployer wallet history, classification |
| Liquidity Risk | 20% | LP amount, lock status, LP holder concentration |
| Holder Concentration | 15% | Top 10 holder percentage |
| Volume Quality | 10% | Wash trading indicators |
| Age Risk | 10% | Token age (newer = higher risk) |
| Contract Risk | 10% | Mint authority, freeze authority status |
| Bundle Risk | 10% | Percentage of supply bought in bundles |
| Social Risk | 5% | Presence/absence of social links |

### Risk Score (0-100)
- 0-30: Low risk
- 31-60: Medium risk
- 61-80: High risk
- 81-100: Critical risk

## Token Quality Metrics

### Market Metrics
- Market cap
- Fully diluted valuation (FDV)
- 24h volume
- Liquidity depth
- Price change (1h, 6h, 24h)
- Holder count

### Launch Metrics
- Initial liquidity
- Time since launch
- Launch velocity (trades per minute in first hour)
- First buyer count (unique wallets in first 5 minutes)
- Qualified wallet participation count

## Token Lifecycle

### Phases
1. **Creation**: Token minted, LP created
2. **Launch**: First trades occur
3. **Discovery**: Early buyers enter
4. **Growth**: Volume increases, holders grow
5. **Peak**: Maximum attention and volume
6. **Decline**: Volume drops, holders sell
7. **Stabilization** or **Death**: Either finds floor or goes to zero

### Phase Detection
- Based on volume, holder count, price trajectory
- Phase transitions are tracked
- Historical phase data used for scoring

## Token Scoring (Signal Score)

### Input Features
- Token age (minutes)
- Liquidity (USD)
- Volume (USD, 1h)
- Holder count
- Qualified wallet count
- Bundled supply estimate (%)
- Deployer risk estimate
- LP lock status
- Top holder concentration

### Output
```typescript
{
  score: number;           // 0-100
  confidence: number;      // 0-1
  rulesetVersion: string;  // e.g., "token-signal-v0.1.0"
  positiveFactors: FactorContribution[];
  negativeFactors: FactorContribution[];
  missingFeatures: string[];
  calculatedAt: string;    // ISO timestamp
}
```

### Factor Contributions
Each factor includes:
- Feature name
- Raw value
- Contribution to score (positive or negative)
- Weight used
- Confidence in this factor

## Launch Fingerprinting

### Fingerprint Components
- Deployer wallet hash
- Initial liquidity amount
- Launch time (hour of day)
- First buyer wallet hash
- LP program used
- Initial price

### Purpose
- Compare new launches to historical winners
- Detect copycat launches
- Identify serial deployers
- Match launch patterns to known scam templates

## Implementation Phases

### Phase 1 (Current): Foundation
- Token entity with basic fields
- Deterministic scoring with development features
- Factor contribution tracking
- Risk assessment with basic rules

### Phase 2: Live Analysis
- Real-time market data integration
- Deployer history analysis
- LP lock verification
- Wash trading detection

### Phase 3: Advanced Intelligence
- Launch fingerprinting
- Historical similarity matching
- ML-based risk prediction
- Social signal integration
