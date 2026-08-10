"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Lock,
  Radar,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  LoadingRows,
  MetricCard,
  Panel,
  StatusBadge,
  formatRelative,
  formatTokenPrice,
  formatUsd,
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

interface TerminalPayload {
  marketRail: Array<{
    tokenAddress: string;
    symbol: string;
    name: string | null;
    priceUsd: number;
    priceChange1h: number;
    priceChange24h: number;
    volume24hUsd: number;
    liquidityUsd: number;
    snapshotAt: string;
  }>;
  tradingAccounts: Array<{
    id: string;
    walletAddress: string;
    label: string | null;
    isPrimary: boolean;
    connectedAt: string;
    lastUsedAt: string | null;
  }>;
  tradeIntents: Array<{
    id: string;
    tokenAddress: string;
    tradeType: string;
    amount: number;
    amountType: string;
    slippageBps: number;
    status: string;
    createdAt: string;
  }>;
  quoteRecords: Array<{
    id: string;
    provider: string;
    inputMint: string;
    outputMint: string;
    inputAmount: number;
    expectedOutput: number;
    minimumOutput: number;
    priceImpactPct: number | null;
    expiresAt: string | null;
    createdAt: string;
  }>;
  executionState: {
    mode: string;
    reason: string;
  };
}

function operatorRefreshMs() {
  try {
    const preferences = JSON.parse(
      window.localStorage.getItem("aegis-operator-preferences") || "{}",
    ) as { refreshIntervalSeconds?: number };
    const seconds = Number(preferences.refreshIntervalSeconds);
    return [15, 30, 60].includes(seconds) ? seconds * 1_000 : 15_000;
  } catch {
    return 15_000;
  }
}

export default function TerminalPage() {
  const [payload, setPayload] = useState<TerminalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string | null>(null);
  const [marketQuery, setMarketQuery] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const fetchTerminal = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/terminal`, { cache: "no-store" });
      const data = (await response.json()) as {
        success?: boolean;
        data?: TerminalPayload;
        error?: string;
        timestamp?: string;
      };
      if (!response.ok || !data.success || !data.data)
        throw new Error(data.error || "Terminal API unavailable");
      setPayload(data.data);
      setSelectedTokenAddress((current) => {
        const requested = new URLSearchParams(window.location.search).get("token");
        if (requested && data.data?.marketRail.some((market) => market.tokenAddress === requested))
          return requested;
        return current ?? data.data?.marketRail[0]?.tokenAddress ?? null;
      });
      setLastUpdatedAt(data.timestamp ?? new Date().toISOString());
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to reach terminal API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTerminal();
    const timer = window.setInterval(() => void fetchTerminal(true), operatorRefreshMs());
    return () => window.clearInterval(timer);
  }, [fetchTerminal]);

  const selectedMarket = useMemo(
    () =>
      payload?.marketRail.find((item) => item.tokenAddress === selectedTokenAddress) ??
      payload?.marketRail[0] ??
      null,
    [payload, selectedTokenAddress],
  );
  const visibleMarkets = useMemo(() => {
    const query = marketQuery.trim().toLowerCase();
    if (!query) return payload?.marketRail ?? [];
    return (payload?.marketRail ?? []).filter((market) =>
      [market.symbol, market.name ?? "", market.tokenAddress].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [marketQuery, payload]);
  const relatedQuote =
    payload?.quoteRecords.find(
      (quote) =>
        quote.inputMint === selectedTokenAddress || quote.outputMint === selectedTokenAddress,
    ) ?? null;
  const relatedIntents =
    payload?.tradeIntents.filter((intent) => intent.tokenAddress === selectedTokenAddress) ?? [];
  const primaryAccount =
    payload?.tradingAccounts.find((account) => account.isPrimary) ??
    payload?.tradingAccounts[0] ??
    null;
  const snapshotFresh = selectedMarket
    ? Date.now() - new Date(selectedMarket.snapshotAt).getTime() <= 5 * 60_000
    : false;
  const quoteFresh = relatedQuote?.expiresAt
    ? new Date(relatedQuote.expiresAt).getTime() > Date.now()
    : false;

  if (loading && !payload) return <LoadingRows rows={5} />;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Decision support only"
        title="Execution Readiness"
        description="Validate market evidence and research context here. Wallet signing, simulation, and transaction submission remain locked until Phase 3."
        actions={
          <>
            <ActionLink href="/scanner" icon={<Radar className="h-4 w-4" />}>
              Return to scanner
            </ActionLink>
            <RefreshButton onClick={() => void fetchTerminal()} busy={loading} />
          </>
        }
        meta={
          <>
            <StatusBadge tone="warning">Execution locked</StatusBadge>
            <FreshnessStamp value={lastUpdatedAt} />
          </>
        }
      />

      {error ? (
        <ModuleNotice
          tone="danger"
          title="Terminal refresh failed"
          message={`${error} Last verified terminal data remains visible where available.`}
        />
      ) : null}
      <ModuleNotice
        tone="warning"
        title="No trade can be submitted from this page"
        message={
          payload?.executionState.reason ??
          "Transaction simulation, risk confirmation, signing, and submission are not enabled."
        }
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <Panel title="Market Rail" icon={<Search className="h-4 w-4" />}>
          <div className="space-y-3 p-standard">
            <label>
              <span className="sr-only">Search market snapshots</span>
              <input
                placeholder="Search token or address"
                value={marketQuery}
                onChange={(event) => setMarketQuery(event.target.value)}
                className="h-10 w-full rounded-sm border border-outline bg-surface px-3 text-sm text-on-surface outline-none placeholder:text-on-surface-variant"
              />
            </label>
            {visibleMarkets.length > 0 ? (
              visibleMarkets.map((market) => (
                <button
                  type="button"
                  key={market.tokenAddress}
                  onClick={() => setSelectedTokenAddress(market.tokenAddress)}
                  className={`w-full rounded-sm border px-3 py-3 text-left transition-colors ${selectedMarket?.tokenAddress === market.tokenAddress ? "border-primary/40 bg-primary-container/10" : "border-outline bg-surface hover:border-primary/40"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-mono text-sm text-on-surface">${market.symbol}</p>
                    <p
                      className={`font-mono text-sm ${market.priceChange24h >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {market.priceChange24h >= 0 ? "+" : ""}
                      {market.priceChange24h.toFixed(1)}%
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {formatRelative(market.snapshotAt)}
                  </p>
                </button>
              ))
            ) : (
              <EmptyState
                title="No market snapshots"
                message="Run ingestion or change the search query before using the readiness surface."
              />
            )}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <section className="rounded-lg border border-outline bg-surface-container p-standard shadow-panel">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-3xl font-semibold text-on-surface">
                    {selectedMarket ? `$${selectedMarket.symbol}` : "No market selected"}
                  </h2>
                  <StatusBadge tone={snapshotFresh ? "success" : "stale"}>
                    {snapshotFresh ? "Fresh snapshot" : "Check freshness"}
                  </StatusBadge>
                </div>
                <p className="mt-2 font-mono text-3xl text-success">
                  {formatTokenPrice(selectedMarket?.priceUsd)}
                </p>
                <p className="mt-2 truncate font-mono text-xs text-on-surface-variant">
                  {selectedMarket?.tokenAddress ?? "Select a token from the market rail"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 md:w-[360px]">
                <MetricCard
                  label="24H Chg"
                  value={selectedMarket ? `${selectedMarket.priceChange24h.toFixed(2)}%` : "n/a"}
                  tone={(selectedMarket?.priceChange24h ?? 0) >= 0 ? "success" : "danger"}
                />
                <MetricCard
                  label="24H Vol"
                  value={formatUsd(selectedMarket?.volume24hUsd)}
                  tone="primary"
                />
              </div>
            </div>
          </section>

          <Panel title="Market Context" icon={<BarChart3 className="h-4 w-4" />}>
            <div className="p-standard">
              <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-sm border border-outline bg-surface md:min-h-[380px]">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(67,70,85,0.22)_1px,transparent_1px),linear-gradient(to_bottom,rgba(67,70,85,0.22)_1px,transparent_1px)] bg-[size:40px_40px]" />
                <div className="relative max-w-md rounded-sm border border-outline bg-surface-container/95 px-5 py-4 text-center">
                  <p className="font-semibold text-on-surface">Historical series not available</p>
                  <p className="mt-2 text-sm leading-5 text-on-surface-variant">
                    The terminal shows the latest stored snapshot only. A price line is deliberately
                    omitted instead of inventing chart history.
                  </p>
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex min-h-8 items-center justify-between gap-3 border-t border-outline bg-surface/90 px-4 py-2 font-mono text-[11px] text-on-surface-variant">
                  <span>Verified snapshot</span>
                  <span>
                    {selectedMarket ? formatRelative(selectedMarket.snapshotAt) : "No data"}
                  </span>
                </div>
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Related Intents"
              value={relatedIntents.length}
              tone="primary"
              detail="Stored preparation records"
            />
            <MetricCard
              label="Related Quote"
              value={relatedQuote ? (quoteFresh ? "Fresh" : "Expired") : "None"}
              tone={quoteFresh ? "success" : "warning"}
              detail="Not executable"
            />
            <MetricCard
              label="Wallet Evidence"
              value={primaryAccount ? "Recorded" : "Missing"}
              detail={
                primaryAccount ? shortAddress(primaryAccount.walletAddress) : "No trading account"
              }
            />
          </div>
        </div>

        <div className="space-y-4">
          <Panel title="Phase 3 Gate" icon={<ShieldCheck className="h-4 w-4" />}>
            <div className="space-y-4 p-standard">
              <ReadinessRow
                ready={Boolean(selectedMarket)}
                label="Market selected"
                detail={selectedMarket ? `$${selectedMarket.symbol}` : "Select a market snapshot"}
              />
              <ReadinessRow
                ready={snapshotFresh}
                label="Snapshot freshness"
                detail={selectedMarket ? formatRelative(selectedMarket.snapshotAt) : "No snapshot"}
              />
              <ReadinessRow
                ready={Boolean(relatedQuote)}
                label="Stored quote evidence"
                detail={
                  relatedQuote
                    ? `${relatedQuote.provider} record, ${quoteFresh ? "not expired" : "expired"}`
                    : "No related quote record"
                }
              />
              <ReadinessRow
                ready={Boolean(primaryAccount)}
                label="Wallet record"
                detail={
                  primaryAccount ? shortAddress(primaryAccount.walletAddress) : "No wallet record"
                }
              />
              <ReadinessRow
                ready={false}
                label="Simulation and signing"
                detail="Not implemented; execution remains locked"
              />
            </div>
          </Panel>

          <Panel title="Decision Actions" icon={<Wallet className="h-4 w-4" />}>
            <div className="space-y-3 p-standard">
              {selectedMarket ? (
                <>
                  <ActionLink href={`/tokens/${selectedMarket.tokenAddress}`} tone="primary">
                    Open token dossier
                  </ActionLink>
                  <ActionLink
                    href={`/watchlists?type=token&address=${encodeURIComponent(selectedMarket.tokenAddress)}&note=${encodeURIComponent("Terminal readiness review")}`}
                  >
                    Add to watchlist
                  </ActionLink>
                  <ActionLink
                    href={`/alerts?search=${encodeURIComponent(selectedMarket.tokenAddress)}`}
                  >
                    Review related alerts
                  </ActionLink>
                </>
              ) : (
                <p className="text-sm text-on-surface-variant">
                  Select a market before starting an investigation.
                </p>
              )}
              <div className="flex items-start gap-2 rounded-sm border border-warning/35 bg-warning/10 px-3 py-3 text-sm text-on-surface-variant">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>
                  Buy, sell, approval, and signing controls will appear only after the execution
                  safety gate is implemented and tested.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ReadinessRow({ ready, label, detail }: { ready: boolean; label: string; detail: string }) {
  const Icon = ready ? CheckCircle2 : CircleAlert;
  return (
    <div className="flex items-start gap-3 border-b border-outline pb-3 last:border-0 last:pb-0">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ready ? "text-success" : "text-warning"}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-on-surface">{label}</p>
        <p className="mt-1 text-xs leading-4 text-on-surface-variant">{detail}</p>
      </div>
    </div>
  );
}
