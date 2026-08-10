"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FlaskConical,
  GitBranch,
  Plus,
  Power,
  Radar,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import {
  AegisSelect,
  LoadingRows,
  MetricCard,
  Panel,
  StatusBadge,
  formatRelative,
} from "@/components/aegis-ui";
import {
  ActionLink,
  EmptyState,
  ModuleNotice,
  PageHeader,
  RefreshButton,
} from "@/components/workflow-ui";
import { API_BASE_URL } from "@/lib/api-url";
import { apiFetch } from "@/lib/api-client";

interface Strategy {
  id: string;
  name: string;
  description: string | null;
  currentVersion: string;
  isActive: string;
  createdAt: string;
  updatedAt: string;
  currentConfig?: {
    alertThreshold?: number;
    cooldownMinutes?: number;
    priority?: string;
    channels?: string[];
    conditions?: Array<{ field?: string; operator?: string; value?: unknown; weight?: number }>;
  };
  recentMatches?: Array<{
    id: string;
    tokenAddress: string;
    tokenSymbol: string;
    tokenName: string | null;
    signalScore: number;
    confidence: number;
    priority: string;
    detectedAt: string;
  }>;
}

interface StrategyPerformance {
  strategyId: string;
  strategyName: string;
  signals: number;
  completed24h: number;
  pending24h: number;
  winRate24h: number | null;
  averageReturn24hPct: number | null;
  averageMae24hPct: number | null;
  worstMae24hPct: number | null;
  averageMaxReturn24hPct: number | null;
  failureClasses: {
    winner: number;
    no_follow_through: number;
    deep_drawdown: number;
    incomplete: number;
  };
}

interface BacktestResult {
  strategyId: string;
  strategyName: string;
  strategyVersion?: string;
  horizonMinutes?: number;
  snapshotCount?: number;
  signalsEvaluated?: number;
  entries?: number;
  completed?: number;
  pending?: number;
  winRate?: number | null;
  averageReturnPct?: number | null;
  averageMaePct?: number | null;
  worstMaePct?: number | null;
  averageMaxReturnPct?: number | null;
  failureClasses?: {
    winner: number;
    no_follow_through: number;
    deep_drawdown: number;
    incomplete: number;
  };
  coverage?: {
    replayableFields: string[];
    unavailableFields: string[];
    fieldCoverage?: Record<string, { observed: number; total: number }>;
    walletEvidenceCoveragePct?: number | null;
  };
  evidenceGate?: {
    eligible: boolean;
    reasons: string[];
    reviewEvidence?: {
      totalAlerts: number;
      reviewedAlerts: number;
      falsePositiveRate: number | null;
    } | null;
  };
  sampleEntries?: Array<{
    tokenAddress: string;
    detectedAt: string;
    score: number;
    returnPct: number | null;
    maePct: number | null;
  }>;
  error?: string;
}

function formatPct(value: number | null, fraction = false) {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${(fraction ? value * 100 : value).toFixed(1)}%`;
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [performance, setPerformance] = useState<StrategyPerformance[]>([]);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [backtesting, setBacktesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newThreshold, setNewThreshold] = useState(70);
  const [newPriority, setNewPriority] = useState("medium");
  const [newMinLiquidity, setNewMinLiquidity] = useState(15_000);
  const [newMaxPairAge, setNewMaxPairAge] = useState(60);
  const [newMinQualifiedWallets, setNewMinQualifiedWallets] = useState(1);

  async function fetchStrategies() {
    setLoading(true);
    try {
      const apiUrl = API_BASE_URL;
      const [res, performanceRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/strategies`, { cache: "no-store" }),
        fetch(`${apiUrl}/api/v1/strategies/performance?sinceDays=7`, { cache: "no-store" }),
      ]);
      const data: { success?: boolean; data?: Strategy[]; error?: string } = await res.json();
      const performanceData: { success?: boolean; data?: StrategyPerformance[] } =
        await performanceRes.json();
      if (data.success && data.data) {
        setStrategies(data.data);
        setPerformance(performanceData.success ? (performanceData.data ?? []) : []);
        setSelectedId((current) => current ?? data.data?.[0]?.id ?? null);
        setError(null);
      } else {
        setError(data.error ?? "Failed to fetch strategies.");
      }
    } catch {
      setError("Unable to reach strategies API.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStrategies();
  }, []);

  async function toggleStrategy(id: string, currentActive: string) {
    if (
      currentActive !== "true" &&
      (backtest?.strategyId !== id || !backtest.evidenceGate?.eligible)
    ) {
      setError("Run the 30-day replay and pass the evidence gate before enabling this strategy.");
      return;
    }
    const apiUrl = API_BASE_URL;
    await apiFetch(`${apiUrl}/api/v1/strategies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: currentActive !== "true" }),
    });
    await fetchStrategies();
  }

  async function createStrategy() {
    if (!newName.trim()) return;
    const apiUrl = API_BASE_URL;
    const res = await apiFetch(`${apiUrl}/api/v1/strategies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        alertThreshold: newThreshold,
        priority: newPriority,
        conditions: [
          { field: "token_score", operator: "gte", value: newThreshold, weight: 0.55 },
          {
            field: "qualified_wallet_count",
            operator: "gte",
            value: newMinQualifiedWallets,
            weight: 0.2,
          },
          { field: "liquidity_usd", operator: "gte", value: newMinLiquidity, weight: 0.15 },
          { field: "token_age_minutes", operator: "lte", value: newMaxPairAge, weight: 0.1 },
        ],
        channels: ["web"],
        isActive: false,
      }),
    });
    if (res.ok) {
      setShowCreate(false);
      setNewName("");
      await fetchStrategies();
    }
  }

  async function runBacktest(strategyId: string) {
    setBacktesting(true);
    setBacktest(null);
    try {
      const apiUrl = API_BASE_URL;
      const res = await fetch(
        `${apiUrl}/api/v1/strategies/backtest?strategyId=${encodeURIComponent(strategyId)}&sinceDays=30&horizonMinutes=1440&maxEntriesPerToken=10`,
        { cache: "no-store" },
      );
      const payload: { success?: boolean; data?: { results?: BacktestResult[] }; error?: string } =
        await res.json();
      const result = payload.data?.results?.[0];
      if (payload.success && result) setBacktest(result);
      else setError(payload.error ?? "Historical replay could not be completed.");
    } catch {
      setError("Historical replay API is unavailable.");
    } finally {
      setBacktesting(false);
    }
  }

  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.id === selectedId) ?? strategies[0] ?? null,
    [selectedId, strategies],
  );
  const selectedPerformance =
    performance.find((item) => item.strategyId === selectedStrategy?.id) ?? null;
  const selectedThreshold = selectedStrategy?.currentConfig?.alertThreshold ?? 70;
  const selectedConditions = selectedStrategy?.currentConfig?.conditions ?? [];
  const activeCount = strategies.filter((strategy) => strategy.isActive === "true").length;

  if (loading && strategies.length === 0) return <LoadingRows rows={4} />;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Evidence-controlled automation"
        title="Prove a strategy before it can create noise"
        description="Build plain-language conditions, replay them against stored evidence, inspect failure classes, and activate only after the evidence gate passes."
        actions={
          <>
            <ActionLink href="/scanner" icon={<Radar className="h-3.5 w-3.5" />}>
              Market scanner
            </ActionLink>
            <ActionLink href="/alerts">Review outcomes</ActionLink>
            <RefreshButton onClick={() => void fetchStrategies()} busy={loading} />
          </>
        }
      />
      {error ? (
        <ModuleNotice
          tone="warning"
          title="Strategy action required"
          message={error}
          action={
            <button
              type="button"
              onClick={() => setError(null)}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface"
            >
              Dismiss
            </button>
          }
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Strategies" value={strategies.length} tone="primary" />
        <MetricCard label="Active" value={activeCount} tone={activeCount ? "success" : "default"} />
        <MetricCard label="Inactive" value={strategies.length - activeCount} />
        <MetricCard label="New Rule Threshold" value={newThreshold} tone="warning" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr_360px]">
        <Panel
          title="Strategy List"
          icon={<FlaskConical className="h-4 w-4" />}
          action={
            <button
              onClick={() => setShowCreate((value) => !value)}
              className="rounded-sm border border-primary/30 bg-primary-container/10 p-2 text-primary"
              title="Create strategy"
            >
              <Plus className="h-4 w-4" />
            </button>
          }
        >
          <div className="divide-y divide-outline">
            {strategies.length === 0 ? (
              <EmptyState
                title="No strategies configured"
                message="Create an inactive draft, replay it, then activate only when its evidence gate passes."
              />
            ) : (
              strategies.map((strategy) => (
                <button
                  key={strategy.id}
                  onClick={() => setSelectedId(strategy.id)}
                  className={`w-full px-standard py-4 text-left transition-colors ${selectedStrategy?.id === strategy.id ? "bg-primary/5" : "bg-surface hover:bg-surface-high"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={strategy.isActive === "true" ? "success" : "default"}>
                          {strategy.isActive === "true" ? "active" : "inactive"}
                        </StatusBadge>
                        <p className="truncate font-semibold text-on-surface">{strategy.name}</p>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">
                        {strategy.description || "No description"}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-primary">
                      {strategy.currentVersion}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Strategy Detail" icon={<Target className="h-4 w-4" />}>
          {selectedStrategy ? (
            <div className="space-y-4 p-standard">
              <div className="rounded-lg border border-outline bg-surface px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-semibold text-on-surface">
                      {selectedStrategy.name}
                    </h1>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      {selectedStrategy.description || "No strategy description stored."}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => runBacktest(selectedStrategy.id)}
                      disabled={backtesting}
                      className="rounded-sm border border-primary/30 bg-primary-container/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary disabled:opacity-50"
                    >
                      {backtesting ? "Replaying" : "Replay 30d"}
                    </button>
                    <button
                      onClick={() => toggleStrategy(selectedStrategy.id, selectedStrategy.isActive)}
                      disabled={
                        selectedStrategy.isActive !== "true" &&
                        (backtest?.strategyId !== selectedStrategy.id ||
                          !backtest.evidenceGate?.eligible)
                      }
                      className={`rounded-sm border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] ${
                        selectedStrategy.isActive === "true"
                          ? "border-destructive/35 bg-destructive/10 text-destructive"
                          : "border-success/35 bg-success/10 text-success"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <Power className="mr-2 inline h-4 w-4" />
                      {selectedStrategy.isActive === "true" ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard
                  label="Version"
                  value={selectedStrategy.currentVersion}
                  tone="primary"
                />
                <MetricCard label="Updated" value={formatRelative(selectedStrategy.updatedAt)} />
                <MetricCard label="Created" value={formatRelative(selectedStrategy.createdAt)} />
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <MetricCard
                  label="24H Win Rate"
                  value={formatPct(selectedPerformance?.winRate24h ?? null, true)}
                  tone={
                    selectedPerformance?.winRate24h && selectedPerformance.winRate24h > 0.5
                      ? "success"
                      : "default"
                  }
                />
                <MetricCard
                  label="Avg Return"
                  value={formatPct(selectedPerformance?.averageReturn24hPct ?? null)}
                  tone="primary"
                />
                <MetricCard
                  label="Avg Adverse"
                  value={formatPct(selectedPerformance?.averageMae24hPct ?? null)}
                  tone="warning"
                />
                <MetricCard
                  label="Pending"
                  value={selectedPerformance?.pending24h ?? "--"}
                  tone={selectedPerformance?.pending24h ? "stale" : "default"}
                />
              </div>

              <div className="rounded-lg border border-outline bg-surface-container px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                      Evidence posture
                    </p>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      {selectedPerformance
                        ? `${selectedPerformance.completed24h} completed 24h observations from ${selectedPerformance.signals} signals.`
                        : "No persisted 24h outcome observations yet."}
                    </p>
                  </div>
                  {selectedPerformance ? (
                    <div className="text-right font-mono text-[11px] uppercase tracking-[0.1em] text-on-surface-variant">
                      <div>Worst MAE {formatPct(selectedPerformance.worstMae24hPct)}</div>
                      <div>
                        Failure:{" "}
                        {selectedPerformance.failureClasses.no_follow_through +
                          selectedPerformance.failureClasses.deep_drawdown}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {backtest?.strategyId === selectedStrategy.id ? (
                <div className="rounded-lg border border-primary/30 bg-primary-container/5 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
                        Historical Replay
                      </p>
                      <p className="mt-2 text-sm text-on-surface-variant">
                        {backtest.snapshotCount ?? 0} snapshots, {backtest.entries ?? 0} replay
                        entries, {backtest.completed ?? 0} completed outcomes.
                      </p>
                    </div>
                    <div className="text-right font-mono text-[11px] uppercase tracking-[0.1em] text-on-surface-variant">
                      <div>Win rate {formatPct(backtest.winRate ?? null, true)}</div>
                      <div>Return {formatPct(backtest.averageReturnPct ?? null)}</div>
                      <div>MAE {formatPct(backtest.averageMaePct ?? null)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-outline/60 pt-3">
                    <StatusBadge tone={backtest.evidenceGate?.eligible ? "success" : "warning"}>
                      {backtest.evidenceGate?.eligible
                        ? "evidence gate passed"
                        : "evidence gate blocked"}
                    </StatusBadge>
                    <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-on-surface-variant">
                      Wallet coverage{" "}
                      {backtest.coverage?.walletEvidenceCoveragePct === null ||
                      backtest.coverage?.walletEvidenceCoveragePct === undefined
                        ? "--"
                        : `${backtest.coverage.walletEvidenceCoveragePct.toFixed(1)}%`}
                    </span>
                    {backtest.evidenceGate?.reviewEvidence ? (
                      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-on-surface-variant">
                        Reviewed {backtest.evidenceGate.reviewEvidence.reviewedAlerts}/
                        {backtest.evidenceGate.reviewEvidence.totalAlerts}
                      </span>
                    ) : null}
                  </div>
                  {(backtest.coverage?.unavailableFields.length ?? 0) > 0 ? (
                    <p className="mt-3 border-t border-outline/60 pt-3 text-xs text-warning">
                      Coverage gap: {backtest.coverage?.unavailableFields.join(", ")} cannot be
                      replayed from token snapshots.
                    </p>
                  ) : null}
                  {(backtest.evidenceGate?.reasons.length ?? 0) > 0 ? (
                    <div className="mt-3 border-t border-outline/60 pt-3 text-xs text-warning">
                      <p className="font-semibold">Gate requirements</p>
                      <ul className="mt-2 space-y-1">
                        {backtest.evidenceGate?.reasons.slice(0, 5).map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-outline bg-surface px-4 py-4">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-primary" />
                    <p className="font-semibold text-on-surface">Core Thresholds</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="flex justify-between rounded-sm border border-outline bg-surface-container px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                      <span>Match threshold</span>
                      <span className="text-primary">{selectedThreshold}</span>
                    </div>
                    {selectedConditions.length > 0 ? (
                      selectedConditions.map((condition, index) => (
                        <div
                          key={`${condition.field}-${index}`}
                          className="flex items-start justify-between gap-3 rounded-sm border border-outline bg-surface-container px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-on-surface-variant"
                        >
                          <span>
                            {condition.field ?? "unknown"} {condition.operator ?? "?"}
                          </span>
                          <span className="text-on-surface">
                            {Array.isArray(condition.value)
                              ? condition.value.join("–")
                              : String(condition.value ?? "n/a")}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-warning">
                        No conditions are configured. This strategy cannot match.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-outline bg-surface px-4 py-4">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-primary" />
                    <p className="font-semibold text-on-surface">Recent Matches</p>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    {(selectedStrategy.recentMatches ?? []).length > 0 ? (
                      selectedStrategy.recentMatches!.slice(0, 5).map((match) => (
                        <div
                          key={match.id}
                          className="flex items-center justify-between rounded-sm border border-outline bg-surface-container px-3 py-2"
                        >
                          <Link
                            href={`/tokens/${match.tokenAddress}`}
                            className="text-on-surface hover:text-primary"
                          >
                            ${match.tokenSymbol} score {match.signalScore}
                          </Link>
                          <span className="font-mono text-on-surface-variant">
                            {formatRelative(match.detectedAt)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-sm border border-outline bg-surface-container px-3 py-4 text-sm text-on-surface-variant">
                        No recent matches have been generated for this strategy.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-standard text-sm text-on-surface-variant">
              Select a strategy to inspect its signal posture.
            </div>
          )}
        </Panel>

        <Panel
          title={showCreate ? "New Strategy" : "Rule Builder"}
          icon={<Plus className="h-4 w-4" />}
        >
          <div className="space-y-4 p-standard">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Momentum confirmation"
              className="h-10 w-full rounded-sm border border-outline bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary"
            />
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                Alert Threshold
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={newThreshold}
                onChange={(event) => setNewThreshold(Number(event.target.value))}
                className="mt-3 w-full accent-primary"
              />
            </label>
            <AegisSelect
              label="Priority"
              value={newPriority}
              options={[
                { label: "Critical", value: "critical" },
                { label: "High", value: "high" },
                { label: "Medium", value: "medium" },
                { label: "Low", value: "low" },
              ]}
              onChange={setNewPriority}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                  Min liquidity USD
                </span>
                <input
                  type="number"
                  min={0}
                  value={newMinLiquidity}
                  onChange={(event) => setNewMinLiquidity(Math.max(0, Number(event.target.value)))}
                  className="mt-2 h-10 w-full rounded-sm border border-outline bg-surface px-3 font-mono text-sm text-on-surface outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                  Max token age min
                </span>
                <input
                  type="number"
                  min={1}
                  value={newMaxPairAge}
                  onChange={(event) => setNewMaxPairAge(Math.max(1, Number(event.target.value)))}
                  className="mt-2 h-10 w-full rounded-sm border border-outline bg-surface px-3 font-mono text-sm text-on-surface outline-none focus:border-primary"
                />
              </label>
            </div>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                Qualified wallets required
              </span>
              <input
                type="number"
                min={0}
                max={20}
                value={newMinQualifiedWallets}
                onChange={(event) =>
                  setNewMinQualifiedWallets(Math.max(0, Math.min(20, Number(event.target.value))))
                }
                className="mt-2 h-10 w-full rounded-sm border border-outline bg-surface px-3 font-mono text-sm text-on-surface outline-none focus:border-primary"
              />
            </label>
            <div className="rounded-sm border border-outline bg-surface px-3 py-3 font-mono text-xs text-on-surface-variant">
              Alert when score is at least {newThreshold}, liquidity is at least $
              {newMinLiquidity.toLocaleString()}, token age is no more than {newMaxPairAge} minutes,
              and at least {newMinQualifiedWallets} qualified wallet
              {newMinQualifiedWallets === 1 ? " is" : "s are"} present.
            </div>
            <ModuleNotice
              tone="primary"
              title="Saved as an inactive draft"
              message="Run the 30-day replay after saving. Activation remains disabled until the evidence gate passes."
            />
            <button
              onClick={createStrategy}
              disabled={!newName.trim()}
              className="w-full rounded-sm border border-primary/30 bg-primary-container px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-primary-foreground disabled:opacity-50"
            >
              Save Draft
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
