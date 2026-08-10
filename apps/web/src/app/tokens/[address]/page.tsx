"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Flame,
  Lock,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api-url";
import {
  ErrorState,
  LoadingRows,
  MetricCard,
  Panel,
  StaleBlock,
  StatusBadge,
  formatCompact,
  formatNumber,
  formatRelative,
  formatTokenPrice,
  formatUsd,
  scoreTone,
  shortAddress,
} from "@/components/aegis-ui";
import { ActionLink, EvidenceBar, ModuleNotice } from "@/components/workflow-ui";

interface TokenPayload {
  token: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    isVerified: boolean;
    firstSeenAt?: string;
  };
  market: {
    marketCapUsd: number;
    priceUsd: number;
    volume1hUsd: number;
    volume24hUsd: number;
    liquidityUsd: number;
    holderCount: number;
    priceChange1h: number;
    priceChange24h: number;
    snapshotAt: string;
  } | null;
  launch: {
    deployerAddress: string;
    launchedAt: string;
    initialLiquidityUsd: number;
    launchProgram?: string | null;
  } | null;
  intelligence: {
    score: number;
    confidence: number;
    rulesetVersion: string;
    priority: string;
    positiveFactors: Array<{ factorName: string; rawValue: unknown; contribution: number }>;
    negativeFactors: Array<{ factorName: string; rawValue: unknown; contribution: number }>;
    detectedAt?: string;
  } | null;
  chart: Array<{
    marketCapUsd: number;
    priceUsd: number;
    volume1hUsd: number;
    volume24hUsd: number;
    liquidityUsd: number;
    holderCount: number | null;
    priceChange1h: number;
    priceChange24h: number;
    snapshotAt: string;
  }>;
  walletEvidence: Array<{
    id: string;
    walletAddress: string;
    walletLabel: string | null;
    walletClassification: string;
    isQualified: boolean;
    walletScore: number | null;
    winRate: number | null;
    totalPnlUsd: number | null;
    qualificationReasons: unknown[];
    tradeType: string;
    amount: number;
    priceUsd: number | null;
    valueUsd: number | null;
    txSignature: string | null;
    tradedAt: string;
  }>;
  walletEvidenceSummary: {
    tradeCount: number;
    walletCount: number;
    qualifiedWalletCount: number;
    latestTradeAt: string | null;
  };
  relatedAlerts: Array<{
    id: string;
    title: string;
    message: string;
    priority: string;
    status: string;
    signalScore: number;
    triggeredAt: string;
  }>;
  timeline: Array<{
    id: string;
    type: string;
    title: string;
    detail: string;
    occurredAt: string;
  }>;
  dataSource: string;
  dataFreshness: string;
}

function chartPath(points: TokenPayload["chart"]) {
  const values = points.map((point) => point.priceUsd).filter((value) => value > 0);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 44 - ((value - min) / range) * 36;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function TokenPage() {
  const params = useParams();
  const address = params.address as string;
  const [data, setData] = useState<TokenPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchToken() {
      setLoading(true);
      setError(null);
      try {
        const apiUrl = API_BASE_URL;
        const res = await fetch(`${apiUrl}/api/v1/tokens/${address}`, { cache: "no-store" });
        const json: { success?: boolean; data?: TokenPayload; error?: string } = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setData(null);
          setError(json.error ?? "Token research data is unavailable.");
        }
      } catch {
        setData(null);
        setError("Unable to reach token research API.");
      } finally {
        setLoading(false);
      }
    }

    fetchToken();
  }, [address]);

  if (loading) return <LoadingRows rows={5} />;

  if (error || !data) {
    return (
      <div className="space-y-4">
        <ErrorState title="Research unavailable" message={error ?? "Token not found."} />
        <Panel title="Requested Token" icon={<Activity className="h-4 w-4" />}>
          <div className="break-all p-standard font-mono text-sm text-on-surface-variant">
            {address}
          </div>
        </Panel>
      </div>
    );
  }

  const { token, market, launch, intelligence } = data;
  const allFactors = [
    ...(intelligence?.positiveFactors ?? []).map((factor) => ({
      ...factor,
      tone: "success" as const,
    })),
    ...(intelligence?.negativeFactors ?? []).map((factor) => ({
      ...factor,
      tone: "danger" as const,
    })),
  ];
  const staleMarket = market?.snapshotAt
    ? Date.now() - new Date(market.snapshotAt).getTime() > 5 * 60 * 1000
    : true;
  const chartValues =
    data.chart.length > 0
      ? data.chart
      : market
        ? [
            {
              marketCapUsd: market.marketCapUsd,
              priceUsd: market.priceUsd,
              volume1hUsd: market.volume1hUsd,
              volume24hUsd: market.volume24hUsd,
              liquidityUsd: market.liquidityUsd,
              holderCount: market.holderCount,
              priceChange1h: market.priceChange1h,
              priceChange24h: market.priceChange24h,
              snapshotAt: market.snapshotAt,
            },
          ]
        : [];
  const maxVolume = Math.max(
    ...chartValues.map((point) => point.volume1hUsd || point.volume24hUsd || 0),
    1,
  );
  const chartPrices = chartValues.map((point) => point.priceUsd).filter((value) => value > 0);
  const chartMinPrice = chartPrices.length > 0 ? Math.min(...chartPrices) : null;
  const chartMaxPrice = chartPrices.length > 0 ? Math.max(...chartPrices) : null;
  const canChart = chartValues.length >= 2 && chartPath(chartValues) !== null;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <section className="rounded-lg border border-outline bg-surface-container p-standard shadow-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-outline bg-surface-bright font-mono text-2xl text-primary">
                {token.symbol.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h1 className="text-3xl font-semibold text-on-surface">${token.symbol}</h1>
                  <p className="text-sm text-on-surface-variant">{token.name} - SOL</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="font-mono text-xl text-success">
                    {formatTokenPrice(market?.priceUsd)}
                  </p>
                  <p
                    className={[
                      "flex items-center gap-1 font-mono text-sm",
                      (market?.priceChange24h ?? 0) >= 0 ? "text-success" : "text-destructive",
                    ].join(" ")}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    {formatNumber(market?.priceChange24h)}%
                  </p>
                  <span className="font-mono text-xs text-on-surface-variant">
                    {shortAddress(token.address, 8, 6)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={token.isVerified ? "success" : "warning"}>
                <ShieldCheck className="h-3.5 w-3.5" />
                {token.isVerified ? "Verified" : "Unverified"}
              </StatusBadge>
              <StatusBadge tone="success">
                <Lock className="h-3.5 w-3.5" />
                Mint Data Observed
              </StatusBadge>
              <StatusBadge tone={staleMarket ? "stale" : "success"}>
                <Flame className="h-3.5 w-3.5" />
                {staleMarket ? "Freshness Watch" : "Live Market"}
              </StatusBadge>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-outline pt-4">
            <ActionLink
              href={`/watchlists?type=token&address=${token.address}&note=${encodeURIComponent(`Research score ${intelligence?.score ?? "unscored"}`)}`}
              tone="primary"
            >
              Add to watchlist
            </ActionLink>
            <ActionLink href={`/scanner?search=${token.address}`}>Return to scanner</ActionLink>
            <ActionLink href="/alerts">Review related alerts</ActionLink>
          </div>
        </section>

        <Panel title="Price Action and Volume Profile" icon={<BarChart3 className="h-4 w-4" />}>
          <div className="p-standard">
            <div className="relative min-h-[360px] overflow-hidden rounded-sm border border-outline bg-surface">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(67,70,85,0.28)_1px,transparent_1px),linear-gradient(to_bottom,rgba(67,70,85,0.28)_1px,transparent_1px)] bg-[size:40px_40px]" />
              {canChart ? (
                <>
                  <div className="absolute inset-x-6 bottom-12 flex h-36 items-end gap-2 opacity-50">
                    {chartValues.map((point, index) => {
                      const volume = point.volume1hUsd || point.volume24hUsd || 0;
                      const height = Math.max(12, Math.round((volume / maxVolume) * 100));
                      const change = point.priceChange1h || point.priceChange24h || 0;
                      return (
                        <div
                          key={index}
                          className={`flex-1 ${change < 0 ? "bg-destructive" : "bg-success"}`}
                          style={{ height: `${height}%` }}
                        />
                      );
                    })}
                  </div>
                  <svg
                    className="absolute inset-0 h-full w-full text-primary"
                    viewBox="0 0 100 50"
                    preserveAspectRatio="none"
                  >
                    <path
                      d={chartPath(chartValues) ?? ""}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                    />
                  </svg>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                  <div className="rounded-sm border border-outline bg-surface-container/95 px-5 py-4">
                    <p className="font-semibold text-on-surface">Price history is still forming</p>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      At least two verified snapshots are required before a chart is drawn.
                    </p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 flex h-8 items-center justify-between border-t border-outline bg-surface/90 px-4 font-mono text-[11px] text-on-surface-variant">
                <span>
                  {chartValues[0] ? formatRelative(chartValues[0].snapshotAt) : "No history"}
                </span>
                <span>Snapshot series</span>
                <span>
                  {chartValues.at(-1) ? formatRelative(chartValues.at(-1)!.snapshotAt) : "Now"}
                </span>
              </div>
              <div className="absolute right-0 top-0 flex h-full w-14 flex-col justify-between border-l border-outline bg-surface/80 py-4 pr-2 text-right font-mono text-[11px] text-on-surface-variant">
                <span>{formatTokenPrice(chartMaxPrice)}</span>
                <span>{formatTokenPrice(market?.priceUsd)}</span>
                <span>{formatTokenPrice(chartMinPrice)}</span>
              </div>
            </div>
          </div>
        </Panel>

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Market Cap" value={formatUsd(market?.marketCapUsd)} />
          <MetricCard label="Liquidity" value={formatUsd(market?.liquidityUsd)} tone="success" />
          <MetricCard label="24H Volume" value={formatUsd(market?.volume24hUsd)} tone="primary" />
          <MetricCard label="Holders" value={formatCompact(market?.holderCount)} />
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            label="Evidence Wallets"
            value={data.walletEvidenceSummary.walletCount}
            tone={data.walletEvidenceSummary.walletCount ? "primary" : "default"}
          />
          <MetricCard
            label="Qualified Wallets"
            value={data.walletEvidenceSummary.qualifiedWalletCount}
            tone={data.walletEvidenceSummary.qualifiedWalletCount ? "success" : "default"}
          />
          <MetricCard label="Indexed Trades" value={data.walletEvidenceSummary.tradeCount} />
          <MetricCard
            label="Latest Wallet Trade"
            value={formatRelative(data.walletEvidenceSummary.latestTradeAt)}
            tone={data.walletEvidenceSummary.latestTradeAt ? "success" : "stale"}
          />
        </div>

        {staleMarket ? (
          <StaleBlock
            title="Market module freshness watch"
            message={`Latest market snapshot is ${market?.snapshotAt ? formatRelative(market.snapshotAt) : "not available"}. Research context remains visible while fresh market data catches up.`}
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          {allFactors.length > 0 ? (
            allFactors.slice(0, 3).map((factor) => (
              <div
                key={`${factor.factorName}-${factor.contribution}`}
                className="rounded-lg border border-outline bg-surface-container p-standard"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-on-surface">{factor.factorName}</h3>
                  <StatusBadge tone={factor.tone === "success" ? "success" : "danger"}>
                    {factor.contribution >= 0 ? "+" : ""}
                    {factor.contribution.toFixed(1)}
                  </StatusBadge>
                </div>
                <p className="mt-4 font-mono text-sm text-on-surface-variant">
                  Raw:{" "}
                  {typeof factor.rawValue === "object"
                    ? JSON.stringify(factor.rawValue)
                    : String(factor.rawValue ?? "n/a")}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-outline bg-surface-container p-standard md:col-span-3">
              <p className="text-sm text-on-surface-variant">
                No factor breakdown is stored for this token yet.
              </p>
            </div>
          )}
        </div>

        <Panel title="Wallet Evidence" icon={<Wallet className="h-4 w-4" />}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-outline bg-surface font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                <tr>
                  <th className="px-standard py-3 text-left font-medium">Rank</th>
                  <th className="px-standard py-3 text-left font-medium">Wallet Entity</th>
                  <th className="px-standard py-3 text-right font-medium">Score</th>
                  <th className="px-standard py-3 text-right font-medium">Net Flow</th>
                  <th className="px-standard py-3 text-right font-medium">Value</th>
                  <th className="px-standard py-3 text-right font-medium">Pnl</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline bg-surface">
                {data.walletEvidence.length > 0 ? (
                  data.walletEvidence.slice(0, 10).map((trade, index) => (
                    <tr key={trade.id} className="hover:bg-surface-high">
                      <td className="px-standard py-3 font-mono text-on-surface-variant">
                        #{index + 1}
                      </td>
                      <td className="px-standard py-3">
                        <Link
                          href={`/wallets?address=${trade.walletAddress}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {shortAddress(trade.walletAddress)}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-on-surface-variant">
                            {trade.walletLabel || trade.walletClassification}
                          </span>
                          <StatusBadge tone={trade.isQualified ? "success" : "default"}>
                            {trade.isQualified ? "Qualified" : "Unqualified"}
                          </StatusBadge>
                        </div>
                      </td>
                      <td
                        className={`px-standard py-3 text-right font-mono ${scoreTone(trade.walletScore)}`}
                      >
                        {trade.walletScore ?? "--"}
                      </td>
                      <td
                        className={`px-standard py-3 text-right font-mono ${trade.tradeType.toLowerCase().includes("sell") ? "text-destructive" : "text-success"}`}
                      >
                        {trade.tradeType} {formatCompact(trade.amount)}
                      </td>
                      <td className="px-standard py-3 text-right font-mono text-on-surface">
                        {formatUsd(trade.valueUsd)}
                      </td>
                      <td
                        className={`px-standard py-3 text-right font-mono ${(trade.totalPnlUsd ?? 0) >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {formatUsd(trade.totalPnlUsd)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-standard py-8 text-center text-sm text-on-surface-variant"
                    >
                      No wallet trade evidence has been indexed for this token yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Unified Timeline" icon={<Activity className="h-4 w-4" />}>
          <div className="divide-y divide-outline">
            {data.timeline.length > 0 ? (
              data.timeline.slice(0, 12).map((event) => (
                <div key={`${event.type}-${event.id}`} className="px-standard py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <StatusBadge
                        tone={
                          event.type === "alert"
                            ? "warning"
                            : event.type === "signal"
                              ? "primary"
                              : "default"
                        }
                      >
                        {event.type}
                      </StatusBadge>
                      <p className="mt-2 font-semibold text-on-surface">{event.title}</p>
                      <p className="mt-1 text-sm text-on-surface-variant">{event.detail}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-on-surface-variant">
                      {formatRelative(event.occurredAt)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-standard text-sm text-on-surface-variant">
                No timeline events have been indexed for this token yet.
              </div>
            )}
          </div>
        </Panel>
      </div>

      <aside className="space-y-4">
        <Panel title="Intelligence" icon={<Activity className="h-4 w-4" />}>
          <div className="space-y-4 p-standard">
            <div className="rounded-sm border border-outline bg-surface px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                Signal Score
              </p>
              <p
                className={`mt-2 font-mono text-4xl tabular-nums ${scoreTone(intelligence?.score)}`}
              >
                {intelligence?.score ?? 0}
              </p>
              <p className="mt-2 text-sm text-on-surface-variant">
                {intelligence
                  ? `${Math.round(intelligence.confidence * 100)}% confidence via ${intelligence.rulesetVersion}`
                  : "No active signal stored"}
              </p>
              <div className="mt-4">
                <EvidenceBar
                  label="Evidence confidence"
                  value={intelligence?.confidence ?? null}
                  detail="Confidence reflects available inputs; it is not a probability of profit."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label="Priority"
                value={intelligence?.priority ?? "None"}
                tone="warning"
              />
              <MetricCard label="Detected" value={formatRelative(intelligence?.detectedAt)} />
            </div>

            {launch ? (
              <div className="rounded-sm border border-outline bg-surface px-3 py-3 text-sm">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                  Launch
                </p>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between gap-3">
                    <span className="text-on-surface-variant">Deployer</span>
                    <span className="font-mono text-primary">
                      {shortAddress(launch.deployerAddress)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-on-surface-variant">Initial LP</span>
                    <span className="font-mono text-on-surface">
                      {formatUsd(launch.initialLiquidityUsd)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-on-surface-variant">Age</span>
                    <span className="font-mono text-on-surface">
                      {formatRelative(launch.launchedAt)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Decision Actions" icon={<Zap className="h-4 w-4" />}>
          <div className="space-y-4 p-standard">
            <ActionLink
              href={`/watchlists?type=token&address=${token.address}&note=${encodeURIComponent(`Research score ${intelligence?.score ?? "unscored"}`)}`}
              tone="primary"
            >
              Monitor this token
            </ActionLink>
            <ActionLink href="/strategies">Evaluate with a strategy</ActionLink>
            <ActionLink href={`/terminal?token=${token.address}`}>Open terminal context</ActionLink>
            <ModuleNotice
              tone="warning"
              title="Execution intentionally locked"
              message="No quote, slippage, fee, or receive amount is shown until Phase 3 provides a real Jupiter quote, simulation, wallet connection, and explicit signing."
            />
          </div>
        </Panel>
      </aside>
    </div>
  );
}
