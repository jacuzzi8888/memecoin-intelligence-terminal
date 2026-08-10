"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, Lock, Route, Search, Wallet, Zap } from "lucide-react";
import { ErrorState, LoadingRows, MetricCard, Panel, StaleBlock, StatusBadge, formatRelative, formatTokenPrice, formatUsd, shortAddress } from "@/components/aegis-ui";
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

export default function TerminalPage() {
  const [payload, setPayload] = useState<TerminalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string | null>(null);
  const [marketQuery, setMarketQuery] = useState("");

  useEffect(() => {
    async function fetchTerminal() {
      setLoading(true);
      try {
        const apiUrl = API_BASE_URL;
        const response = await fetch(`${apiUrl}/api/v1/terminal`, { cache: "no-store" });
        const data: { success?: boolean; data?: TerminalPayload; error?: string } = await response.json();
        if (!data.success || !data.data) throw new Error(data.error || "Terminal API unavailable");
        setPayload(data.data);
        setSelectedTokenAddress((current) => current ?? data.data?.marketRail[0]?.tokenAddress ?? null);
        setError(null);
      } catch (fetchError) {
        setPayload(null);
        setError(fetchError instanceof Error ? fetchError.message : "Unable to reach terminal API.");
      } finally {
        setLoading(false);
      }
    }

    fetchTerminal();
  }, []);

  const selectedMarket = useMemo(
    () => payload?.marketRail.find((item) => item.tokenAddress === selectedTokenAddress) ?? payload?.marketRail[0] ?? null,
    [payload, selectedTokenAddress],
  );
  const visibleMarkets = useMemo(() => {
    const query = marketQuery.trim().toLowerCase();
    if (!query) return payload?.marketRail ?? [];
    return (payload?.marketRail ?? []).filter((market) => [market.symbol, market.name ?? "", market.tokenAddress].some((value) => value.toLowerCase().includes(query)));
  }, [marketQuery, payload]);
  const latestQuote = payload?.quoteRecords[0] ?? null;
  const primaryAccount = payload?.tradingAccounts.find((account) => account.isPrimary) ?? payload?.tradingAccounts[0] ?? null;

  if (loading) return <LoadingRows rows={5} />;

  return (
    <div className="space-y-4">
      {error ? <ErrorState title="Terminal degraded" message={error} /> : null}

      <div className="grid gap-4 xl:grid-cols-[280px_1fr_360px]">
        <Panel title="Market Rail" icon={<Search className="h-4 w-4" />}>
          <div className="space-y-3 p-standard">
            <input
              placeholder="Search token or pair"
              value={marketQuery}
              onChange={(event) => setMarketQuery(event.target.value)}
              className="h-10 w-full rounded-sm border border-outline bg-surface px-3 text-sm text-on-surface outline-none placeholder:text-on-surface-variant"
            />
            {visibleMarkets.length > 0 ? visibleMarkets.map((market) => (
              <button
                key={market.tokenAddress}
                onClick={() => setSelectedTokenAddress(market.tokenAddress)}
                className={`w-full rounded-sm border px-3 py-3 text-left ${selectedMarket?.tokenAddress === market.tokenAddress ? "border-primary/40 bg-primary-container/10" : "border-outline bg-surface"}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm text-on-surface">${market.symbol}</p>
                  <p className={`font-mono text-sm ${market.priceChange24h >= 0 ? "text-success" : "text-destructive"}`}>
                    {market.priceChange24h >= 0 ? "+" : ""}{market.priceChange24h.toFixed(1)}%
                  </p>
                </div>
                <p className="mt-1 text-xs text-on-surface-variant">{formatRelative(market.snapshotAt)}</p>
              </button>
            )) : (
              <div className="rounded-sm border border-outline bg-surface px-3 py-6 text-sm text-on-surface-variant">
                No market snapshots available.
              </div>
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <section className="rounded-lg border border-outline bg-surface-container p-standard shadow-panel">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-semibold text-on-surface">
                    {selectedMarket ? `$${selectedMarket.symbol}` : "Terminal"}
                  </h1>
                  <StatusBadge tone="primary">Preparation</StatusBadge>
                </div>
                <p className="mt-2 font-mono text-3xl text-success">{formatTokenPrice(selectedMarket?.priceUsd)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 md:w-[360px]">
                <MetricCard label="24H Chg" value={selectedMarket ? `${selectedMarket.priceChange24h.toFixed(2)}%` : "n/a"} tone={(selectedMarket?.priceChange24h ?? 0) >= 0 ? "success" : "danger"} />
                <MetricCard label="24H Vol" value={formatUsd(selectedMarket?.volume24hUsd)} tone="primary" />
              </div>
            </div>
          </section>

          <Panel title="Execution Chart" icon={<BarChart3 className="h-4 w-4" />}>
            <div className="p-standard">
              <div className="relative flex h-[420px] items-center justify-center overflow-hidden rounded-sm border border-outline bg-surface">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(67,70,85,0.28)_1px,transparent_1px),linear-gradient(to_bottom,rgba(67,70,85,0.28)_1px,transparent_1px)] bg-[size:40px_40px]" />
                <div className="relative max-w-md rounded-sm border border-outline bg-surface-container/95 px-5 py-4 text-center">
                  <p className="font-semibold text-on-surface">Historical chart unavailable</p>
                  <p className="mt-2 text-sm text-on-surface-variant">Only the latest verified market snapshot is available on this surface. No synthetic price line is displayed.</p>
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex h-8 items-center justify-between border-t border-outline bg-surface/90 px-4 font-mono text-[11px] text-on-surface-variant">
                  <span>Snapshot</span>
                  <span>{selectedMarket ? formatRelative(selectedMarket.snapshotAt) : "No data"}</span>
                </div>
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Trade Intents" value={payload?.tradeIntents.length ?? 0} tone="primary" />
            <MetricCard label="Quotes" value={payload?.quoteRecords.length ?? 0} tone="warning" />
            <MetricCard label="Wallet State" value={primaryAccount ? "Connected" : "Read-only"} detail={primaryAccount ? shortAddress(primaryAccount.walletAddress) : "No trading account"} />
          </div>

          <StaleBlock title="Execution is preparation-only" message={payload?.executionState.reason ?? "Transaction signing is not enabled."} />
        </div>

        <Panel title="Order Prep" icon={<Zap className="h-4 w-4" />}>
          <div className="space-y-4 p-standard">
            <div className="grid grid-cols-2 gap-1 rounded-sm border border-outline bg-surface p-1">
              <button className="rounded-sm bg-success/20 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-success">Buy</button>
              <button className="rounded-sm py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Sell</button>
            </div>
            <div className="rounded-sm border border-outline bg-surface px-3 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Route</span>
                <span className="flex items-center gap-1 font-mono text-on-surface">
                  {latestQuote?.provider ?? "No quote"} <Route className="h-3.5 w-3.5 text-primary" />
                </span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-on-surface-variant">Expected output</span>
                <span className="font-mono text-primary">{latestQuote ? latestQuote.expectedOutput.toLocaleString() : "n/a"}</span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-on-surface-variant">Price impact</span>
                <span className="font-mono text-warning">{latestQuote?.priceImpactPct !== null && latestQuote?.priceImpactPct !== undefined ? `${latestQuote.priceImpactPct}%` : "n/a"}</span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-on-surface-variant">Wallet</span>
                <span className="flex items-center gap-1 font-mono text-warning">
                  <Wallet className="h-3.5 w-3.5" /> {primaryAccount ? shortAddress(primaryAccount.walletAddress) : "Not connected"}
                </span>
              </div>
            </div>
            {selectedMarket ? (
              <Link href={`/tokens/${selectedMarket.tokenAddress}`} className="flex w-full items-center justify-center gap-2 rounded-sm border border-primary/30 bg-primary-container px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-primary-foreground">
                Open Research
              </Link>
            ) : null}
            <button className="flex w-full items-center justify-center gap-2 rounded-sm border border-outline bg-surface-container px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface" disabled>
              <Lock className="h-4 w-4" />
              Execute Unavailable
            </button>
            <div className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-on-surface-variant">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>High-risk confirmations, approvals, and wallet signing must be implemented before real execution.</p>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
