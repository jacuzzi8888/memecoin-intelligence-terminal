"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BadgeCheck, Plus, RefreshCw, ShieldAlert, Users, Wallet } from "lucide-react";
import {
  ErrorState,
  LoadingRows,
  MetricCard,
  Panel,
  StatusBadge,
  formatRelative,
  formatUsd,
  scoreTone,
  shortAddress,
} from "@/components/aegis-ui";
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

  const apiUrl = API_BASE_URL;

  const fetchWallets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/wallets?limit=50`, { cache: "no-store" });
      const payload: { success?: boolean; data?: WalletRow[]; error?: string } = await response.json();
      if (!payload.success || !payload.data) throw new Error(payload.error || "Failed to load wallets");
      setWallets(payload.data);
      setSelectedAddress((current) => current ?? payload.data?.[0]?.address ?? null);
    } catch (fetchError) {
      setWallets([]);
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void fetchWallets();
  }, [fetchWallets]);

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

  if (loading) return <LoadingRows rows={5} />;

  return (
    <div className="space-y-4">
      {error ? <ErrorState title="Wallet surface degraded" message={error} /> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Tracked Wallets" value={wallets.length} tone="primary" />
        <MetricCard label="Qualified" value={qualifiedCount} tone={qualifiedCount ? "success" : "default"} />
        <MetricCard label="Open Positions" value={openPositions} tone={openPositions ? "warning" : "default"} />
        <MetricCard label="Total PnL" value={formatUsd(totalPnl)} tone={totalPnl >= 0 ? "success" : "danger"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
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
              <button onClick={addWallet} className="rounded-sm border border-primary/30 bg-primary-container px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary-foreground">
                Add
              </button>
            </div>
          </Panel>

          <Panel title="Wallet Intelligence" icon={<Users className="h-4 w-4" />}>
            <div className="divide-y divide-outline">
              {wallets.length === 0 ? (
                <div className="p-standard text-sm text-on-surface-variant">No wallets tracked yet.</div>
              ) : (
                wallets.map((wallet) => {
                  const active = selectedWallet?.id === wallet.id;
                  return (
                    <button
                      key={wallet.id}
                      onClick={() => setSelectedAddress(wallet.address)}
                      className={`w-full px-standard py-4 text-left transition-colors ${active ? "bg-primary/5" : "bg-surface hover:bg-surface-high"}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-on-surface">{wallet.label || wallet.latestLabel?.label || "Tracked Wallet"}</p>
                            <StatusBadge tone={wallet.qualification?.isQualified ? "success" : "default"}>
                              {wallet.classification}
                            </StatusBadge>
                          </div>
                          <p className="mt-2 font-mono text-xs text-primary">{shortAddress(wallet.address, 10, 8)}</p>
                          <p className="mt-2 text-sm text-on-surface-variant">
                            {wallet.totalTrades} trades - last seen {formatRelative(wallet.lastSeenAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-mono text-xl ${scoreTone(wallet.performance?.score ?? wallet.qualification?.walletScore)}`}>
                            {wallet.performance?.score ?? wallet.qualification?.walletScore ?? "--"}
                          </p>
                          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">score</p>
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
                    <h2 className="text-xl font-semibold text-on-surface">{selectedWallet.label || selectedWallet.latestLabel?.label || "Target Entity"}</h2>
                    <p className="mt-1 font-mono text-sm text-primary">{shortAddress(selectedWallet.address, 10, 8)}</p>
                  </div>
                  <button
                    onClick={() => syncWallet(selectedWallet.address)}
                    disabled={syncingAddress === selectedWallet.address}
                    className="rounded-sm border border-outline bg-surface-container px-3 py-2 text-on-surface disabled:opacity-50"
                    title="Queue wallet sync"
                  >
                    <RefreshCw className={`h-4 w-4 ${syncingAddress === selectedWallet.address ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MetricCard label="Win Rate" value={selectedWallet.performance?.winRate !== null && selectedWallet.performance?.winRate !== undefined ? `${Math.round(selectedWallet.performance.winRate * 100)}%` : "n/a"} tone="primary" />
                <MetricCard label="PnL" value={formatUsd(selectedWallet.performance?.totalPnlUsd)} tone={(selectedWallet.performance?.totalPnlUsd ?? 0) >= 0 ? "success" : "danger"} />
                <MetricCard label="Trades" value={selectedWallet.performance?.totalTrades ?? selectedWallet.totalTrades} />
                <MetricCard label="Avg Return" value={selectedWallet.performance?.avgReturnPct !== null && selectedWallet.performance?.avgReturnPct !== undefined ? `${selectedWallet.performance.avgReturnPct.toFixed(1)}%` : "n/a"} />
              </div>

              <div className="rounded-lg border border-outline bg-surface px-4 py-4">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-success" />
                  <p className="font-semibold text-on-surface">Qualification Factors</p>
                </div>
                <div className="mt-3 space-y-2">
                  {(selectedWallet.qualification?.reasons ?? []).length > 0 ? (
                    selectedWallet.qualification!.reasons.map((reason) => (
                      <div key={reason} className="flex items-start gap-2 text-sm text-on-surface-variant">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-success" />
                        {reason}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-on-surface-variant">No qualification reasons stored yet.</p>
                  )}
                </div>
              </div>

              {selectedWallet.latestSyncJob ? (
                <div className={`rounded-lg border px-4 py-4 ${selectedWallet.latestSyncJob.error ? "border-destructive/40 bg-destructive/10" : "border-outline bg-surface"}`}>
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <p className="font-semibold text-on-surface">Latest Sync Job</p>
                  </div>
                  <p className="mt-2 font-mono text-xs text-on-surface-variant">
                    {selectedWallet.latestSyncJob.status} - attempts {selectedWallet.latestSyncJob.attempts}/{selectedWallet.latestSyncJob.maxAttempts} - queued {formatRelative(selectedWallet.latestSyncJob.createdAt)}
                  </p>
                  {selectedWallet.latestSyncJob.error ? (
                    <p className="mt-2 text-sm text-destructive">{selectedWallet.latestSyncJob.error}</p>
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
                      <div key={position.tokenAddress} className="rounded-sm border border-outline bg-surface-container px-3 py-3 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="font-mono text-primary">{shortAddress(position.tokenAddress)}</span>
                          <span className="font-mono text-on-surface">{formatUsd(position.currentValueUsd)}</span>
                        </div>
                        <p className="mt-2 text-on-surface-variant">
                          {position.amount.toFixed(4)} units - opened {formatRelative(position.openedAt)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-on-surface-variant">No open positions recorded for this wallet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-standard text-sm text-on-surface-variant">Select a wallet to inspect qualification and sync state.</div>
          )}
        </Panel>
      </div>
    </div>
  );
}
