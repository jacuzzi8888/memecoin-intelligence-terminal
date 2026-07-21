# Scanner & Scoring Specification

## Overview

The scanner evaluates tokens in real-time against active strategies. When a token meets strategy criteria, a signal is generated and an alert is delivered.

## Signal Score

### Calculation
The signal score combines:
1. **Token intelligence score** (from Token Intelligence Spec)
2. **Wallet participation score** (qualified wallets involved)
3. **Timing score** (how early the signal is)
4. **Risk adjustment** (penalties for high-risk factors)

### Formula (Phase 1)
```
signal_score = 
  (token_score * 0.4) +
  (wallet_score * 0.3) +
  (timing_score * 0.2) +
  (100 - risk_penalty * 0.1)
```

Where:
- `token_score`: 0-100 from token intelligence
- `wallet_score`: 0-100 based on qualified wallet count and quality
- `timing_score`: 0-100 based on token age (earlier = higher)
- `risk_penalty`: 0-100 from token risk assessment

## Strategies

### Strategy Definition
```typescript
interface StrategyConfig {
  name: string;
  version: string;
  conditions: StrategyCondition[];
  alertThreshold: number;
  channels: NotificationChannel[];
  enabled: boolean;
}

interface StrategyCondition {
  field: string;       // e.g., "token_score", "wallet_count"
  operator: "gt" | "lt" | "eq" | "between";
  value: number | [number, number];
  weight: number;
}
```

### Default Strategies
1. **Alpha Alert**: High token score + multiple qualified wallets
2. **Early Entry**: Very new token + high wallet quality
3. **Volume Spike**: Unusual volume + positive risk factors
4. **Cohort Signal**: Multiple wallets from same cohort entering

## Scoring Pipeline

```
Token Event
→ Calculate token score (Token Intelligence)
→ Identify qualified wallets
→ Calculate wallet participation score
→ Calculate timing score (from token age)
→ Calculate risk penalty
→ Combine into signal score
→ Evaluate against strategies
→ If threshold met: create signal + alert
```

## Deduplication

- Each token can only trigger one alert per strategy per cooldown period
- Cooldown period is configurable per strategy (default: 1 hour)
- Duplicate detection uses token address + strategy ID + time window

## Alert Priority

| Priority | Score Range | Description |
|----------|-------------|-------------|
| Critical | 90-100 | Very high confidence signal |
| High | 75-89 | Strong signal |
| Medium | 60-74 | Moderate signal |
| Low | 40-59 | Weak signal, monitor only |
| Info | 0-39 | Below alert threshold |

## Implementation Phases

### Phase 1 (Current)
- Deterministic scoring with fixed weights
- Single default strategy
- Basic deduplication
- Alert creation and storage

### Phase 2
- Configurable strategies per user
- Multiple scoring rulesets
- Advanced deduplication
- Alert routing and prioritization

### Phase 3
- ML-enhanced scoring
- Strategy optimization from outcomes
- A/B testing of scoring versions
- Dynamic weight adjustment
