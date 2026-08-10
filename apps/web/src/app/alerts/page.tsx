"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  BookmarkPlus,
  ExternalLink,
  Filter,
  Radio,
  Radar,
} from "lucide-react";
import {
  AegisSelect,
  LoadingRows,
  MetricCard,
  Panel,
  StatusBadge,
  formatRelative,
  priorityTone,
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
import { apiFetch } from "@/lib/api-client";

interface AlertData {
  id: string;
  title: string;
  message?: string;
  priority: string;
  signalScore: number;
  status: string;
  triggeredAt: string;
  tokenAddress: string;
  webDeepLink: string;
  dataSource: string;
  dataFreshness: string;
  strategyName?: string;
  review?: {
    verdict: "valid" | "false_positive" | "uncertain";
    notes?: string | null;
    reviewedAt: string;
  } | null;
  reviewRecommendation?: {
    verdict: "likely_valid" | "likely_false_positive" | "pending_evidence";
    reason: string;
  };
  outcomes: Array<{
    outcomeType: string;
    outcomeValue: number | null;
    recordedAt: string;
  }>;
}

interface OutcomeSummary {
  outcomeType: string;
  count: number;
  avgReturnPct: number;
  winRate: number;
  maxReturnPct: number;
  minReturnPct: number;
}

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function outcomeLabel(type: string) {
  return type.replace("return_", "").replace("_pct", "").toUpperCase();
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [outcomeSummary, setOutcomeSummary] = useState<OutcomeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [outcomeMessage, setOutcomeMessage] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [viewedIds, setViewedIds] = useState<string[]>([]);

  useEffect(() => {
    async function fetchAlerts() {
      setLoading(true);
      try {
        const apiUrl = API_BASE_URL;
        const [alertsRes, summaryRes] = await Promise.all([
          fetch(`${apiUrl}/api/v1/alerts?limit=50`, { cache: "no-store" }),
          fetch(`${apiUrl}/api/v1/alerts/outcomes/summary?sinceDays=7`, { cache: "no-store" }),
        ]);
        const data: { success?: boolean; data?: AlertData[]; error?: string } =
          await alertsRes.json();
        const summaryData: { success?: boolean; data?: OutcomeSummary[] } = await summaryRes.json();
        if (data.success && data.data) {
          setAlerts(data.data);
          setOutcomeSummary(summaryData.success && summaryData.data ? summaryData.data : []);
          setSelectedId(
            (current) =>
              current ??
              data.data?.find(
                (alert) => alert.id === new URLSearchParams(window.location.search).get("selected"),
              )?.id ??
              data.data?.[0]?.id ??
              null,
          );
          setError(null);
        } else {
          setError(data.error ?? "Alerts are unavailable.");
        }
      } catch {
        setError("Unable to reach alerts API.");
      } finally {
        setLoading(false);
      }
    }
    fetchAlerts();
  }, [refreshNonce]);

  useEffect(() => {
    try {
      setViewedIds(
        JSON.parse(window.localStorage.getItem("aegis-viewed-alerts") || "[]") as string[],
      );
    } catch {
      window.localStorage.removeItem("aegis-viewed-alerts");
    }
  }, []);

  async function backfillOutcomes() {
    setBackfilling(true);
    setOutcomeMessage("Measuring alert outcomes from stored market snapshots.");
    try {
      const apiUrl = API_BASE_URL;
      const res = await apiFetch(`${apiUrl}/api/v1/alerts/outcomes/backfill`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 500, sinceDays: 7 }),
        cache: "no-store",
      });
      const payload: {
        success?: boolean;
        error?: string;
        data?: {
          alertsScanned?: number;
          outcomesInserted?: number;
          outcomesPending?: number;
          outcomesSkippedExisting?: number;
          alertsWithoutBaseline?: number;
        };
      } = await res.json();

      if (!payload.success) {
        setOutcomeMessage(payload.error ?? "Outcome backfill failed.");
        return;
      }

      setOutcomeMessage(
        `Outcomes: ${payload.data?.outcomesInserted ?? 0} inserted, ${payload.data?.outcomesSkippedExisting ?? 0} existing, ${payload.data?.outcomesPending ?? 0} pending, ${payload.data?.alertsWithoutBaseline ?? 0} without baseline.`,
      );
      setRefreshNonce((current) => current + 1);
    } catch {
      setOutcomeMessage("Outcome backfill failed because the API could not be reached.");
    } finally {
      setBackfilling(false);
    }
  }

  async function reviewAlert(verdict: "valid" | "false_positive" | "uncertain") {
    if (!selectedAlert) return;
    setReviewing(true);
    try {
      const apiUrl = API_BASE_URL;
      const res = await apiFetch(`${apiUrl}/api/v1/alerts/${selectedAlert.id}/review`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verdict, notes: reviewNote.trim() || undefined }),
        cache: "no-store",
      });
      const payload: {
        success?: boolean;
        error?: string;
        data?: {
          verdict: "valid" | "false_positive" | "uncertain";
          notes?: string | null;
          reviewedAt: string;
        };
      } = await res.json();
      if (!payload.success || !payload.data)
        throw new Error(payload.error ?? "Review could not be saved.");
      setAlerts((current) =>
        current.map((alert) =>
          alert.id === selectedAlert.id
            ? {
                ...alert,
                review: {
                  verdict,
                  notes: payload.data?.notes ?? null,
                  reviewedAt: payload.data?.reviewedAt ?? new Date().toISOString(),
                },
              }
            : alert,
        ),
      );
      setReviewNote("");
      setOutcomeMessage(`Review saved: ${verdict.replace("_", " ")}.`);
    } catch (reviewError) {
      setOutcomeMessage(
        reviewError instanceof Error ? reviewError.message : "Review could not be saved.",
      );
    } finally {
      setReviewing(false);
    }
  }

  const filteredAlerts =
    filter === "all"
      ? alerts
      : filter === "needs_review"
        ? alerts.filter((alert) => !alert.review)
        : alerts.filter((alert) => alert.priority === filter);
  const selectedAlert = useMemo(
    () => filteredAlerts.find((alert) => alert.id === selectedId) ?? filteredAlerts[0] ?? null,
    [filteredAlerts, selectedId],
  );
  const criticalCount = alerts.filter((alert) => alert.priority === "critical").length;
  const staleCount = alerts.filter(
    (alert) => Date.now() - new Date(alert.dataFreshness).getTime() > 20 * 60 * 1000,
  ).length;
  const oneHourSummary = outcomeSummary.find((item) => item.outcomeType === "return_1h_pct");
  const fifteenMinuteSummary = outcomeSummary.find((item) => item.outcomeType === "return_15m_pct");
  const needsReviewCount = alerts.filter((alert) => !alert.review).length;
  const unreadCount = alerts.filter((alert) => !viewedIds.includes(alert.id)).length;

  function selectAlert(alertId: string) {
    setSelectedId(alertId);
    setViewedIds((current) => {
      if (current.includes(alertId)) return current;
      const next = [...current, alertId].slice(-500);
      window.localStorage.setItem("aegis-viewed-alerts", JSON.stringify(next));
      return next;
    });
  }

  if (loading && alerts.length === 0) return <LoadingRows rows={5} />;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Decision queue"
        title="Review alerts and teach the strategy engine"
        description="Only active strategy matches enter this feed. Review decisions and measured outcomes turn notifications into evidence instead of noise."
        meta={
          <>
            <FreshnessStamp value={alerts[0]?.triggeredAt} label="Latest alert" />
            <StatusBadge tone={unreadCount ? "primary" : "success"}>
              {unreadCount} unread
            </StatusBadge>
          </>
        }
        actions={
          <>
            <ActionLink href="/scanner" icon={<Radar className="h-3.5 w-3.5" />}>
              Market observations
            </ActionLink>
            <RefreshButton
              onClick={() => setRefreshNonce((current) => current + 1)}
              busy={loading}
            />
          </>
        }
      />
      {error ? (
        <ModuleNotice
          tone="warning"
          title="Alert refresh degraded"
          message={`${error} The last successful alert feed remains visible.`}
          action={
            <RefreshButton
              onClick={() => setRefreshNonce((current) => current + 1)}
              busy={loading}
            />
          }
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard
          label="Active Alerts"
          value={alerts.length}
          tone="primary"
          detail={`${unreadCount} unread in this browser`}
        />
        <MetricCard
          label="Critical"
          value={criticalCount}
          tone={criticalCount ? "danger" : "default"}
        />
        <MetricCard
          label="Needs Review"
          value={needsReviewCount}
          tone={needsReviewCount ? "warning" : "success"}
        />
        <MetricCard
          label="15m Avg"
          value={formatPct(fifteenMinuteSummary?.avgReturnPct)}
          tone={(fifteenMinuteSummary?.avgReturnPct ?? 0) >= 0 ? "success" : "danger"}
        />
        <MetricCard
          label="1h Win Rate"
          value={oneHourSummary ? `${Math.round(oneHourSummary.winRate * 100)}%` : "n/a"}
        />
      </div>

      <div className="rounded-lg border border-outline bg-surface-container px-standard py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={staleCount ? "stale" : "success"}>
              {staleCount} stale source(s)
            </StatusBadge>
            <StatusBadge tone="primary">{filteredAlerts.length} filtered</StatusBadge>
            {outcomeSummary.slice(0, 5).map((item) => (
              <StatusBadge
                key={item.outcomeType}
                tone={item.avgReturnPct >= 0 ? "success" : "danger"}
              >
                {outcomeLabel(item.outcomeType)} {formatPct(item.avgReturnPct)}
              </StatusBadge>
            ))}
            {outcomeMessage ? (
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                {outcomeMessage}
              </span>
            ) : null}
          </div>
          <button
            onClick={backfillOutcomes}
            disabled={backfilling}
            className="rounded-sm border border-primary/30 bg-primary-container/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary disabled:cursor-wait disabled:opacity-60"
          >
            {backfilling ? "Measuring" : "Backfill outcomes"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Panel
          title="Alert Triage"
          icon={<BellRing className="h-4 w-4" />}
          action={
            <AegisSelect
              label="Triage view"
              value={filter}
              onChange={setFilter}
              options={[
                { label: "All alerts", value: "all" },
                { label: "Needs review", value: "needs_review" },
                { label: "Critical", value: "critical" },
                { label: "High", value: "high" },
                { label: "Medium", value: "medium" },
              ]}
              className="min-w-[180px]"
            />
          }
        >
          <div className="divide-y divide-outline">
            {filteredAlerts.length === 0 ? (
              <EmptyState
                title="No alerts match"
                message="Change the triage view or return to Scanner to inspect broader market observations."
              />
            ) : (
              filteredAlerts.map((alert) => {
                const active = selectedAlert?.id === alert.id;
                return (
                  <button
                    key={alert.id}
                    onClick={() => selectAlert(alert.id)}
                    className={`relative w-full border-l-4 px-standard py-4 text-left transition-colors ${priorityTone(alert.priority)} ${
                      active ? "bg-surface-high" : "hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
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
                          {!viewedIds.includes(alert.id) ? (
                            <StatusBadge tone="primary">Unread</StatusBadge>
                          ) : null}
                          <p className="truncate font-semibold text-on-surface">{alert.title}</p>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">
                          {alert.message ?? alert.status}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                          <span>{shortAddress(alert.tokenAddress)}</span>
                          <span>{alert.strategyName ?? "Unknown strategy"}</span>
                          <span>{formatRelative(alert.triggeredAt)}</span>
                          <StatusBadge
                            tone={
                              alert.review?.verdict === "false_positive"
                                ? "danger"
                                : alert.review
                                  ? "success"
                                  : "warning"
                            }
                          >
                            {alert.review?.verdict?.replace("_", " ") ?? "needs review"}
                          </StatusBadge>
                          {alert.outcomes.slice(0, 2).map((outcome) => (
                            <span
                              key={`${alert.id}-${outcome.outcomeType}`}
                              className={
                                (outcome.outcomeValue ?? 0) >= 0
                                  ? "text-success"
                                  : "text-destructive"
                              }
                            >
                              {outcomeLabel(outcome.outcomeType)} {formatPct(outcome.outcomeValue)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-mono text-lg ${scoreTone(alert.signalScore)}`}>
                          {alert.signalScore}
                        </p>
                        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                          {alert.status}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Panel>

        <Panel title="Alert Detail" icon={<Radio className="h-4 w-4" />}>
          {selectedAlert ? (
            <div className="space-y-4 p-standard">
              <div className="rounded-lg border border-outline bg-surface px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <StatusBadge
                      tone={
                        selectedAlert.priority === "critical"
                          ? "danger"
                          : selectedAlert.priority === "high"
                            ? "warning"
                            : "primary"
                      }
                    >
                      {selectedAlert.priority}
                    </StatusBadge>
                    <h2 className="mt-3 text-xl font-semibold text-on-surface">
                      {selectedAlert.title}
                    </h2>
                  </div>
                  <AlertTriangle
                    className={
                      selectedAlert.priority === "critical"
                        ? "h-5 w-5 text-destructive"
                        : "h-5 w-5 text-warning"
                    }
                  />
                </div>
                <p className="mt-3 text-sm text-on-surface-variant">
                  {selectedAlert.message ?? "No message payload stored."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MetricCard
                  label="Score"
                  value={selectedAlert.signalScore}
                  tone={selectedAlert.signalScore >= 80 ? "success" : "warning"}
                />
                <MetricCard label="Freshness" value={formatRelative(selectedAlert.dataFreshness)} />
                <MetricCard label="Source" value={selectedAlert.dataSource} />
                <MetricCard label="Triggered" value={formatRelative(selectedAlert.triggeredAt)} />
              </div>

              <div className="rounded-lg border border-outline bg-surface px-4 py-4 text-sm">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" />
                  <p className="font-semibold text-on-surface">Measured Outcomes</p>
                </div>
                {selectedAlert.outcomes.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {selectedAlert.outcomes.map((outcome) => (
                      <div
                        key={outcome.outcomeType}
                        className="rounded-sm border border-outline bg-surface-container px-3 py-3"
                      >
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                          {outcomeLabel(outcome.outcomeType)}
                        </p>
                        <p
                          className={`mt-2 font-mono text-lg ${(outcome.outcomeValue ?? 0) >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {formatPct(outcome.outcomeValue)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-on-surface-variant">
                    No measured outcomes yet. Backfill after enough market snapshots exist.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-on-surface">False-Positive Review</p>
                    <p className="mt-1 text-on-surface-variant">
                      {selectedAlert.reviewRecommendation?.reason ??
                        "Review the alert against its measured outcome."}
                    </p>
                  </div>
                  <StatusBadge tone={selectedAlert.review ? "success" : "warning"}>
                    {selectedAlert.review?.verdict?.replace("_", " ") ?? "unreviewed"}
                  </StatusBadge>
                </div>
                <textarea
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="Why should this alert be trusted, rejected, or held?"
                  className="mt-3 min-h-20 w-full rounded-sm border border-outline bg-surface px-3 py-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary"
                  maxLength={2000}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => reviewAlert("valid")}
                    disabled={reviewing}
                    className="rounded-sm border border-success/40 bg-success/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-success disabled:opacity-50"
                  >
                    Accept signal
                  </button>
                  <button
                    onClick={() => reviewAlert("false_positive")}
                    disabled={reviewing}
                    className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-destructive disabled:opacity-50"
                  >
                    False positive
                  </button>
                  <button
                    onClick={() => reviewAlert("uncertain")}
                    disabled={reviewing}
                    className="rounded-sm border border-outline bg-surface-container px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant disabled:opacity-50"
                  >
                    Keep uncertain
                  </button>
                </div>
                {selectedAlert.review?.notes ? (
                  <p className="mt-3 text-xs text-on-surface-variant">
                    Previous note: {selectedAlert.review.notes}
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-outline bg-surface px-4 py-4 text-sm">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  <p className="font-semibold text-on-surface">Routing Context</p>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between gap-4">
                    <span className="text-on-surface-variant">Strategy</span>
                    <span className="font-mono text-on-surface">
                      {selectedAlert.strategyName ?? "Unknown"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-on-surface-variant">Token</span>
                    <span className="font-mono text-primary">
                      {shortAddress(selectedAlert.tokenAddress, 8, 6)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-on-surface-variant">Delivery</span>
                    <span className="font-mono text-success">{selectedAlert.status}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Link
                  href={`/tokens/${selectedAlert.tokenAddress}`}
                  className="flex items-center justify-center gap-2 rounded-sm border border-primary/30 bg-primary-container px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-primary-foreground"
                >
                  Open Research <ExternalLink className="h-4 w-4" />
                </Link>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/watchlists?type=token&address=${selectedAlert.tokenAddress}&note=${encodeURIComponent(`Alert ${selectedAlert.priority} score ${selectedAlert.signalScore}`)}`}
                    className="flex items-center justify-center gap-2 rounded-sm border border-outline bg-surface px-3 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface hover:text-primary"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    Watch token
                  </Link>
                  <Link
                    href="/strategies"
                    className="flex items-center justify-center gap-2 rounded-sm border border-outline bg-surface px-3 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface hover:text-primary"
                  >
                    Inspect strategy
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-standard text-sm text-on-surface-variant">
              Select an alert to inspect its routing and research context.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
