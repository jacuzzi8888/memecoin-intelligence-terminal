"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookmarkPlus,
  CirclePause,
  CirclePlay,
  Gauge,
  Radar,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { AegisSelect } from "@/components/aegis-ui";
import {
  FilterChip,
  FreshnessStamp,
  ModuleNotice,
  PageHeader,
  RefreshButton,
} from "@/components/workflow-ui";
import { API_BASE_URL } from "@/lib/api-url";
import { apiFetch } from "@/lib/api-client";

interface ScannerItem {
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
  holderEvidence: {
    provider: string | null;
    sampledHolders: number;
    topHolderConcentrationPct: number | null;
  };
  risk: {
    score: number | null;
    rating: string | null;
  };
  pair: {
    pairCreatedAt: string | null;
    pairAgeMinutes: number | null;
  };
  market: {
    marketCapUsd: number;
    priceUsd: number;
    volume1hUsd: number;
    volume24hUsd: number;
    liquidityUsd: number;
    holderCount: number | null;
    priceChange1h: number;
    priceChange24h: number;
  } | null;
  walletEvidence: {
    tradeCount: number;
    walletCount: number;
    qualifiedWalletCount: number;
    latestTradeAt: string | null;
    topWallets: Array<{
      walletAddress: string;
      label: string | null;
      classification: string;
      score: number | null;
      isQualified: boolean;
      tradeType: string;
      valueSol: number | null;
      tradedAt: string;
    }>;
  };
}

const liquidityOptions = [
  { label: "Any liquidity", value: "" },
  { label: "$0-5k", value: "0:5000" },
  { label: "$5k-15k", value: "5000:15000" },
  { label: "$15k-50k", value: "15000:50000" },
  { label: "$50k-250k", value: "50000:250000" },
  { label: "$250k+", value: "250000:" },
];

const timeframeOptions = [
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

const marketCapOptions = [
  { label: "Any mcap", value: "" },
  { label: "$0-25k", value: "0:25000" },
  { label: "$25k-100k", value: "25000:100000" },
  { label: "$100k-500k", value: "100000:500000" },
  { label: "$500k-2m", value: "500000:2000000" },
  { label: "$2m+", value: "2000000:" },
];

const volumeOptions = [
  { label: "Any volume", value: "" },
  { label: "1h > $5k", value: "5000" },
  { label: "1h > $25k", value: "25000" },
  { label: "1h > $100k", value: "100000" },
  { label: "1h > $500k", value: "500000" },
];

const sourceOptions = [
  { label: "All sources", value: "all" },
  { label: "DexScreener", value: "dexscreener" },
  { label: "Helius", value: "helius" },
  { label: "Birdeye", value: "birdeye" },
  { label: "Solana RPC", value: "solana-rpc" },
];

const discoverySourceOptions = [
  { label: "All discovery", value: "all" },
  { label: "Profiles", value: "dexscreener-profile" },
  { label: "Latest boosts", value: "dexscreener-boost-latest" },
  { label: "Top boosts", value: "dexscreener-boost-top" },
  { label: "Helius", value: "helius" },
  { label: "RPC", value: "rpc" },
];

const priorityOptions = [
  { label: "All priorities", value: "" },
  { label: "Critical", value: "critical" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

const walletFilterOptions = [
  { label: "Any wallets", value: "" },
  { label: "Has wallet evidence", value: "has" },
  { label: "2+ wallets", value: "2" },
  { label: "5+ wallets", value: "5" },
  { label: "Qualified only", value: "qualified" },
];

const bundlerOptions = [
  { label: "Include bundlers", value: "false" },
  { label: "Exclude bundlers", value: "true" },
];

const pairAgeOptions = [
  { label: "Any pair age", value: "" },
  { label: "Under 5m", value: "5" },
  { label: "Under 15m", value: "15" },
  { label: "Under 1h", value: "60" },
  { label: "Under 4h", value: "240" },
  { label: "Under 24h", value: "1440" },
];

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

function formatAgeMinutes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  if (value < 1) return "<1m";
  if (value < 60) return `${Math.round(value)}m`;
  if (value < 1440) return `${(value / 60).toFixed(value < 600 ? 1 : 0)}h`;
  return `${(value / 1440).toFixed(1)}d`;
}

function scoreTone(score: number) {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-on-surface-variant";
}

function riskDot(rating: string | null) {
  if (rating === "low") return "bg-success";
  if (rating === "medium") return "bg-warning";
  if (rating === "high" || rating === "critical") return "bg-destructive";
  return "bg-on-surface-variant";
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value > 0) return `$${value.toFixed(2)}`;
  return "$0";
}

function applyRangeParam(params: URLSearchParams, value: string, minKey: string, maxKey: string) {
  if (!value) return;
  const [min, max] = value.split(":");
  if (min) params.set(minKey, min);
  if (max) params.set(maxKey, max);
}

function optionLabel(options: Array<{ label: string; value: string }>, value: string) {
  return options.find((option) => option.value === value)?.label ?? "Any";
}

function ScannerSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="h-14 animate-pulse rounded-lg border border-outline bg-surface-container" />
        <div className="h-[34rem] animate-pulse rounded-lg border border-outline bg-surface-container" />
      </div>
      <div className="h-[34rem] animate-pulse rounded-lg border border-outline bg-surface-container" />
    </div>
  );
}

export default function ScannerPage() {
  const [items, setItems] = useState<ScannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("detected_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [minScore, setMinScore] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeframe, setTimeframe] = useState<string>("24h");
  const [liquidityRange, setLiquidityRange] = useState<string>("");
  const [marketCapRange, setMarketCapRange] = useState<string>("");
  const [minVolume1hUsd, setMinVolume1hUsd] = useState<string>("");
  const [maxPairAgeMinutes, setMaxPairAgeMinutes] = useState<string>("");
  const [dataSource, setDataSource] = useState<string>("all");
  const [discoverySource, setDiscoverySource] = useState<string>("all");
  const [priority, setPriority] = useState<string>("");
  const [walletFilter, setWalletFilter] = useState<string>("");
  const [excludeBundlers, setExcludeBundlers] = useState<string>("false");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [walletDiscovering, setWalletDiscovering] = useState(false);
  const [walletDiscoveryMessage, setWalletDiscoveryMessage] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [savedViewAvailable, setSavedViewAvailable] = useState(false);
  const [operatorDefaultTimeframe, setOperatorDefaultTimeframe] = useState("24h");
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(15_000);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("search")?.trim() ?? "";
    if (query) setSearchQuery(query);
    setSavedViewAvailable(Boolean(window.localStorage.getItem("aegis-scanner-view")));
    try {
      const preferences = JSON.parse(
        window.localStorage.getItem("aegis-operator-preferences") || "{}",
      ) as { defaultScannerTimeframe?: string; refreshIntervalSeconds?: number };
      if (timeframeOptions.some((option) => option.value === preferences.defaultScannerTimeframe)) {
        setTimeframe(preferences.defaultScannerTimeframe ?? "24h");
        setOperatorDefaultTimeframe(preferences.defaultScannerTimeframe ?? "24h");
      }
      const seconds = Number(preferences.refreshIntervalSeconds);
      if ([15, 30, 60].includes(seconds)) setRefreshIntervalMs(seconds * 1_000);
    } catch {
      window.localStorage.removeItem("aegis-operator-preferences");
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchSignals(showLoading = true) {
      if (active && showLoading) setLoading(true);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const apiUrl = API_BASE_URL;
        const params = new URLSearchParams({
          page: String(page),
          limit: "20",
          sortBy,
          sortOrder,
          timeframe,
        });
        if (searchQuery) params.set("search", searchQuery);
        if (minScore) params.set("minScore", minScore);
        applyRangeParam(params, liquidityRange, "minLiquidityUsd", "maxLiquidityUsd");
        applyRangeParam(params, marketCapRange, "minMarketCapUsd", "maxMarketCapUsd");
        if (minVolume1hUsd) params.set("minVolume1hUsd", minVolume1hUsd);
        if (maxPairAgeMinutes) params.set("maxPairAgeMinutes", maxPairAgeMinutes);
        if (dataSource) params.set("dataSource", dataSource);
        if (discoverySource) params.set("discoverySource", discoverySource);
        if (priority) params.set("priority", priority);
        if (walletFilter === "has") params.set("hasWalletEvidence", "true");
        if (walletFilter === "qualified") params.set("minQualifiedWalletCount", "1");
        if (walletFilter && !["has", "qualified"].includes(walletFilter))
          params.set("minWalletCount", walletFilter);
        if (excludeBundlers === "true") params.set("excludeBundlers", "true");
        const res = await fetch(`${apiUrl}/api/v1/scanner?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: {
          success?: boolean;
          data?: ScannerItem[];
          error?: string;
          timestamp?: string;
          pagination?: { total: number; totalPages: number };
        } = await res.json();
        if (data.success && data.data) {
          if (active) {
            setItems(data.data);
            setSelectedId((current) => current ?? data.data?.[0]?.id ?? null);
            setTotalPages(Math.max(1, data.pagination?.totalPages ?? 1));
            setTotalResults(data.pagination?.total ?? data.data.length);
            setLastUpdatedAt(data.timestamp ?? new Date().toISOString());
            setError(null);
          }
        } else {
          if (active) {
            setError(data.error ?? "Scanner data is unavailable.");
          }
        }
      } catch {
        if (active) {
          setError("Failed to fetch signals. API connection is currently unavailable.");
        }
      } finally {
        window.clearTimeout(timeout);
        if (active && showLoading) setLoading(false);
      }
    }
    void fetchSignals(true);
    const refreshInterval = autoRefresh
      ? window.setInterval(() => void fetchSignals(false), refreshIntervalMs)
      : null;
    return () => {
      active = false;
      if (refreshInterval) window.clearInterval(refreshInterval);
    };
  }, [
    page,
    sortBy,
    sortOrder,
    timeframe,
    minScore,
    searchQuery,
    liquidityRange,
    marketCapRange,
    minVolume1hUsd,
    maxPairAgeMinutes,
    dataSource,
    discoverySource,
    priority,
    walletFilter,
    excludeBundlers,
    refreshNonce,
    autoRefresh,
    refreshIntervalMs,
  ]);

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
    setSelectedId(null);
  }

  function resetFilters() {
    setTimeframe(operatorDefaultTimeframe);
    setLiquidityRange("");
    setMarketCapRange("");
    setMinVolume1hUsd("");
    setMaxPairAgeMinutes("");
    setDataSource("all");
    setDiscoverySource("all");
    setPriority("");
    setWalletFilter("");
    setExcludeBundlers("false");
    setMinScore("");
    setSearchQuery("");
    setSortBy("detected_at");
    setSortOrder("desc");
    setPage(1);
    setSelectedId(null);
  }

  function saveCurrentView() {
    window.localStorage.setItem(
      "aegis-scanner-view",
      JSON.stringify({
        timeframe,
        liquidityRange,
        marketCapRange,
        minVolume1hUsd,
        maxPairAgeMinutes,
        dataSource,
        discoverySource,
        priority,
        walletFilter,
        excludeBundlers,
        minScore,
        sortBy,
        sortOrder,
      }),
    );
    setSavedViewAvailable(true);
    setScanMessage("Saved this scanner view in the current browser.");
  }

  function restoreSavedView() {
    const raw = window.localStorage.getItem("aegis-scanner-view");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Record<string, string>;
      setTimeframe(saved.timeframe || "24h");
      setLiquidityRange(saved.liquidityRange || "");
      setMarketCapRange(saved.marketCapRange || "");
      setMinVolume1hUsd(saved.minVolume1hUsd || "");
      setMaxPairAgeMinutes(saved.maxPairAgeMinutes || "");
      setDataSource(saved.dataSource || "all");
      setDiscoverySource(saved.discoverySource || "all");
      setPriority(saved.priority || "");
      setWalletFilter(saved.walletFilter || "");
      setExcludeBundlers(saved.excludeBundlers || "false");
      setMinScore(saved.minScore || "");
      setSortBy(saved.sortBy || "detected_at");
      setSortOrder(saved.sortOrder === "asc" ? "asc" : "desc");
      setPage(1);
      setSelectedId(null);
      setScanMessage("Restored the saved scanner view.");
    } catch {
      window.localStorage.removeItem("aegis-scanner-view");
      setSavedViewAvailable(false);
      setScanMessage("The saved view was invalid and has been removed.");
    }
  }

  async function runLiveScan() {
    setScanning(true);
    setScanMessage("Live scan running against current provider data.");
    try {
      const apiUrl = API_BASE_URL;
      const res = await apiFetch(`${apiUrl}/api/v1/scanner/live-scan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 150, minSignalRefreshMinutes: 45 }),
        cache: "no-store",
      });
      const payload: {
        success?: boolean;
        error?: string;
        data?: {
          eventsFound?: number;
          eventsProcessed?: number;
          tokensFound?: number;
          tokensProcessed?: number;
          tokensRefreshed?: number;
          signalsCreated?: number;
          alertsCreated?: number;
          duplicateSignalsSkipped?: number;
          completedAt?: string;
        };
      } = await res.json();

      if (!payload.success) {
        setScanMessage(payload.error ?? "Live scan failed.");
        return;
      }

      setScanMessage(
        `Live scan: ${payload.data?.eventsProcessed ?? 0}/${payload.data?.eventsFound ?? 0} events, ${payload.data?.tokensFound ?? 0} new, ${payload.data?.tokensRefreshed ?? 0} refreshed, ${payload.data?.alertsCreated ?? 0} alerts.`,
      );
      setPage(1);
      setRefreshNonce((current) => current + 1);
    } catch {
      setScanMessage("Live scan failed because the API could not be reached.");
    } finally {
      setScanning(false);
    }
  }

  async function runWalletDiscovery() {
    setWalletDiscovering(true);
    setWalletDiscoveryMessage("Discovering trader wallets from recent token swaps.");
    try {
      const apiUrl = API_BASE_URL;
      const res = await apiFetch(`${apiUrl}/api/v1/scanner/discover-wallets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sinceHours: 24,
          tokenLimit: 12,
          transactionsPerToken: 25,
          walletLimit: 8,
          minCandidateScore: 8,
        }),
        cache: "no-store",
      });
      const payload: {
        success?: boolean;
        error?: string;
        data?: {
          tokensScanned?: number;
          transactionsFetched?: number;
          candidatesFound?: number;
          walletsProcessed?: number;
          walletsQualified?: number;
          tradesInserted?: number;
        };
      } = await res.json();

      if (!payload.success) {
        setWalletDiscoveryMessage(payload.error ?? "Wallet discovery failed.");
        return;
      }

      setWalletDiscoveryMessage(
        `Wallet discovery: ${payload.data?.tokensScanned ?? 0} tokens, ${payload.data?.candidatesFound ?? 0} candidates, ${payload.data?.walletsProcessed ?? 0} synced, ${payload.data?.walletsQualified ?? 0} qualified, ${payload.data?.tradesInserted ?? 0} trades.`,
      );
      setPage(1);
      setRefreshNonce((current) => current + 1);
    } catch {
      setWalletDiscoveryMessage("Wallet discovery failed because the API could not be reached.");
    } finally {
      setWalletDiscovering(false);
    }
  }

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  if (loading && items.length === 0) {
    return <ScannerSkeleton />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Live discovery"
        title="Rank the market without losing your place"
        description="Filter the observed token universe, pause automatic updates while investigating, and hand promising candidates directly into Research or a watchlist."
        meta={
          <>
            <FreshnessStamp value={lastUpdatedAt} label="Ranking" />
            <FilterChip active={autoRefresh}>
              {autoRefresh ? "Live refresh 15s" : "Ranking paused"}
            </FilterChip>
            <FilterChip>{totalResults} matches</FilterChip>
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => setAutoRefresh((current) => !current)}
              className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-outline bg-surface px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface hover:border-primary/60 hover:text-primary"
            >
              {autoRefresh ? (
                <CirclePause className="h-3.5 w-3.5" />
              ) : (
                <CirclePlay className="h-3.5 w-3.5" />
              )}
              {autoRefresh ? "Pause updates" : "Resume updates"}
            </button>
            <button
              type="button"
              onClick={saveCurrentView}
              className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-outline bg-surface px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface hover:border-primary/60 hover:text-primary"
            >
              <Save className="h-3.5 w-3.5" />
              Save view
            </button>
            <RefreshButton
              onClick={() => setRefreshNonce((current) => current + 1)}
              busy={loading}
            />
          </>
        }
      />
      {error && (
        <ModuleNotice
          tone="warning"
          title="Scanner refresh degraded"
          message={`${error} The last successful ranking remains visible.`}
          action={
            <RefreshButton
              onClick={() => setRefreshNonce((current) => current + 1)}
              busy={loading}
            />
          }
        />
      )}

      <div className="rounded-lg border border-outline bg-surface-container">
        <div className="flex flex-col gap-3 border-b border-outline bg-surface-high px-standard py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 flex items-center gap-2">
              <Radar className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-on-surface">Market Filters</h2>
            </div>

            <button
              type="button"
              disabled
              className="flex items-center gap-2 rounded-sm border border-primary/30 bg-primary-container/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary disabled:opacity-80"
              title="Solana is the only supported chain in this phase."
            >
              Solana
            </button>
            <AegisSelect
              label="Liquidity"
              value={liquidityRange}
              options={liquidityOptions}
              onChange={(value) => updateFilter(setLiquidityRange, value)}
              className="min-w-[145px]"
            />
            <AegisSelect
              label="Pair age"
              value={maxPairAgeMinutes}
              options={pairAgeOptions}
              onChange={(value) => updateFilter(setMaxPairAgeMinutes, value)}
              className="min-w-[150px]"
            />
            <AegisSelect
              label="Market cap"
              value={marketCapRange}
              options={marketCapOptions}
              onChange={(value) => updateFilter(setMarketCapRange, value)}
              className="min-w-[150px]"
            />
            <AegisSelect
              label="1h volume"
              value={minVolume1hUsd}
              options={volumeOptions}
              onChange={(value) => updateFilter(setMinVolume1hUsd, value)}
              className="min-w-[140px]"
            />
            <span className="flex items-center gap-2 rounded-sm border border-primary/30 bg-primary-container/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
              Score {">"} {minScore || "0"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AegisSelect
              label="Data source"
              value={dataSource}
              options={sourceOptions}
              onChange={(value) => updateFilter(setDataSource, value)}
            />
            <AegisSelect
              label="Discovery"
              value={discoverySource}
              options={discoverySourceOptions}
              onChange={(value) => updateFilter(setDiscoverySource, value)}
              className="min-w-[155px]"
            />
            <AegisSelect
              label="Priority"
              value={priority}
              options={priorityOptions}
              onChange={(value) => updateFilter(setPriority, value)}
            />
            <AegisSelect
              label="Timeframe"
              value={timeframe}
              options={timeframeOptions}
              onChange={(value) => updateFilter(setTimeframe, value)}
              className="min-w-[120px]"
            />
            <AegisSelect
              label="Wallets"
              value={walletFilter}
              options={walletFilterOptions}
              onChange={(value) => updateFilter(setWalletFilter, value)}
              className="min-w-[165px]"
            />
            <AegisSelect
              label="Bundlers"
              value={excludeBundlers}
              options={bundlerOptions}
              onChange={(value) => updateFilter(setExcludeBundlers, value)}
              className="min-w-[170px]"
            />
            <label className="flex min-w-[190px] items-center gap-2 rounded-sm border border-outline bg-surface px-3 py-1.5 text-sm text-on-surface">
              <Search className="h-4 w-4 text-on-surface-variant" />
              <input
                value={searchQuery}
                onChange={(event) => updateFilter(setSearchQuery, event.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-on-surface-variant"
                placeholder="Token, symbol, address"
                aria-label="Search scanner results"
              />
            </label>
            <label className="flex items-center gap-2 rounded-sm border border-outline bg-surface px-3 py-1.5 text-sm text-on-surface">
              <Gauge className="h-4 w-4 text-on-surface-variant" />
              <input
                value={minScore}
                onChange={(e) => updateFilter(setMinScore, e.target.value)}
                className="w-12 bg-transparent font-mono text-[13px] outline-none placeholder:text-on-surface-variant"
                placeholder="0"
                inputMode="numeric"
                aria-label="Minimum score"
              />
            </label>

            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-2 rounded-sm border border-outline bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
            <button
              onClick={runLiveScan}
              disabled={scanning}
              className="flex items-center gap-2 rounded-sm border border-success/40 bg-success/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-success disabled:cursor-wait disabled:opacity-60"
            >
              <Radar className="h-4 w-4" />
              {scanning ? "Scanning" : "Run live scan"}
            </button>
            <button
              onClick={runWalletDiscovery}
              disabled={walletDiscovering}
              className="flex items-center gap-2 rounded-sm border border-warning/40 bg-warning/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-warning disabled:cursor-wait disabled:opacity-60"
            >
              <Zap className="h-4 w-4" />
              {walletDiscovering ? "Finding wallets" : "Discover wallets"}
            </button>
          </div>
        </div>

        <div className="px-standard py-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-mono uppercase tracking-[0.12em] text-on-surface-variant">
              Saved view
            </span>
            <button
              type="button"
              onClick={restoreSavedView}
              disabled={!savedViewAvailable}
              className="rounded-sm border border-outline bg-surface px-2 py-1 font-mono uppercase tracking-[0.12em] text-on-surface disabled:opacity-40"
            >
              {savedViewAvailable ? "Restore my view" : "No saved view"}
            </button>
            <span className="rounded-sm border border-primary/30 bg-primary-container/10 px-2 py-1 font-mono uppercase tracking-[0.12em] text-primary">
              Live {timeframe}
            </span>
            <span className="rounded-sm border border-outline bg-surface px-2 py-1 font-mono uppercase tracking-[0.12em] text-on-surface-variant">
              Source: {dataSource}
            </span>
            <span className="rounded-sm border border-outline bg-surface px-2 py-1 font-mono uppercase tracking-[0.12em] text-on-surface-variant">
              Discovery: {optionLabel(discoverySourceOptions, discoverySource)}
            </span>
            <span className="rounded-sm border border-outline bg-surface px-2 py-1 font-mono uppercase tracking-[0.12em] text-on-surface-variant">
              Liquidity: {optionLabel(liquidityOptions, liquidityRange)}
            </span>
            <span className="rounded-sm border border-outline bg-surface px-2 py-1 font-mono uppercase tracking-[0.12em] text-on-surface-variant">
              Pair age:{" "}
              {maxPairAgeMinutes ? `<${formatAgeMinutes(Number(maxPairAgeMinutes))}` : "Any"}
            </span>
            <span className="rounded-sm border border-outline bg-surface px-2 py-1 font-mono uppercase tracking-[0.12em] text-on-surface-variant">
              Wallets: {optionLabel(walletFilterOptions, walletFilter)}
            </span>
            {scanMessage && (
              <span className="rounded-sm border border-outline bg-surface px-2 py-1 font-mono uppercase tracking-[0.12em] text-on-surface-variant">
                {scanMessage}
              </span>
            )}
            {walletDiscoveryMessage && (
              <span className="rounded-sm border border-warning/30 bg-warning/10 px-2 py-1 font-mono uppercase tracking-[0.12em] text-warning">
                {walletDiscoveryMessage}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <section className="overflow-x-auto rounded-lg border border-outline bg-surface shadow-panel scrollbar-thin">
          <div className="grid min-w-[1180px] grid-cols-[64px_minmax(180px,2fr)_72px_82px_94px_94px_88px_82px_88px_88px_84px_68px_92px] border-b border-outline bg-surface-container px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
            <span>Rank</span>
            <span>Asset</span>
            <button className="text-right" onClick={() => setSortBy("signal_score")}>
              Score
            </button>
            <span className="text-right">Conf</span>
            <span className="text-right">Liq</span>
            <span className="text-right">Vol 1h</span>
            <span className="text-right">Wallets</span>
            <button className="text-right" onClick={() => setSortBy("pair_age")}>
              Pair Age
            </button>
            <span className="text-right">Fresh</span>
            <span className="text-right">Detected</span>
            <span className="text-center">Source</span>
            <button
              className="text-center"
              onClick={() => setSortOrder((current) => (current === "desc" ? "asc" : "desc"))}
            >
              Risk
            </button>
            <span className="text-right">Actions</span>
          </div>

          <div className="max-h-[34rem] overflow-auto scrollbar-thin">
            {items.length === 0 ? (
              <div className="p-standard">
                <div className="rounded-sm border border-outline bg-surface px-4 py-12 text-center">
                  <p className="text-sm text-on-surface">No signals found.</p>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Adjust thresholds or restart ingestion to populate the scanner.
                  </p>
                </div>
              </div>
            ) : (
              items.map((item, index) => {
                const active = selectedItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(item.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className={[
                      "relative grid min-w-[1180px] cursor-pointer grid-cols-[64px_minmax(180px,2fr)_72px_82px_94px_94px_88px_82px_88px_88px_84px_68px_92px] items-center border-b border-outline/60 px-4 py-3 text-left transition-colors",
                      active ? "bg-primary/5" : "bg-surface hover:bg-surface-high",
                    ].join(" ")}
                  >
                    <span className="font-mono text-sm text-on-surface-variant tabular-nums">
                      {(page - 1) * 20 + index + 1}
                    </span>

                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-primary-container/10 font-mono text-[11px] text-primary">
                        {item.tokenSymbol.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-on-surface">
                          ${item.tokenSymbol}
                        </p>
                        <p className="truncate text-xs text-on-surface-variant">{item.tokenName}</p>
                      </div>
                    </div>

                    <span
                      className={`text-right font-mono text-sm tabular-nums ${scoreTone(item.signalScore)}`}
                    >
                      {item.signalScore}
                    </span>
                    <span className="text-right font-mono text-sm text-on-surface tabular-nums">
                      {(item.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="text-right font-mono text-sm text-on-surface tabular-nums">
                      {formatCurrency(item.market?.liquidityUsd)}
                    </span>
                    <span className="text-right font-mono text-sm text-on-surface-variant tabular-nums">
                      {formatCurrency(item.market?.volume1hUsd)}
                    </span>
                    <span className="text-right font-mono text-sm text-on-surface tabular-nums">
                      {item.walletEvidence.qualifiedWalletCount}/{item.walletEvidence.walletCount}
                    </span>
                    <span className="text-right font-mono text-sm text-on-surface tabular-nums">
                      {formatAgeMinutes(item.pair?.pairAgeMinutes)}
                    </span>
                    <span className="text-right font-mono text-sm text-on-surface-variant">
                      {formatRelativeMinutes(item.dataFreshness)}
                    </span>
                    <span className="text-right font-mono text-sm text-on-surface-variant">
                      {formatRelativeMinutes(item.detectedAt)}
                    </span>
                    <span className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                      {item.dataSource}
                    </span>
                    <span className="flex justify-center">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${riskDot(item.risk.rating)}`}
                        title={`Risk: ${item.risk.rating ?? "unknown"}`}
                      />
                    </span>

                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/watchlists?type=token&address=${item.tokenAddress}&note=${encodeURIComponent(`Scanner score ${item.signalScore}`)}`}
                        title="Add to watchlist"
                        aria-label={`Watch ${item.tokenSymbol}`}
                        className="rounded-sm p-1 text-on-surface-variant transition-colors hover:bg-surface-highest hover:text-primary"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <BookmarkPlus className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/tokens/${item.tokenAddress}`}
                        className="rounded-sm border border-primary/30 bg-primary-container/10 p-1 text-primary transition-colors hover:bg-primary-container/20"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Zap className="h-4 w-4" />
                      </Link>
                    </div>

                    {active && (
                      <span className="pointer-events-none absolute left-0 top-0 h-full w-1 bg-primary" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-outline bg-surface-container px-standard py-3">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="rounded-sm border border-outline bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface disabled:opacity-40"
            >
              Previous
            </button>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
              Page {page} of {totalPages} · {totalResults} results
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className="rounded-sm border border-outline bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </section>

        <aside className="overflow-hidden rounded-lg border border-outline bg-surface shadow-panel">
          <div className="flex items-center justify-between border-b border-outline bg-surface-container px-standard py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
              Quick Inspection
            </span>
            <Gauge className="h-4 w-4 text-primary" />
          </div>

          <div className="space-y-5 p-standard">
            {selectedItem ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-primary/20 bg-primary-container/10 font-mono text-lg text-primary">
                    {selectedItem.tokenSymbol.slice(0, 1)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-semibold text-on-surface">
                        ${selectedItem.tokenSymbol}
                      </p>
                      <span className="rounded-sm bg-surface-container px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                        SPL
                      </span>
                    </div>
                    <p className="font-mono text-sm text-primary">{selectedItem.signalScore}/100</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                    Trust and Security
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-sm border border-outline bg-surface-container-highest p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                        Contract
                      </p>
                      <p className="mt-2 font-mono text-[11px] text-success">Observed</p>
                    </div>
                    <div className="rounded-sm border border-outline bg-surface-container-highest p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                        Confidence
                      </p>
                      <p className="mt-2 font-mono text-[11px] text-success">
                        {(selectedItem.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="rounded-sm border border-outline bg-surface-container-highest p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                        Source
                      </p>
                      <p className="mt-2 font-mono text-[11px] text-on-surface">
                        {selectedItem.dataSource}
                      </p>
                    </div>
                    <div className="rounded-sm border border-outline bg-surface-container-highest p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                        Priority
                      </p>
                      <p className="mt-2 font-mono text-[11px] text-warning uppercase">
                        {selectedItem.priority}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                    Live Metrics
                  </p>
                  <div className="rounded-sm border border-outline bg-surface-lowest p-3">
                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-on-surface-variant">Freshness</span>
                      <span className="font-mono text-on-surface">
                        {formatRelativeMinutes(selectedItem.dataFreshness)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-on-surface-variant">Pair age</span>
                      <span className="font-mono text-on-surface">
                        {formatAgeMinutes(selectedItem.pair?.pairAgeMinutes)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-on-surface-variant">Liquidity</span>
                      <span className="font-mono text-on-surface">
                        {formatCurrency(selectedItem.market?.liquidityUsd)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-on-surface-variant">1h Volume</span>
                      <span className="font-mono text-on-surface">
                        {formatCurrency(selectedItem.market?.volume1hUsd)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-on-surface-variant">Detected</span>
                      <span className="font-mono text-on-surface">
                        {formatRelativeMinutes(selectedItem.detectedAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-on-surface-variant">Queue posture</span>
                      <span className="font-mono text-on-surface-variant">See system status</span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-on-surface-variant">Wallet evidence</span>
                      <span className="font-mono text-on-surface">
                        {selectedItem.walletEvidence.qualifiedWalletCount}/
                        {selectedItem.walletEvidence.walletCount} qualified
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-on-surface-variant">Trades indexed</span>
                      <span className="font-mono text-on-surface">
                        {selectedItem.walletEvidence.tradeCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-on-surface-variant">Top holder</span>
                      <span
                        className={[
                          "font-mono",
                          selectedItem.holderEvidence.topHolderConcentrationPct !== null &&
                          selectedItem.holderEvidence.topHolderConcentrationPct >= 50
                            ? "text-destructive"
                            : "text-on-surface",
                        ].join(" ")}
                      >
                        {selectedItem.holderEvidence.topHolderConcentrationPct === null
                          ? "Not enriched"
                          : `${selectedItem.holderEvidence.topHolderConcentrationPct.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-on-surface-variant">Risk posture</span>
                      <span className="font-mono uppercase text-on-surface">
                        {selectedItem.risk.rating ?? "Incomplete"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-outline bg-surface-container px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-success" />
                    <p className="text-sm font-semibold text-on-surface">Inspection note</p>
                  </div>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    {selectedItem.walletEvidence.walletCount > 0
                      ? `Indexed wallet evidence exists for this token. Open research to inspect ${selectedItem.walletEvidence.tradeCount} trade(s) from ${selectedItem.walletEvidence.walletCount} wallet(s).`
                      : "No indexed wallet evidence yet. Open research for market factors, then sync candidate wallets before terminal prep."}
                  </p>
                </div>

                <Link
                  href={`/tokens/${selectedItem.tokenAddress}`}
                  className="flex items-center justify-center gap-2 rounded-sm border border-primary/30 bg-primary-container px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:opacity-90"
                >
                  <Zap className="h-4 w-4" />
                  Open Research
                </Link>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/watchlists?type=token&address=${selectedItem.tokenAddress}&note=${encodeURIComponent(`Scanner score ${selectedItem.signalScore}`)}`}
                    className="flex min-h-10 items-center justify-center gap-2 rounded-sm border border-outline bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface hover:border-primary/50 hover:text-primary"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    Watch
                  </Link>
                  <Link
                    href="/wallets"
                    className="flex min-h-10 items-center justify-center gap-2 rounded-sm border border-outline bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface hover:border-primary/50 hover:text-primary"
                  >
                    Wallet evidence
                  </Link>
                </div>
              </>
            ) : (
              <div className="rounded-sm border border-outline bg-surface px-4 py-8 text-center">
                <p className="text-sm text-on-surface">Select a row to inspect a token.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
