"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  Clock3,
  Database,
  MoveRight,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api-url";

interface OverviewData {
  tokens: number;
  signals: number;
  alerts: number;
  wallets: number;
}

interface PipelineData {
  rawEventsPending: number;
  rawEventsFailed: number;
  alertsPending: number;
  alertsDelivered: number;
  deliveriesDelivered: number;
  deliveriesFailed: number;
  failuresOpen: number;
}

interface SystemData {
  environment: string;
  version: string;
  dataSourceSummary: string;
}

interface SignalItem {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  signalScore: number;
  confidence: number;
  priority: string;
  detectedAt: string;
  dataSource: string;
  dataFreshness: string;
}

interface AlertItem {
  id: string;
  tokenAddress: string;
  priority: string;
  title: string;
  signalScore: number;
  status: string;
  triggeredAt: string;
  dataSource: string;
  dataFreshness: string;
}

interface WalletTradeItem {
  id: string;
  walletAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  tradeType: string;
  amount: string | number;
  valueUsd: string | number | null;
  tradedAt: string;
}

interface DashboardData {
  overview: OverviewData;
  pipeline: PipelineData;
  system: SystemData;
  recentSignals: SignalItem[];
  recentAlerts: AlertItem[];
  recentWalletTrades: WalletTradeItem[];
}

function formatShortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeMinutes(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  return `${Math.round(diffHr / 24)}d ago`;
}

function priorityTone(priority: string) {
  const normalized = priority.toLowerCase();

  if (normalized === "critical") {
    return "border-l-destructive bg-destructive/5 text-destructive";
  }

  if (normalized === "high") {
    return "border-l-warning bg-warning/5 text-warning";
  }

  return "border-l-primary bg-primary/5 text-primary";
}

function scoreTone(score: number) {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-on-surface-variant";
}

function shortenAddress(address: string) {
  return address.length > 10 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;
}

function formatUsd(value: string | number | null) {
  if (value === null || value === undefined || value === "") return "Value unavailable";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "Value unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(numericValue);
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr_0.8fr]">
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-lg border border-outline bg-surface-container" />
          <div className="h-56 animate-pulse rounded-lg border border-outline bg-surface-container" />
          <div className="h-40 animate-pulse rounded-lg border border-outline bg-surface-container" />
        </div>
        <div className="space-y-4">
          <div className="h-80 animate-pulse rounded-lg border border-outline bg-surface-container" />
          <div className="h-32 animate-pulse rounded-lg border border-outline bg-surface-container" />
        </div>
        <div className="h-[32rem] animate-pulse rounded-lg border border-outline bg-surface-container" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        const apiUrl = API_BASE_URL;
        const response = await fetch(`${apiUrl}/api/v1/dashboard?signalLimit=5&alertLimit=5`, {
          cache: "no-store",
        });
        const payload: { success?: boolean; data?: DashboardData; error?: string } = await response.json();

        if (payload.success && payload.data) {
          if (active) {
            setDashboard(payload.data);
            setError(null);
          }
          return;
        }

        if (active) setError(payload.error ?? "Dashboard data is unavailable.");
      } catch {
        if (active) setError("Unable to reach the API. The layout is live, but dashboard data is currently offline.");
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchData();

    const refreshInterval = window.setInterval(fetchData, 15_000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
    };
  }, []);

  const topSignal = dashboard?.recentSignals[0] ?? null;
  const otherSignals = dashboard?.recentSignals.slice(1, 4) ?? [];
  const alerts = dashboard?.recentAlerts ?? [];
  const hasData = !!dashboard;
  const staleModules = !!dashboard && dashboard.pipeline.rawEventsFailed > 0;

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Dashboard degraded</p>
            <p className="text-on-surface-variant">{error}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr_0.8fr]">
        <section className="space-y-4">
          <div className="rounded-lg border border-outline bg-surface-container">
            <div className="flex items-center justify-between border-b border-outline bg-surface-high px-standard py-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <h1 className="text-base font-semibold text-on-surface">Market and System State</h1>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-on-surface-variant">
                Live Surface
              </span>
            </div>
            <div className="grid gap-3 p-standard sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-sm border border-outline bg-surface px-3 py-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Tokens Indexed</p>
                <p className="mt-2 font-mono text-2xl text-on-surface tabular-nums">
                  {dashboard?.overview.tokens ?? 0}
                </p>
              </div>
              <div className="rounded-sm border border-outline bg-surface px-3 py-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Signals Ready</p>
                <p className="mt-2 font-mono text-2xl text-primary tabular-nums">
                  {dashboard?.overview.signals ?? 0}
                </p>
              </div>
              <div className="rounded-sm border border-outline bg-surface px-3 py-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Alerts Open</p>
                <p className="mt-2 font-mono text-2xl text-warning tabular-nums">
                  {dashboard?.overview.alerts ?? 0}
                </p>
              </div>
              <div className="rounded-sm border border-outline bg-surface px-3 py-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Wallets Tracked</p>
                <p className="mt-2 font-mono text-2xl text-success tabular-nums">
                  {dashboard?.overview.wallets ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-outline bg-surface-container">
            <div className="flex items-center justify-between border-b border-outline bg-surface-high px-standard py-3">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold text-on-surface">Ranked Candidates</h2>
              </div>
              <span className="rounded-sm border border-outline bg-surface px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                Unvalidated Feed
              </span>
            </div>

            {!topSignal ? (
              <div className="p-standard">
                <div className="rounded-sm border border-outline bg-surface px-4 py-8 text-center">
                  <p className="text-sm text-on-surface">No candidates observed yet.</p>
                  <p className="mt-1 text-sm text-on-surface-variant">Wait for discovery or run a manual scan.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-standard">
                <Link
                  href={`/tokens/${topSignal.tokenAddress}`}
                  className="block overflow-hidden rounded-lg border border-outline bg-surface transition-colors hover:border-primary/60"
                >
                  <div className="flex items-center justify-between border-b border-outline bg-surface-high px-standard py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-outline bg-surface-bright font-mono text-lg text-on-surface">
                        {topSignal.tokenSymbol.slice(0, 1)}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-on-surface">${topSignal.tokenSymbol}</h3>
                        <p className="text-sm text-on-surface-variant">Primary candidate from {topSignal.dataSource}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono text-lg tabular-nums ${scoreTone(topSignal.signalScore)}`}>
                        {topSignal.signalScore}
                      </p>
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                        {topSignal.priority}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 p-standard md:grid-cols-3">
                    <div className="rounded-sm border border-outline bg-surface-container px-3 py-3 text-center">
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Score</p>
                      <p className={`mt-2 font-mono text-xl ${scoreTone(topSignal.signalScore)}`}>{topSignal.signalScore}</p>
                    </div>
                    <div className="rounded-sm border border-outline bg-surface-container px-3 py-3 text-center">
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Confidence</p>
                      <p className="mt-2 font-mono text-xl text-warning">{Math.round(topSignal.confidence * 100)}%</p>
                    </div>
                    <div className="rounded-sm border border-outline bg-surface-container px-3 py-3 text-center">
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Freshness</p>
                      <p className="mt-2 font-mono text-sm text-on-surface">{formatRelativeMinutes(topSignal.dataFreshness)}</p>
                    </div>
                  </div>

                  <div className="space-y-2 px-standard pb-standard">
                    <p className="border-b border-outline pb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                      Catalyst Evidence
                    </p>
                    <div className="flex items-start gap-2 text-sm text-on-surface">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-success" />
                      Score ranks this candidate against the currently observed feed.
                    </div>
                    <div className="flex items-start gap-2 text-sm text-on-surface">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-success" />
                      Source freshness last updated {formatRelativeMinutes(topSignal.dataFreshness)}.
                    </div>
                    <div className="flex items-start gap-2 text-sm text-on-surface-variant">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-warning" />
                      Review full research before preparing execution.
                    </div>
                  </div>
                </Link>

                {otherSignals.length > 0 && (
                  <div className="space-y-3">
                    {otherSignals.map((signal) => (
                      <Link
                        key={signal.id}
                        href={`/tokens/${signal.tokenAddress}`}
                        className="block rounded-lg border border-outline bg-surface px-standard py-4 transition-colors hover:border-primary/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-on-surface">${signal.tokenSymbol}</p>
                            <p className="text-sm text-on-surface-variant">{signal.dataSource}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-mono text-lg ${scoreTone(signal.signalScore)}`}>{signal.signalScore}</p>
                            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                              {signal.priority}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-outline bg-surface-container">
            <div className="flex items-center justify-between border-b border-outline bg-surface-high px-standard py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h2 className="text-base font-semibold text-on-surface">Recent Alerts</h2>
              </div>
              <span className="h-2 w-2 rounded-full bg-destructive" />
            </div>

            <div className="space-y-2 p-dense">
              {alerts.length === 0 ? (
                <div className="rounded-sm border border-outline bg-surface px-4 py-8 text-center">
                  <p className="text-sm text-on-surface">No active alerts.</p>
                  <p className="mt-1 text-sm text-on-surface-variant">The system is currently quiet.</p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <Link
                    key={alert.id}
                    href={`/tokens/${alert.tokenAddress}`}
                    className={[
                      "block rounded-sm border border-outline border-l-4 px-4 py-3 transition-colors hover:border-primary/50",
                      priorityTone(alert.priority),
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.12em]">{alert.priority}</p>
                        <p className="mt-1 text-sm font-semibold text-on-surface">{alert.title}</p>
                        <p className="mt-1 text-sm text-on-surface-variant">
                          {alert.status} via {alert.dataSource}
                        </p>
                      </div>
                      <p className="font-mono text-[11px] text-on-surface-variant">
                        {formatRelativeMinutes(alert.triggeredAt)}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-outline bg-surface-container">
            <div className="flex items-center justify-between border-b border-outline bg-surface-high px-standard py-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-secondary" />
                <h2 className="text-base font-semibold text-on-surface">Smart Money Flow</h2>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                Wallet Pulse
              </span>
            </div>

            <div className="overflow-hidden">
              <table className="w-full border-collapse">
                <thead className="border-b border-outline bg-surface text-left">
                  <tr className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                    <th className="px-3 py-2 font-medium">Wallet</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 text-right font-medium">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline text-sm">
                  {(dashboard?.recentWalletTrades ?? []).map((trade) => {
                    const isSell = trade.tradeType.toLowerCase() === "sell";
                    return (
                      <tr key={trade.id} className="bg-surface transition-colors hover:bg-surface-high">
                        <td className="px-3 py-3 font-mono text-primary">{shortenAddress(trade.walletAddress)}</td>
                        <td className={["px-3 py-3 font-mono", isSell ? "text-destructive" : "text-success"].join(" ")}>
                          {trade.tradeType} ${trade.tokenSymbol}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-on-surface tabular-nums">
                          {formatUsd(trade.valueUsd)}
                        </td>
                      </tr>
                    );
                  })}
                  {!dashboard?.recentWalletTrades?.length && (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-sm text-on-surface-variant">
                        No verified wallet movement in the selected data window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="overflow-hidden rounded-lg border border-outline bg-surface-container shadow-panel-strong">
          <div className="flex items-center justify-between border-b border-outline bg-surface-high px-standard py-3">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-on-surface">
                Quick Inspect{topSignal ? `: $${topSignal.tokenSymbol}` : ""}
              </h2>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Context</span>
          </div>

          <div className="space-y-6 p-standard">
            <div className="relative h-40 overflow-hidden rounded-sm border border-outline bg-surface">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(67,70,85,0.25)_1px,transparent_1px),linear-gradient(to_bottom,rgba(67,70,85,0.25)_1px,transparent_1px)] bg-[size:20px_20px]" />
              <svg className="absolute inset-0 h-full w-full text-success" viewBox="0 0 100 50" preserveAspectRatio="none">
                <path
                  d="M0 42 L10 36 L20 38 L30 28 L40 31 L50 18 L60 22 L70 10 L80 7 L90 10 L100 3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M0 42 L10 36 L20 38 L30 28 L40 31 L50 18 L60 22 L70 10 L80 7 L90 10 L100 3 L100 50 L0 50 Z"
                  fill="currentColor"
                  opacity="0.12"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-sm border border-outline bg-surface/80 px-2 py-1 font-mono text-[11px] text-on-surface-variant">
                  Live Chart Data
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Key Metrics</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-sm border border-outline bg-surface px-3 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Signals</p>
                  <p className="mt-2 font-mono text-lg text-on-surface tabular-nums">{dashboard?.overview.signals ?? 0}</p>
                </div>
                <div className="rounded-sm border border-outline bg-surface px-3 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Alerts</p>
                  <p className="mt-2 font-mono text-lg text-warning tabular-nums">{dashboard?.overview.alerts ?? 0}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Security Check</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-sm border border-outline bg-surface px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-on-surface">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    Delivery health
                  </span>
                  <span className="font-mono text-success">
                    {dashboard?.pipeline.deliveriesFailed ? "Watch" : "Pass"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-sm border border-outline bg-surface px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-on-surface">
                    <span className="h-2 w-2 rounded-full bg-warning" />
                    Failures open
                  </span>
                  <span className="font-mono text-warning tabular-nums">{dashboard?.pipeline.failuresOpen ?? 0}</span>
                </div>
              </div>
            </div>

            <div
              className={[
                "rounded-lg border px-4 py-4",
                staleModules
                  ? "border-stale/40 bg-stale/10"
                  : "border-outline bg-surface",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <Clock3 className={["mt-0.5 h-4 w-4", staleModules ? "text-stale" : "text-success"].join(" ")} />
                <div>
                  <p className={["font-semibold", staleModules ? "text-stale" : "text-on-surface"].join(" ")}>
                    {staleModules ? "Stale pipeline pressure detected" : "System freshness nominal"}
                  </p>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {staleModules
                      ? `${dashboard?.pipeline.rawEventsFailed ?? 0} raw event jobs have failed. Cached metrics remain visible while workers recover.`
                      : `Environment ${dashboard?.system.environment ?? "development"} is serving ${
                          dashboard?.system.dataSourceSummary ?? "the current data source"
                        }.`}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-outline bg-surface-high px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Quick Actions</p>
              <div className="mt-3 space-y-2">
                <Link
                  href={topSignal ? `/tokens/${topSignal.tokenAddress}` : "/scanner"}
                  className="flex items-center justify-between rounded-sm border border-primary-container/30 bg-primary-container/10 px-3 py-3 text-sm text-primary transition-colors hover:bg-primary-container/20"
                >
                  <span>{topSignal ? `Open ${topSignal.tokenSymbol} Research` : "Open Scanner"}</span>
                  <MoveRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/terminal"
                  className="flex items-center justify-between rounded-sm border border-outline bg-surface px-3 py-3 text-sm text-on-surface transition-colors hover:border-primary/40"
                >
                  <span>Prepare Trade Setup</span>
                  <MoveRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {hasData && (
              <div className="rounded-lg border border-outline bg-surface px-4 py-4 text-sm">
                <p className="font-semibold text-on-surface">System Context</p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-on-surface-variant">Version</span>
                    <span className="font-mono text-on-surface">{dashboard?.system.version ?? "0.1.0"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-on-surface-variant">Last alert</span>
                    <span className="font-mono text-on-surface">
                      {alerts[0] ? formatShortTime(alerts[0].triggeredAt) : "None"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-on-surface-variant">Delivered</span>
                    <span className="font-mono text-success tabular-nums">
                      {dashboard?.pipeline.alertsDelivered ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
