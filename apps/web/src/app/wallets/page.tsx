"use client";

import { useEffect, useState } from "react";

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
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  async function fetchWallets() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/v1/wallets?limit=50`);
      const payload: any = await response.json();

      if (!payload.success) {
        throw new Error(payload.error || "Failed to load wallets");
      }

      setWallets(payload.data);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWallets();
  }, []);

  async function addWallet() {
    if (!address.trim()) return;

    const response = await fetch(`${apiUrl}/api/v1/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: address.trim(),
        label: label.trim() || undefined,
      }),
    });
    const payload: any = await response.json();

    if (payload.success) {
      setAddress("");
      setLabel("");
      await fetchWallets();
    }
  }

  async function syncWallet(walletAddress: string) {
    setSyncingAddress(walletAddress);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/v1/wallets/${walletAddress}/sync`, {
        method: "POST",
      });
      const payload: any = await response.json();
      if (!payload.success) {
        throw new Error(payload.error || "Failed to sync wallet");
      }
      await fetchWallets();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Failed to sync wallet");
    } finally {
      setSyncingAddress(null);
    }
  }

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Wallet Intelligence</h1>
        <p className="text-muted-foreground">Tracked wallets, classifications, performance snapshots, and open positions.</p>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div>
          <h2 className="font-semibold">Track Wallet</h2>
          <p className="text-sm text-muted-foreground">Create a wallet record so classification and history ingestion can target it.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Wallet address"
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional label"
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <button onClick={addWallet} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
            Add Wallet
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted" />)}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && wallets.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">
          No wallets tracked yet. Add one above or seed the database to populate the wallet intelligence view.
        </div>
      )}

      {!loading && !error && wallets.length > 0 && (
        <div className="grid gap-4">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{wallet.label || wallet.latestLabel?.label || "Tracked Wallet"}</h2>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{wallet.classification}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{wallet.address}</p>
                </div>
                <div className="text-right text-sm">
                    <p>{wallet.totalTrades} wallet trades</p>
                    <p className="text-muted-foreground">
                      {wallet.lastSeenAt ? `Last seen ${new Date(wallet.lastSeenAt).toLocaleString()}` : "No last-seen timestamp"}
                    </p>
                    <button
                      onClick={() => syncWallet(wallet.address)}
                      disabled={syncingAddress === wallet.address}
                      className="mt-2 rounded-md border px-3 py-1 text-xs hover:bg-muted/50 disabled:opacity-50"
                    >
                      {syncingAddress === wallet.address ? "Queueing..." : "Queue Sync"}
                    </button>
                  </div>
                </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-md border p-4">
                  <p className="text-sm font-medium text-muted-foreground">Latest Classification</p>
                  <p className="mt-2 font-medium">{wallet.latestLabel?.label || wallet.classification}</p>
                  <p className="text-xs text-muted-foreground">
                    {wallet.latestLabel ? `${Math.round(wallet.latestLabel.confidence * 100)}% confidence via ${wallet.latestLabel.source}` : "No derived label stored yet"}
                  </p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-sm font-medium text-muted-foreground">Performance Snapshot</p>
                  <p className="mt-2 font-medium">
                    {wallet.performance?.score !== null && wallet.performance?.score !== undefined ? `${wallet.performance.score}/100` : "No score yet"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {wallet.performance?.winRate !== null && wallet.performance?.winRate !== undefined
                      ? `${Math.round(wallet.performance.winRate * 100)}% win rate`
                      : "Performance not calculated"}
                  </p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-sm font-medium text-muted-foreground">Qualification</p>
                  <p className="mt-2 font-medium">
                    {wallet.qualification ? (wallet.qualification.isQualified ? "Qualified" : "Not qualified") : "No qualification yet"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {wallet.qualification?.walletScore !== null && wallet.qualification?.walletScore !== undefined
                      ? `Wallet score ${wallet.qualification.walletScore}/100`
                      : "Qualification pending sync"}
                  </p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-sm font-medium text-muted-foreground">Open Positions</p>
                  <p className="mt-2 font-medium">{wallet.openPositions.length}</p>
                  <p className="text-xs text-muted-foreground">
                    {wallet.openPositions.length > 0 ? "Derived from persisted wallet positions" : "No open positions recorded"}
                  </p>
                </div>
              </div>

              {wallet.latestSyncJob ? (
                <div className="rounded-md border p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="font-medium">Latest Sync Job</p>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{wallet.latestSyncJob.status}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Attempts {wallet.latestSyncJob.attempts}/{wallet.latestSyncJob.maxAttempts} | Queued {new Date(wallet.latestSyncJob.createdAt).toLocaleString()}
                  </p>
                  {wallet.latestSyncJob.error ? (
                    <p className="mt-1 text-xs text-destructive">{wallet.latestSyncJob.error}</p>
                  ) : null}
                </div>
              ) : null}

              {wallet.openPositions.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Position Details</h3>
                  {wallet.openPositions.map((position) => (
                    <div key={`${wallet.id}-${position.tokenAddress}`} className="rounded-md border p-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <p className="font-mono text-xs">{position.tokenAddress}</p>
                        <p className="text-muted-foreground">Opened {new Date(position.openedAt).toLocaleString()}</p>
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-4">
                        <p>Amount: {position.amount.toFixed(4)}</p>
                        <p>Entry: {position.avgEntryPrice?.toFixed(6) ?? "n/a"}</p>
                        <p>Value: {position.currentValueUsd?.toFixed(2) ?? "n/a"}</p>
                        <p>Unrealized PnL: {position.unrealizedPnlUsd?.toFixed(2) ?? "n/a"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
