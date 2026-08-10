import { calculateSignalScore } from "../scoring/index.js";
import { calculateTokenRiskScore } from "../token-risk/index.js";
import { StrategyEngine, type StrategyConfig, type StrategyEvaluationInput } from "../strategy-engine/index.js";

export interface BacktestSnapshot {
  tokenAddress: string;
  snapshotAt: Date;
  firstSeenAt: Date | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume1hUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  holderCount: number | null;
  walletCount: number | null;
  qualifiedWalletCount: number | null;
  cohortEntryCount: number | null;
  cohortQualityScore: number | null;
  walletEvidenceAvailable: boolean;
}

export interface BacktestOptions {
  horizonMinutes: number;
  maxEntriesPerToken?: number;
  reviewEvidence?: {
    totalAlerts: number;
    reviewedAlerts: number;
    falsePositiveRate: number | null;
  };
}

export const EVIDENCE_GATE_THRESHOLDS = {
  minimumCompletedOutcomes: 30,
  minimumWinRate: 0.55,
  minimumAverageReturnPct: 0,
  maximumWorstMaePct: -35,
  minimumReviewedAlerts: 10,
  maximumFalsePositiveRate: 0.4,
} as const;

export interface BacktestEntry {
  tokenAddress: string;
  detectedAt: string;
  score: number;
  confidence: number;
  returnPct: number | null;
  maePct: number | null;
  maxReturnPct: number | null;
  outcomeAt: string | null;
}

export interface BacktestResult {
  strategyId: string;
  strategyName: string;
  strategyVersion: string;
  horizonMinutes: number;
  snapshotCount: number;
  signalsEvaluated: number;
  entries: number;
  completed: number;
  pending: number;
  winRate: number | null;
  averageReturnPct: number | null;
  averageMaePct: number | null;
  worstMaePct: number | null;
  averageMaxReturnPct: number | null;
  failureClasses: {
    winner: number;
    no_follow_through: number;
    deep_drawdown: number;
    incomplete: number;
  };
  coverage: {
    replayableFields: string[];
    unavailableFields: string[];
    fieldCoverage: Record<string, { observed: number; total: number }>;
    walletEvidenceCoveragePct: number | null;
  };
  evidenceGate: {
    eligible: boolean;
    reasons: string[];
    thresholds: typeof EVIDENCE_GATE_THRESHOLDS;
    reviewEvidence: {
      totalAlerts: number;
      reviewedAlerts: number;
      falsePositiveRate: number | null;
    } | null;
  };
  sampleEntries: BacktestEntry[];
}

const REPLAYABLE_FIELDS = new Set([
  "token_score",
  "risk_level",
  "liquidity_usd",
  "volume_1h_usd",
  "volume_24h_usd",
  "volume_to_liquidity_ratio",
  "holder_count",
  "token_age_minutes",
  "market_cap_usd",
  "wallet_count",
  "qualified_wallet_count",
  "cohort_entry_count",
  "cohort_quality_score",
]);

function finiteNumber(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildEvaluationInput(snapshot: BacktestSnapshot): StrategyEvaluationInput {
  const liquidity = finiteNumber(snapshot.liquidityUsd);
  const volume1h = finiteNumber(snapshot.volume1hUsd);
  const tokenAgeMinutes = snapshot.firstSeenAt
    ? Math.max(0, (snapshot.snapshotAt.getTime() - snapshot.firstSeenAt.getTime()) / 60_000)
    : null;
  const tokenScore = calculateSignalScore({
    tokenAge: tokenAgeMinutes,
    liquidityUsd: liquidity,
    volume1hUsd: volume1h,
    holderCount: finiteNumber(snapshot.holderCount),
    qualifiedWalletCount: finiteNumber(snapshot.qualifiedWalletCount),
    bundledSupplyPct: null,
    deployerRisk: null,
    topHolderConcentration: null,
    lpLocked: null,
  });
  const risk = calculateTokenRiskScore({
    tokenAgeMinutes: tokenAgeMinutes ?? 0,
    liquidityUsd: liquidity,
    volume1hUsd: volume1h,
    holderCount: finiteNumber(snapshot.holderCount),
    bundledSupplyPct: null,
    deployerRisk: null,
    topHolderConcentration: null,
    lpLocked: null,
  });

  return {
    token_score: tokenScore.score,
    risk_level: risk.riskScore,
    liquidity_usd: liquidity,
    volume_1h_usd: volume1h,
    volume_24h_usd: finiteNumber(snapshot.volume24hUsd),
    volume_to_liquidity_ratio: liquidity && volume1h !== null ? volume1h / liquidity : null,
    holder_count: finiteNumber(snapshot.holderCount),
    token_age_minutes: tokenAgeMinutes,
    market_cap_usd: finiteNumber(snapshot.marketCapUsd),
    wallet_count: finiteNumber(snapshot.walletCount),
    qualified_wallet_count: finiteNumber(snapshot.qualifiedWalletCount),
    cohort_entry_count: finiteNumber(snapshot.cohortEntryCount),
    cohort_quality_score: finiteNumber(snapshot.cohortQualityScore),
  };
}

function metricValue(snapshot: BacktestSnapshot) {
  const price = finiteNumber(snapshot.priceUsd);
  if (price !== null && price > 0) return { metric: "priceUsd", value: price };
  const marketCap = finiteNumber(snapshot.marketCapUsd);
  if (marketCap !== null && marketCap > 0) return { metric: "marketCapUsd", value: marketCap };
  return null;
}

function percentChange(baseline: number, value: number) {
  return ((value - baseline) / baseline) * 100;
}

function measureOutcome(entry: BacktestSnapshot, future: BacktestSnapshot[], horizonMinutes: number) {
  const baseline = metricValue(entry);
  if (!baseline) return null;

  const targetAt = entry.snapshotAt.getTime() + horizonMinutes * 60_000;
  const path = future
    .filter((snapshot) => snapshot.snapshotAt.getTime() > entry.snapshotAt.getTime() && snapshot.snapshotAt.getTime() <= targetAt)
    .map((snapshot) => ({ snapshot, metric: metricValue(snapshot) }))
    .filter((item): item is { snapshot: BacktestSnapshot; metric: { metric: string; value: number } } => item.metric?.metric === baseline.metric);
  const outcome = path.find((item) => item.snapshot.snapshotAt.getTime() >= targetAt);
  if (!outcome) return null;

  const returns = path.map((item) => percentChange(baseline.value, item.metric.value));
  return {
    returnPct: percentChange(baseline.value, outcome.metric.value),
    maePct: Math.min(0, ...returns),
    maxReturnPct: Math.max(...returns),
    outcomeAt: outcome.snapshot.snapshotAt.toISOString(),
  };
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function replayStrategy(
  strategy: StrategyConfig,
  snapshots: BacktestSnapshot[],
  options: BacktestOptions,
): BacktestResult {
  const horizonMinutes = Math.min(Math.max(options.horizonMinutes, 5), 7 * 24 * 60);
  const engine = new StrategyEngine();
  const ordered = [...snapshots].sort((a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime());
  const byToken = new Map<string, BacktestSnapshot[]>();
  for (const snapshot of ordered) {
    const tokenSnapshots = byToken.get(snapshot.tokenAddress) ?? [];
    tokenSnapshots.push(snapshot);
    byToken.set(snapshot.tokenAddress, tokenSnapshots);
  }

  const fields = [...new Set(strategy.conditions.map((condition) => condition.field))];
  const fieldCoverage = Object.fromEntries(fields.map((field) => {
    const observed = ordered.filter((snapshot) => buildEvaluationInput(snapshot)[field] !== null).length;
    return [field, { observed, total: ordered.length }];
  }));
  const unavailableFields = fields.filter((field) =>
    !REPLAYABLE_FIELDS.has(field) || fieldCoverage[field]?.observed === 0,
  );
  const entries: BacktestEntry[] = [];
  let signalsEvaluated = 0;

  for (const tokenSnapshots of byToken.values()) {
    let lastEntryAt = -Infinity;
    let entriesForToken = 0;
    for (const snapshot of tokenSnapshots) {
      signalsEvaluated++;
      const evaluation = engine.evaluate(strategy, buildEvaluationInput(snapshot));
      const cooldownMs = Math.max(0, strategy.cooldownMinutes) * 60_000;
      if (!evaluation.matched || snapshot.snapshotAt.getTime() - lastEntryAt < cooldownMs) continue;
      if (options.maxEntriesPerToken && entriesForToken >= options.maxEntriesPerToken) continue;

      const outcome = measureOutcome(snapshot, tokenSnapshots, horizonMinutes);
      entries.push({
        tokenAddress: snapshot.tokenAddress,
        detectedAt: snapshot.snapshotAt.toISOString(),
        score: evaluation.score,
        confidence: evaluation.confidence,
        returnPct: outcome?.returnPct ?? null,
        maePct: outcome?.maePct ?? null,
        maxReturnPct: outcome?.maxReturnPct ?? null,
        outcomeAt: outcome?.outcomeAt ?? null,
      });
      lastEntryAt = snapshot.snapshotAt.getTime();
      entriesForToken++;
    }
  }

  const completed = entries.filter((entry) => entry.returnPct !== null);
  const returns = completed.map((entry) => entry.returnPct!);
  const maes = completed.map((entry) => entry.maePct).filter((value): value is number => value !== null);
  const maxReturns = completed.map((entry) => entry.maxReturnPct).filter((value): value is number => value !== null);
  const failureClasses = {
    winner: 0,
    no_follow_through: 0,
    deep_drawdown: 0,
    incomplete: entries.length - completed.length,
  };
  for (const entry of completed) {
    if ((entry.maePct ?? 0) <= -25) failureClasses.deep_drawdown++;
    else if ((entry.returnPct ?? 0) > 0) failureClasses.winner++;
    else failureClasses.no_follow_through++;
  }

  const winRate = completed.length > 0 ? returns.filter((value) => value > 0).length / completed.length : null;
  const averageReturnPct = average(returns);
  const worstMaePct = maes.length > 0 ? Math.min(...maes) : null;
  const reviewEvidence = options.reviewEvidence ?? null;
  const evidenceGateReasons: string[] = [];
  if (completed.length < EVIDENCE_GATE_THRESHOLDS.minimumCompletedOutcomes) {
    evidenceGateReasons.push(`Need at least ${EVIDENCE_GATE_THRESHOLDS.minimumCompletedOutcomes} completed outcomes.`);
  }
  if (winRate === null || winRate < EVIDENCE_GATE_THRESHOLDS.minimumWinRate) {
    evidenceGateReasons.push(`Win rate must be at least ${EVIDENCE_GATE_THRESHOLDS.minimumWinRate * 100}%.`);
  }
  if (averageReturnPct === null || averageReturnPct <= EVIDENCE_GATE_THRESHOLDS.minimumAverageReturnPct) {
    evidenceGateReasons.push("Average return must be positive.");
  }
  if (worstMaePct === null || worstMaePct <= EVIDENCE_GATE_THRESHOLDS.maximumWorstMaePct) {
    evidenceGateReasons.push(`Worst MAE must stay above ${EVIDENCE_GATE_THRESHOLDS.maximumWorstMaePct}%.`);
  }
  if (unavailableFields.length > 0) {
    evidenceGateReasons.push(`Missing replay coverage: ${unavailableFields.join(", ")}.`);
  }
  if (!reviewEvidence || reviewEvidence.reviewedAlerts < EVIDENCE_GATE_THRESHOLDS.minimumReviewedAlerts) {
    evidenceGateReasons.push(`Need at least ${EVIDENCE_GATE_THRESHOLDS.minimumReviewedAlerts} manually reviewed alerts.`);
  } else if (reviewEvidence.falsePositiveRate === null) {
    evidenceGateReasons.push("False-positive rate is not available from reviewed alerts.");
  } else if (reviewEvidence.falsePositiveRate > EVIDENCE_GATE_THRESHOLDS.maximumFalsePositiveRate) {
    evidenceGateReasons.push(`False-positive rate must be at most ${EVIDENCE_GATE_THRESHOLDS.maximumFalsePositiveRate * 100}%.`);
  }

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    strategyVersion: strategy.version,
    horizonMinutes,
    snapshotCount: ordered.length,
    signalsEvaluated,
    entries: entries.length,
    completed: completed.length,
    pending: entries.length - completed.length,
    winRate,
    averageReturnPct,
    averageMaePct: average(maes),
    worstMaePct,
    averageMaxReturnPct: average(maxReturns),
    failureClasses,
    coverage: {
      replayableFields: fields.filter((field) => REPLAYABLE_FIELDS.has(field)),
      unavailableFields,
      fieldCoverage,
      walletEvidenceCoveragePct: ordered.length > 0
        ? (ordered.filter((snapshot) => snapshot.walletEvidenceAvailable).length / ordered.length) * 100
        : null,
    },
    evidenceGate: {
      eligible: evidenceGateReasons.length === 0,
      reasons: evidenceGateReasons,
      thresholds: EVIDENCE_GATE_THRESHOLDS,
      reviewEvidence,
    },
    sampleEntries: entries.slice(-20).reverse(),
  };
}
