"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  BookmarkPlus,
  GitCompareArrows,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  Wallet,
} from "lucide-react";
import {
  AegisSelect,
  LoadingRows,
  MetricCard,
  Panel,
  StatusBadge,
  formatRelative,
  formatUsd,
  scoreTone,
  shortAddress,
} from "@/components/aegis-ui";
import {
  ActionLink,
  EmptyState,
  EvidenceBar,
  ModuleNotice,
  PageHeader,
  RefreshButton,
} from "@/components/workflow-ui";
import { API_BASE_URL } from "@/lib/api-url";
import { apiFetch } from "@/lib/api-client";

interface WalletRow {
  id: string;
  address: string;
  label?: string | null;
  classification: string;
  totalTrades: number;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  latestLabel?: {
    label: string;
    confidence: number;
    source: string;
    rulesetVersion: string;
    assignedAt: string;
  } | null;
  performance?: {
    score?: number | null;
    winRate?: number | null;
    totalTrades: number;
    profitableTrades: number;
    totalPnlUsd?: number | null;
    avgHoldTimeSeconds?: number | null;
    avgReturnPct?: number | null;
    calculatedAt: string;
  } | null;
  qualification?: {
    isQualified: boolean;
    walletScore?: number | null;
    confidence?: number | null;
    reasons: string[];
    rulesetVersion?: string | null;
  } | null;
  latestSyncJob?: {
    status: string;
    attempts: number;
    maxAttempts: number;
    error?: string | null;
    createdAt: string;
    startedAt?: string | null;
    completedAt?: string | null;
  } | null;
  openPositions: Array<{
    tokenAddress: string;
    amount: number;
    avgEntryPrice?: number | null;
    currentValueUsd?: number | null;
    realizedPnlUsd?: number | null;
    unrealizedPnlUsd?: number | null;
    openedAt: string;
  }>;
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingAddress, setSyncingAddress] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [scoreBand, setScoreBand] = useState("all");
  const [pnlBand, setPnlBand] = useState("all");
  const [legitimacy, setLegitimacy] = useState("all");
  const [sortBy, setSortBy] = useState("score_desc");
  const [matchedWallets, setMatchedWallets] = useState(0);
  const [scannedWallets, setScannedWallets] = useState(0);
  const [compareAddresses, setCompareAddresses] = useState<string[]>([]);

  const apiUrl = API_BASE_URL;

  const fetchWallets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", scoreBand, pnlBand, legitimacy, sortBy });
      const response = await fetch(`${apiUrl}/api/v1/wallets?${params}`, { cache: "no-store" });
      const payload: {
        success?: boolean;
        data?: WalletRow[];
        error?: string;
        pagination?: { total: number; scanned: number; limit: number };
      } = await response.json();
      if (!payload.success || !payload.data)
        throw new Error(payload.error || "Failed to load wallets");
      setWallets(payload.data);
      setMatchedWallets(payload.pagination?.total ?? payload.data.length);
      setScannedWallets(payload.pagination?.scanned ?? payload.data.length);
      setSelectedAddress((current) =>
        payload.data?.some((wallet) => wallet.address === current)
          ? current
          : (payload.data?.find(
              (wallet) =>
                wallet.address === new URLSearchParams(window.location.search).get("address"),
            )?.address ??
            payload.data?.[0]?.address ??
            null),
      );
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, legitimacy, pnlBand, scoreBand, sortBy]);

  useEffect(() => {
    void fetchWallets();
  }, [fetchWallets]);

  useEffect(() => {
    const incomingAddress = new URLSearchParams(window.location.search).get("address")?.trim();
    if (incomingAddress) setAddress(incomingAddress);
  }, []);

  async function addWallet() {
    if (!address.trim()) return;
    const response = await apiFetch(`${apiUrl}/api/v1/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: address.trim(), label: label.trim() || undefined }),
    });
    const payload: { success?: boolean; error?: string } = await response.json();
    if (!payload.success) {
      setError(payload.error ?? "Failed to add wallet");
      return;
    }
    setAddress("");
    setLabel("");
    await fetchWallets();
  }

  async function syncWallet(walletAddress: string) {
    setSyncingAddress(walletAddress);
    setError(null);
    try {
      const response = await apiFetch(`${apiUrl}/api/v1/wallets/${walletAddress}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload: { success?: boolean; error?: string } = await response.json();
      if (!payload.success) throw new Error(payload.error || "Failed to sync wallet");
      await fetchWallets();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Failed to sync wallet");
    } finally {
      setSyncingAddress(null);
    }
  }

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.address === selectedAddress) ?? wallets[0] ?? null,
    [selectedAddress, wallets],
  );
  const qualifiedCount = wallets.filter((wallet) => wallet.qualification?.isQualified).length;
  const totalPnl = wallets.reduce((sum, wallet) => sum + (wallet.performance?.totalPnlUsd ?? 0), 0);
  const openPositions = wallets.reduce((sum, wallet) => sum + wallet.openPositions.length, 0);
  const comparedWallets = compareAddresses
    .map((walletAddress) => wallets.find((wallet) => wallet.address === walletAddress))
    .filter((wallet): wallet is WalletRow => Boolean(wallet));

  function resetFilters() {
    setScoreBand("all");
    setPnlBand("all");
    setLegitimacy("all");
    setSortBy("score_desc");
  }

  function toggleCompare(walletAddress: string) {
    setCompareAddresses((current) =>
      current.includes(walletAddress)
        ? current.filter((item) => item !== walletAddress)
        : current.length < 2
          ? [...current, walletAddress]
          : [current[1]!, walletAddress],
    );
  }

  if (loading && wallets.length === 0) return <LoadingRows rows={5} />;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Wallet intelligence"
        title="Separate proven traders from automated noise"
        description="Rank tracked wallets by performance and legitimacy evidence, compare candidates, and inspect why each wallet is qualified or risk-flagged."
        actions={
          <>
            <ActionLink href="/scanner" icon={<Radar className="h-3.5 w-3.5" />}>
              Discover wallets
            </ActionLink>
            <ActionLink href="/watchlists" icon={<BookmarkPlus className="h-3.5 w-3.5" />}>
              Wallet watchlists
            </ActionLink>
          </>
        }
      />
      {error ? (
        <ModuleNotice
          tone="warning"
          title="Wallet refresh degraded"
          message={`${error}. The last successful wallet set remains visible.`}
          action={<RefreshButton onClick={() => void fetchWallets()} busy={loading} />}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Matched Wallets"
          value={`${matchedWallets}/${scannedWallets}`}
          tone="primary"
        />
        <MetricCard
          label="Qualified"
          value={qualifiedCount}
          tone={qualifiedCount ? "success" : "default"}
        />
        <MetricCard
          label="Open Positions"
          value={openPositions}
          tone={openPositions ? "warning" : "default"}
        />
        <MetricCard
          label="Total PnL"
          value={formatUsd(totalPnl)}
          tone={totalPnl >= 0 ? "success" : "danger"}
        />
      </div>

      {comparedWallets.length ? (
        <Panel
          title="Wallet Comparison"
          eyebrow={`${comparedWallets.length}/2 selected`}
          icon={<GitCompareArrows className="h-4 w-4" />}
          action={
            <button
              type="button"
              onClick={() => setCompareAddresses([])}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant hover:text-primary"
            >
              Clear
            </button>
          }
        >
          <div className="grid gap-3 p-standard md:grid-cols-2">
            {comparedWallets.map((wallet) => (
              <div key={wallet.address} className="rounded-sm border border-outline bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-on-surface">
                      {wallet.label || wallet.classification}
                    </p>
                    <p className="mt-1 font-mono text-xs text-primary">
                      {shortAddress(wallet.address, 10, 8)}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-xl ${scoreTone(wallet.performance?.score ?? wallet.qualification?.walletScore)}`}
                  >
                    {wallet.performance?.score ?? wallet.qualification?.walletScore ?? "--"}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  <EvidenceBar
                    label="Win rate"
                    value={wallet.performance?.winRate}
                    detail={`${wallet.performance?.profitableTrades ?? 0}/${wallet.performance?.totalTrades ?? wallet.totalTrades} profitable trades`}
                  />
                  <EvidenceBar
                    label="Qualification confidence"
                    value={wallet.qualification?.confidence ?? null}
                    detail={
                      wallet.qualification?.isQualified
                        ? "Meets current qualification rules"
                        : "Does not meet current qualification rules"
                    }
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-on-surface-variant">PnL</p>
                    <p
                      className={`mt-1 font-mono ${(wallet.performance?.totalPnlUsd ?? 0) >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {formatUsd(wallet.performance?.totalPnlUsd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant">Classification</p>
                    <p className="mt-1 font-mono uppercase text-on-surface">
                      {wallet.classification}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Panel title="Intelligence Filters" icon={<SlidersHorizontal className="h-4 w-4" />}>
            <div className="grid gap-3 p-standard sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
              <AegisSelect
                label="Wallet score"
                value={scoreBand}
                onChange={setScoreBand}
                options={[
                  { label: "Any score", value: "all" },
                  { label: "Elite 80+", value: "elite" },
                  { label: "Strong 60-79", value: "strong" },
                  { label: "Watch 40-59", value: "watch" },
                  { label: "Weak under 40", value: "weak" },
                  { label: "Unscored", value: "unscored" },
                ]}
              />
              <AegisSelect
                label="PnL"
                value={pnlBand}
                onChange={setPnlBand}
                options={[
                  { label: "Any PnL", value: "all" },
                  { label: "Profitable", value: "profitable" },
                  { label: "$1K+ PnL", value: "pnl_1k" },
                  { label: "$10K+ PnL", value: "pnl_10k" },
                  { label: "Losing", value: "losing" },
                  { label: "Breakeven", value: "breakeven" },
                  { label: "Unknown PnL", value: "unknown" },
                ]}
              />
              <AegisSelect
                label="Legitimacy"
                value={legitimacy}
                onChange={setLegitimacy}
                options={[
                  { label: "Any legitimacy", value: "all" },
                  { label: "Trusted", value: "trusted" },
                  { label: "Qualified", value: "qualified" },
                  { label: "Flagged risk", value: "flagged" },
                  { label: "Unknown", value: "unknown" },
                ]}
              />
              <AegisSelect
                label="Rank by"
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { label: "Score high", value: "score_desc" },
                  { label: "PnL high", value: "pnl_desc" },
                  { label: "Win rate high", value: "win_rate_desc" },
                  { label: "Recent activity", value: "recent" },
                ]}
              />
              <button
                type="button"
                onClick={resetFilters}
                className="flex h-10 items-center justify-center gap-2 rounded-sm border border-outline bg-surface-container px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant transition-colors hover:border-primary/50 hover:text-on-surface sm:col-span-2 xl:col-span-1"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>
          </Panel>

          <Panel title="Track Wallet" icon={<Plus className="h-4 w-4" />}>
            <div className="grid gap-3 p-standard md:grid-cols-[2fr_1fr_auto]">
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Wallet address"
                className="h-10 rounded-sm border border-outline bg-surface px-3 font-mono text-sm text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary"
              />
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Label"
                className="h-10 rounded-sm border border-outline bg-surface px-3 text-sm text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary"
              />
              <button
                onClick={addWallet}
                className="rounded-sm border border-primary/30 bg-primary-container px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary-foreground"
              >
                Add
              </button>
            </div>
          </Panel>

          <Panel title="Wallet Intelligence" icon={<Users className="h-4 w-4" />}>
            <div className="divide-y divide-outline">
              {wallets.length === 0 ? (
                <EmptyState
                  title="No wallets match"
                  message="Relax the filters or discover wallets from recent token swaps in Scanner."
                  action={
                    <ActionLink href="/scanner" tone="primary">
                      Discover wallets
                    </ActionLink>
                  }
                />
              ) : (
                wallets.map((wallet) => {
                  const active = selectedWallet?.id === wallet.id;
                  const flagged = ["bot", "insider", "bundler"].includes(wallet.classification);
                  return (
                    <button
                      key={wallet.id}
                      onClick={() => setSelectedAddress(wallet.address)}
                      className={`w-full px-standard py-4 text-left transition-colors ${active ? "bg-primary/5" : "bg-surface hover:bg-surface-high"}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-on-surface">
                              {wallet.label || wallet.latestLabel?.label || "Tracked Wallet"}
                            </p>
                            <StatusBadge
                              tone={
                                flagged
                                  ? "danger"
                                  : wallet.qualification?.isQualified
                                    ? "success"
                                    : "default"
                              }
                            >
                              {wallet.classification}
                            </StatusBadge>
                          </div>
                          <p className="mt-2 font-mono text-xs text-primary">
                            {shortAddress(wallet.address, 10, 8)}
                          </p>
                          <p className="mt-2 text-sm text-on-surface-variant">
                            {wallet.totalTrades} trades - last seen{" "}
                            {formatRelative(wallet.lastSeenAt)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.1em] text-on-surface-variant">
                            <span>
                              PnL{" "}
                              <span
                                className={
                                  (wallet.performance?.totalPnlUsd ?? 0) >= 0
                                    ? "text-success"
                                    : "text-destructive"
                                }
                              >
                                {formatUsd(wallet.performance?.totalPnlUsd)}
                              </span>
                            </span>
                            <span>
                              Win{" "}
                              <span className="text-on-surface">
                                {wallet.performance?.winRate !== null &&
                                wallet.performance?.winRate !== undefined
                                  ? `${Math.round(wallet.performance.winRate * 100)}%`
                                  : "n/a"}
                              </span>
                            </span>
                            <span
                              className={
                                wallet.qualification?.isQualified
                                  ? "text-success"
                                  : "text-on-surface-variant"
                              }
                            >
                              {wallet.qualification?.isQualified ? "Qualified" : "Unqualified"}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-mono text-xl ${scoreTone(wallet.performance?.score ?? wallet.qualification?.walletScore)}`}
                          >
                            {wallet.performance?.score ?? wallet.qualification?.walletScore ?? "--"}
                          </p>
                          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                            score
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Wallet Detail" icon={<Wallet className="h-4 w-4" />}>
          {selectedWallet ? (
            <div className="space-y-4 p-standard">
              <div className="rounded-lg border border-outline bg-surface px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-on-surface">
                      {selectedWallet.label || selectedWallet.latestLabel?.label || "Target Entity"}
                    </h2>
                    <p className="mt-1 font-mono text-sm text-primary">
                      {shortAddress(selectedWallet.address, 10, 8)}
                    </p>
                  </div>
                  <button
                    onClick={() => syncWallet(selectedWallet.address)}
                    disabled={syncingAddress === selectedWallet.address}
                    className="rounded-sm border border-outline bg-surface-container px-3 py-2 text-on-surface disabled:opacity-50"
                    title="Queue wallet sync"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${syncingAddress === selectedWallet.address ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCompare(selectedWallet.address)}
                    className={`flex min-h-10 items-center justify-center gap-2 rounded-sm border px-3 font-mono text-[10px] uppercase tracking-[0.12em] ${compareAddresses.includes(selectedWallet.address) ? "border-primary bg-primary-container/20 text-primary" : "border-outline bg-surface-container text-on-surface"}`}
                  >
                    <GitCompareArrows className="h-3.5 w-3.5" />
                    {compareAddresses.includes(selectedWallet.address) ? "Comparing" : "Compare"}
                  </button>
                  <Link
                    href={`/watchlists?type=wallet&address=${selectedWallet.address}&note=${encodeURIComponent(`Wallet score ${selectedWallet.performance?.score ?? selectedWallet.qualification?.walletScore ?? "unscored"}`)}`}
                    className="flex min-h-10 items-center justify-center gap-2 rounded-sm border border-outline bg-surface-container px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface hover:text-primary"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    Watch
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MetricCard
                  label="Win Rate"
                  value={
                    selectedWallet.performance?.winRate !== null &&
                    selectedWallet.performance?.winRate !== undefined
                      ? `${Math.round(selectedWallet.performance.winRate * 100)}%`
                      : "n/a"
                  }
                  tone="primary"
                />
                <MetricCard
                  label="PnL"
                  value={formatUsd(selectedWallet.performance?.totalPnlUsd)}
                  tone={(selectedWallet.performance?.totalPnlUsd ?? 0) >= 0 ? "success" : "danger"}
                />
                <MetricCard
                  label="Trades"
                  value={selectedWallet.performance?.totalTrades ?? selectedWallet.totalTrades}
                />
                <MetricCard
                  label="Avg Return"
                  value={
                    selectedWallet.performance?.avgReturnPct !== null &&
                    selectedWallet.performance?.avgReturnPct !== undefined
                      ? `${selectedWallet.performance.avgReturnPct.toFixed(1)}%`
                      : "n/a"
                  }
                />
              </div>

              <ModuleNotice
                tone={
                  ["bot", "insider", "bundler"].includes(selectedWallet.classification)
                    ? "danger"
                    : selectedWallet.qualification?.isQualified
                      ? "success"
                      : "warning"
                }
                title={
                  ["bot", "insider", "bundler"].includes(selectedWallet.classification)
                    ? "Risk-classified wallet"
                    : selectedWallet.qualification?.isQualified
                      ? "Qualified by current rules"
                      : "Legitimacy remains unproven"
                }
                message="Classification is evidence from observed behavior, not identity verification. Review the qualification factors, performance sample, and recency before trusting this wallet."
              />

              <ModuleNotice
                tone="default"
                title="Relationship evidence not collected"
                message="Funding paths and wallet clusters are not yet persisted for this wallet. The interface reports that gap rather than implying the wallet is independent."
              />

              <div className="rounded-lg border border-outline bg-surface px-4 py-4">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-success" />
                  <p className="font-semibold text-on-surface">Qualification Factors</p>
                </div>
                <div className="mt-3 space-y-2">
                  {(selectedWallet.qualification?.reasons ?? []).length > 0 ? (
                    selectedWallet.qualification!.reasons.map((reason) => (
                      <div
                        key={reason}
                        className="flex items-start gap-2 text-sm text-on-surface-variant"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-success" />
                        {reason}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-on-surface-variant">
                      No qualification reasons stored yet.
                    </p>
                  )}
                </div>
              </div>

              {selectedWallet.latestSyncJob ? (
                <div
                  className={`rounded-lg border px-4 py-4 ${selectedWallet.latestSyncJob.error ? "border-destructive/40 bg-destructive/10" : "border-outline bg-surface"}`}
                >
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <p className="font-semibold text-on-surface">Latest Sync Job</p>
                  </div>
                  <p className="mt-2 font-mono text-xs text-on-surface-variant">
                    {selectedWallet.latestSyncJob.status} - attempts{" "}
                    {selectedWallet.latestSyncJob.attempts}/
                    {selectedWallet.latestSyncJob.maxAttempts} - queued{" "}
                    {formatRelative(selectedWallet.latestSyncJob.createdAt)}
                  </p>
                  {selectedWallet.latestSyncJob.error ? (
                    <p className="mt-2 text-sm text-destructive">
                      {selectedWallet.latestSyncJob.error}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-lg border border-outline bg-surface px-4 py-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-warning" />
                  <p className="font-semibold text-on-surface">Open Positions</p>
                </div>
                <div className="mt-3 space-y-2">
                  {selectedWallet.openPositions.length > 0 ? (
                    selectedWallet.openPositions.map((position) => (
                      <div
                        key={position.tokenAddress}
                        className="rounded-sm border border-outline bg-surface-container px-3 py-3 text-sm"
                      >
                        <div className="flex justify-between gap-3">
                          <Link
                            href={`/tokens/${position.tokenAddress}`}
                            className="font-mono text-primary hover:underline"
                          >
                            {shortAddress(position.tokenAddress)}
                          </Link>
                          <span className="font-mono text-on-surface">
                            {formatUsd(position.currentValueUsd)}
                          </span>
                        </div>
                        <p className="mt-2 text-on-surface-variant">
                          {position.amount.toFixed(4)} units - opened{" "}
                          {formatRelative(position.openedAt)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-on-surface-variant">
                      No open positions recorded for this wallet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-standard text-sm text-on-surface-variant">
              Select a wallet to inspect qualification and sync state.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
