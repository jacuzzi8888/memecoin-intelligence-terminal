"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Database,
  Radar,
  ShieldCheck,
  Wallet,
  Waypoints,
} from "lucide-react";
import {
  LoadingRows,
  MetricCard,
  Panel,
  StatusBadge,
  formatNumber,
  formatRelative,
  scoreTone,
  shortAddress,
} from "@/components/aegis-ui";
import {
  ActionLink,
  EmptyState,
  FreshnessStamp,
  ModuleNotice,
  PageHeader,
  RefreshButton,
} from "@/components/workflow-ui";
import { API_BASE_URL } from "@/lib/api-url";

interface SignalItem {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
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
  message?: string;
  signalScore: number;
  status: string;
  triggeredAt: string;
  strategyName?: string;
}

interface DashboardData {
  overview: { tokens: number; signals: number; alerts: number; wallets: number };
  pipeline: {
    rawEventsPending: number;
    rawEventsFailed: number;
    alertsPending: number;
    alertsDelivered: number;
    deliveriesDelivered: number;
    deliveriesFailed: number;
    failuresOpen: number;
  };
  system: { environment: string; version: string; dataSourceSummary: string };
  recentSignals: SignalItem[];
  recentAlerts: AlertItem[];
  recentWalletTrades: Array<{
    id: string;
    walletAddress: string;
    tokenAddress: string;
    tokenSymbol: string;
    tradeType: string;
    amount: string | number;
    valueSol: string | number | null;
    tradedAt: string;
  }>;
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/dashboard?signalLimit=10&alertLimit=10`,
        { cache: "no-store" },
      );
      const payload: { success?: boolean; data?: DashboardData; error?: string } =
        await response.json();
      if (!response.ok || !payload.success || !payload.data)
        throw new Error(payload.error || "Dashboard data is unavailable");
      setDashboard(payload.data);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Dashboard data is unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
    const timer = window.setInterval(() => void fetchDashboard(true), 15_000);
    return () => window.clearInterval(timer);
  }, [fetchDashboard]);

  if (loading && !dashboard) return <LoadingRows rows={6} />;
  if (!dashboard)
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Operator command center"
          title="Decide what deserves attention now"
          description="The dashboard summary is offline, but the investigation surfaces remain available for direct inspection and recovery."
          meta={<StatusBadge tone="danger">Dashboard data offline</StatusBadge>}
          actions={
            <>
              <ActionLink href="/scanner" tone="primary" icon={<Radar className="h-4 w-4" />}>
                Open scanner
              </ActionLink>
              <ActionLink href="/research">Open research</ActionLink>
              <RefreshButton onClick={() => void fetchDashboard()} busy={loading} />
            </>
          }
        />
        <ModuleNotice
          tone="danger"
          title="Dashboard data unavailable"
          message={error || "No dashboard response was returned."}
        />
      </div>
    );

  const opportunities = [...dashboard.recentSignals].sort(
    (left, right) => right.signalScore - left.signalScore,
  );
  const latestAt =
    [
      ...opportunities.map((item) => item.dataFreshness || item.detectedAt),
      ...dashboard.recentAlerts.map((item) => item.triggeredAt),
      ...dashboard.recentWalletTrades.map((item) => item.tradedAt),
    ].sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
  const operationalIssues =
    dashboard.pipeline.rawEventsFailed +
    dashboard.pipeline.deliveriesFailed +
    dashboard.pipeline.failuresOpen;
  const reviewWork = dashboard.pipeline.alertsPending;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Operator command center"
        title="Decide what deserves attention now"
        description="Live market observations, strategy alerts, wallet movement, and system work are separated so one failed job never hides otherwise usable intelligence."
        meta={
          <>
            <FreshnessStamp value={latestAt} label="Market" />
            <StatusBadge tone={operationalIssues ? "warning" : "success"}>
              {operationalIssues ? `${operationalIssues} operations issues` : "Operations nominal"}
            </StatusBadge>
          </>
        }
        actions={
          <>
            <ActionLink href="/scanner" icon={<Radar className="h-3.5 w-3.5" />} tone="primary">
              Open scanner
            </ActionLink>
            <ActionLink href="/alerts" icon={<BellRing className="h-3.5 w-3.5" />}>
              Review alerts
            </ActionLink>
          </>
        }
      />

      {error ? (
        <ModuleNotice
          tone="warning"
          title="Live refresh failed"
          message={`${error}. The last successful dashboard state remains visible.`}
          action={<RefreshButton onClick={() => void fetchDashboard()} busy={loading} />}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Observed Tokens"
          value={dashboard.overview.tokens}
          tone="primary"
          detail="Current evidence window"
        />
        <MetricCard
          label="Ranked Signals"
          value={dashboard.overview.signals}
          tone="success"
          detail="Market observations"
        />
        <MetricCard
          label="Needs Review"
          value={reviewWork}
          tone={reviewWork ? "warning" : "default"}
          detail="Strategy-generated alerts"
        />
        <MetricCard
          label="Active Wallets"
          value={dashboard.overview.wallets}
          detail="Valid wallets seen recently"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Panel
          title="High-Conviction Opportunities"
          eyebrow="Ranked by score"
          icon={<Radar className="h-4 w-4" />}
          action={
            <Link
              href="/scanner"
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary"
            >
              View all
            </Link>
          }
        >
          <div className="divide-y divide-outline">
            {opportunities.length ? (
              opportunities.map((signal, index) => (
                <article
                  key={signal.id}
                  className="grid gap-3 px-standard py-3 transition-colors hover:bg-surface-high sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className="font-mono text-sm text-on-surface-variant">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/tokens/${signal.tokenAddress}`}
                        className="font-semibold text-on-surface hover:text-primary"
                      >
                        ${signal.tokenSymbol}
                      </Link>
                      <StatusBadge tone={signal.signalScore >= 60 ? "warning" : "default"}>
                        {signal.priority}
                      </StatusBadge>
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-on-surface-variant">
                        {signal.dataSource}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-on-surface-variant">
                      {signal.tokenName} · confidence {Math.round(signal.confidence * 100)}% ·{" "}
                      {formatRelative(signal.detectedAt)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-right">
                      <p className={`font-mono text-xl ${scoreTone(signal.signalScore)}`}>
                        {signal.signalScore}
                      </p>
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-on-surface-variant">
                        score
                      </p>
                    </div>
                    <ActionLink href={`/tokens/${signal.tokenAddress}`}>Inspect</ActionLink>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                title="No ranked opportunities yet"
                message="The scanner has not produced a recent market observation in this evidence window."
                action={
                  <ActionLink href="/scanner" tone="primary">
                    Open scanner
                  </ActionLink>
                }
              />
            )}
          </div>
        </Panel>

        <Panel
          title="Operator Queue"
          eyebrow="Action required"
          icon={<Waypoints className="h-4 w-4" />}
        >
          <div className="space-y-3 p-standard">
            <ModuleNotice
              tone={reviewWork ? "warning" : "success"}
              title={reviewWork ? `${reviewWork} alerts need review` : "Alert review is clear"}
              message={
                reviewWork
                  ? "Accept, reject, or hold these signals so strategy outcomes become measurable."
                  : "No pending strategy alerts are waiting for a decision."
              }
              action={reviewWork ? <ActionLink href="/alerts">Triage</ActionLink> : undefined}
            />
            <ModuleNotice
              tone={operationalIssues ? "warning" : "success"}
              title={
                operationalIssues
                  ? `${operationalIssues} pipeline items need attention`
                  : "Ingestion and delivery are nominal"
              }
              message={
                operationalIssues
                  ? `${dashboard.pipeline.rawEventsFailed} raw events failed, ${dashboard.pipeline.deliveriesFailed} deliveries failed, and ${dashboard.pipeline.failuresOpen} processing failures remain open.`
                  : "No current ingestion, delivery, or processing failures are reported."
              }
              action={
                operationalIssues ? <ActionLink href="/settings">Inspect</ActionLink> : undefined
              }
            />
            <div className="rounded-sm border border-outline bg-surface px-3 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                <Database className="h-4 w-4 text-primary" />
                Evidence source
              </div>
              <p className="mt-2 text-sm text-on-surface-variant">
                {dashboard.system.dataSourceSummary}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                Runtime {dashboard.system.version} · {dashboard.system.environment}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Alert Triage"
          eyebrow="Strategy matches only"
          icon={<BellRing className="h-4 w-4" />}
          action={
            <Link
              href="/alerts"
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary"
            >
              Open feed
            </Link>
          }
        >
          <div className="divide-y divide-outline">
            {dashboard.recentAlerts.length ? (
              dashboard.recentAlerts.slice(0, 6).map((alert) => (
                <Link
                  key={alert.id}
                  href={`/alerts?selected=${alert.id}`}
                  className="block border-l-2 border-l-transparent px-standard py-3 transition-colors hover:border-l-primary hover:bg-surface-high"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          tone={
                            alert.priority === "critical"
                              ? "danger"
                              : alert.priority === "high"
                                ? "warning"
                                : "primary"
                          }
                        >
                          {alert.priority}
                        </StatusBadge>
                        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-on-surface-variant">
                          {alert.status}
                        </span>
                      </div>
                      <p className="mt-2 truncate font-semibold text-on-surface">{alert.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">
                        {alert.message || `Strategy ${alert.strategyName || "match"}`}
                      </p>
                    </div>
                    <span className={`font-mono text-lg ${scoreTone(alert.signalScore)}`}>
                      {alert.signalScore}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState
                title="No strategy alerts"
                message="Market observations are available in Scanner; alerts appear only when an active strategy matches."
              />
            )}
          </div>
        </Panel>

        <Panel
          title="Verified Wallet Movement"
          eyebrow="Recent tracked trades"
          icon={<Wallet className="h-4 w-4" />}
          action={
            <Link
              href="/wallets"
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary"
            >
              Wallet intelligence
            </Link>
          }
        >
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-outline bg-surface-high font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                <tr>
                  <th className="px-standard py-3">Wallet</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Token</th>
                  <th className="px-standard py-3 text-right">Native Flow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline">
                {dashboard.recentWalletTrades.length ? (
                  dashboard.recentWalletTrades.map((trade) => (
                    <tr key={trade.id} className="transition-colors hover:bg-surface-high">
                      <td className="px-standard py-3">
                        <Link
                          href={`/wallets?address=${trade.walletAddress}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {shortAddress(trade.walletAddress)}
                        </Link>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {formatRelative(trade.tradedAt)}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge
                          tone={
                            trade.tradeType.toLowerCase().includes("buy") ? "success" : "warning"
                          }
                        >
                          {trade.tradeType}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/tokens/${trade.tokenAddress}`}
                          className="font-semibold text-on-surface hover:text-primary"
                        >
                          ${trade.tokenSymbol}
                        </Link>
                      </td>
                      <td className="px-standard py-3 text-right font-mono text-on-surface">
                        {trade.valueSol === null ? "n/a" : `${formatNumber(Number(trade.valueSol))} SOL`}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        title="No recent wallet movement"
                        message="Wallet trades will appear when tracked wallets are synchronized and valid activity is found."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel
        title="System Evidence"
        eyebrow="Module-level health"
        icon={
          operationalIssues ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )
        }
      >
        <div className="grid gap-3 p-standard sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Raw Pending"
            value={dashboard.pipeline.rawEventsPending}
            tone={dashboard.pipeline.rawEventsPending ? "warning" : "default"}
          />
          <MetricCard
            label="Alerts Delivered"
            value={dashboard.pipeline.alertsDelivered}
            tone="success"
          />
          <MetricCard
            label="Deliveries Failed"
            value={dashboard.pipeline.deliveriesFailed}
            tone={dashboard.pipeline.deliveriesFailed ? "danger" : "default"}
          />
          <MetricCard
            label="Failures Open"
            value={dashboard.pipeline.failuresOpen}
            tone={dashboard.pipeline.failuresOpen ? "warning" : "default"}
          />
        </div>
      </Panel>
    </div>
  );
}
