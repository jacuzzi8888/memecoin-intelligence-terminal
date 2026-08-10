# Scanner and Scoring Specification

## Separation of Concerns

The scanner and alert system are intentionally separate:

1. Discovery observes current tokens from configured sources.
2. Every processed token may receive a `system-market-scan` observation for ranking and research.
3. The canonical strategy engine evaluates active versioned strategies.
4. Only a matched strategy can create a strategy signal and alert.

This allows broad market coverage without converting every observed token into a notification.

## Discovery Loop

- Default schedule: 15 seconds
- Maximum candidates per pass: 150
- Concurrent passes: prohibited by an in-process overlap guard
- Sources: Helius token discovery/stream when available, DexScreener Solana profiles, DexScreener boosts, then RPC fallback
- A faster schedule does not imply complete launch coverage; source coverage must be measured separately

## Signal Score

Current ruleset: `token-signal-v0.2.0`

```text
observed_quality = sum(signed_weighted_contributions) / sum(observed_weights)
confidence = observed_feature_count / expected_feature_count
signal_score = observed_quality * confidence + 50 * (1 - confidence)
```

- Factors include liquidity, qualified wallets, volume, holder count, age, holder concentration, bundled supply, and deployer risk.
- Negative contributions remain negative.
- Missing evidence lowers confidence and pulls an observed score toward the neutral prior.
- Completely missing evidence returns zero.
- The score is a deterministic ranking value, not a probability of profit or trading recommendation.

## Risk Score

Current ruleset: `token-risk-v0.2.0`

- Risk uses mint/freeze authority, liquidity, LP posture, holder concentration, bundling, deployer behavior, and qualified-wallet evidence.
- Missing security evidence reduces risk confidence.
- Low-confidence assessments return `unknown` unless observed evidence already proves high or critical risk.
- Opportunity score and risk score are independent. The UI must never infer risk from alert priority or opportunity score.

## Strategy Evaluation

```typescript
interface StrategyConfig {
  id: string;
  name: string;
  version: string;
  isActive: boolean;
  conditions: StrategyCondition[];
  alertThreshold: number;
  cooldownMinutes: number;
  channels: string[];
  priority: "critical" | "high" | "medium" | "low";
}
```

- Each configured condition contributes its weight only when it matches.
- `alertThreshold` is applied to weighted condition coverage.
- Empty condition sets never match.
- Legacy minimum fields are normalized into strict required conditions with a threshold of 100.
- Discovery, raw-event processing, and historical replay use the same engine and field semantics.

## Persistence

```text
Discovery -> Token/Launch/Snapshot
          -> Market Observation -> Scanner
          -> Strategy Evaluation -> Strategy Signal -> Alert -> Delivery Queue
```

- Market observations use strategy ID `system-market-scan` and do not create alerts.
- A strategy signal stores the evaluation details in metadata.
- The scanner reads only market observations, preventing duplicate strategy rows from inflating candidate counts.

## Deduplication

- Market observations are re-emitted only after the refresh window and a material score or priority change.
- Strategy signals respect the greater of the global refresh window and strategy cooldown.
- A new strategy signal additionally requires a score delta of at least five or a priority change.
- Invalid legacy pending alerts are marked `superseded` by migration `0004_sudden_baron_zemo.sql`.

## Alert Delivery and Outcomes

- Alert priority comes from the matched strategy, not a hard-coded score range.
- The alert worker consumes BullMQ jobs and performs a recovery pass on startup.
- No eligible destination is recorded as a skipped route rather than left pending forever.
- Outcomes are measured at 5m, 15m, 1h, 4h, and 24h.
- Strategy reports include win rate, average return, MAE, maximum return, failure classes, coverage gaps, and manual review evidence.

## Scanner Filters

The API supports text, timeframe, score, liquidity range, market-cap range, 1h/24h volume, pair-age bounds, source, discovery source, priority, wallet count, qualified-wallet count, wallet-evidence presence, bundler exclusion, deduplication, sorting, and pagination.
