"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, Eye, Plus, Radar, Trash2, WalletCards } from "lucide-react";
import {
  AegisSelect,
  LoadingRows,
  MetricCard,
  Panel,
  StatusBadge,
  formatRelative,
  shortAddress,
} from "@/components/aegis-ui";
import {
  ActionLink,
  EmptyState,
  ModuleNotice,
  PageHeader,
  RefreshButton,
} from "@/components/workflow-ui";
import { API_BASE_URL } from "@/lib/api-url";
import { apiFetch } from "@/lib/api-client";

interface WatchlistItem {
  id: string;
  itemType: "token" | "wallet";
  itemAddress: string;
  note?: string | null;
  addedAt: string;
  token?: { symbol?: string | null; name?: string | null } | null;
  wallet?: {
    label?: string | null;
    classification?: string | null;
    totalTrades?: number | null;
  } | null;
}

interface Watchlist {
  id: string;
  name: string;
  description?: string | null;
  itemCount: number;
  items: WatchlistItem[];
}

export default function WatchlistsPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [newWatchlistDescription, setNewWatchlistDescription] = useState("");
  const [selectedWatchlistId, setSelectedWatchlistId] = useState("");
  const [itemType, setItemType] = useState<"token" | "wallet">("token");
  const [itemAddress, setItemAddress] = useState("");
  const [itemNote, setItemNote] = useState("");
  const [lastReviewedByList, setLastReviewedByList] = useState<Record<string, string>>({});
  const apiUrl = API_BASE_URL;

  const fetchWatchlists = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/watchlists`, { cache: "no-store" });
      const payload: { success?: boolean; data?: Watchlist[]; error?: string } =
        await response.json();
      if (!payload.success || !payload.data)
        throw new Error(payload.error || "Failed to load watchlists");
      setWatchlists(payload.data);
      setSelectedWatchlistId((current) => current || payload.data?.[0]?.id || "");
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load watchlists");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void fetchWatchlists();
  }, [fetchWatchlists]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingType = params.get("type");
    const incomingAddress = params.get("address");
    const incomingNote = params.get("note");
    if (incomingType === "token" || incomingType === "wallet") setItemType(incomingType);
    if (incomingAddress) setItemAddress(incomingAddress);
    if (incomingNote) setItemNote(incomingNote);
    try {
      setLastReviewedByList(
        JSON.parse(window.localStorage.getItem("aegis-watchlist-reviews") || "{}") as Record<
          string,
          string
        >,
      );
    } catch {
      window.localStorage.removeItem("aegis-watchlist-reviews");
    }
  }, []);

  async function createWatchlist() {
    if (!newWatchlistName.trim()) return;
    const response = await apiFetch(`${apiUrl}/api/v1/watchlists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newWatchlistName.trim(),
        description: newWatchlistDescription.trim() || undefined,
      }),
    });
    const payload: { success?: boolean; data?: Watchlist[]; error?: string } =
      await response.json();
    if (!payload.success || !payload.data) {
      setError(payload.error ?? "Failed to create watchlist");
      return;
    }
    setWatchlists(payload.data);
    setSelectedWatchlistId(payload.data[0]?.id ?? "");
    setNewWatchlistName("");
    setNewWatchlistDescription("");
  }

  async function addItem() {
    if (!selectedWatchlistId || !itemAddress.trim()) return;
    const response = await apiFetch(`${apiUrl}/api/v1/watchlists/${selectedWatchlistId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemType,
        itemAddress: itemAddress.trim(),
        note: itemNote.trim() || undefined,
      }),
    });
    const payload: { success?: boolean; data?: Watchlist[]; error?: string } =
      await response.json();
    if (!payload.success || !payload.data) {
      setError(payload.error ?? "Failed to add watchlist item");
      return;
    }
    setWatchlists(payload.data);
    setItemAddress("");
    setItemNote("");
  }

  async function removeItem(watchlistId: string, itemId: string) {
    const response = await apiFetch(`${apiUrl}/api/v1/watchlists/${watchlistId}/items/${itemId}`, {
      method: "DELETE",
    });
    const payload: { success?: boolean; data?: Watchlist[]; error?: string } =
      await response.json();
    if (payload.success && payload.data) setWatchlists(payload.data);
    else setError(payload.error ?? "Failed to remove item");
  }

  const selectedWatchlist = useMemo(
    () =>
      watchlists.find((watchlist) => watchlist.id === selectedWatchlistId) ?? watchlists[0] ?? null,
    [selectedWatchlistId, watchlists],
  );
  const totalItems = watchlists.reduce((sum, watchlist) => sum + watchlist.itemCount, 0);
  const tokenItems = watchlists.reduce(
    (sum, watchlist) => sum + watchlist.items.filter((item) => item.itemType === "token").length,
    0,
  );
  const walletItems = totalItems - tokenItems;
  const lastReviewedAt = selectedWatchlist ? lastReviewedByList[selectedWatchlist.id] : null;
  const changedItems =
    selectedWatchlist?.items.filter(
      (item) => !lastReviewedAt || new Date(item.addedAt) > new Date(lastReviewedAt),
    ).length ?? 0;

  function markReviewed() {
    if (!selectedWatchlist) return;
    const next = { ...lastReviewedByList, [selectedWatchlist.id]: new Date().toISOString() };
    setLastReviewedByList(next);
    window.localStorage.setItem("aegis-watchlist-reviews", JSON.stringify(next));
  }

  if (loading && watchlists.length === 0) return <LoadingRows rows={4} />;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Monitoring workspace"
        title="Review what changed, not the same list again"
        description="Keep candidates and wallets together with investigation notes, then mark each list reviewed so new additions remain visible."
        actions={
          <>
            <ActionLink href="/scanner" icon={<Radar className="h-3.5 w-3.5" />}>
              Find tokens
            </ActionLink>
            <ActionLink href="/wallets">Find wallets</ActionLink>
          </>
        }
      />
      {error ? (
        <ModuleNotice
          tone="warning"
          title="Watchlist refresh degraded"
          message={`${error}. The last successful lists remain visible.`}
          action={<RefreshButton onClick={() => void fetchWatchlists()} busy={loading} />}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Watchlists" value={watchlists.length} tone="primary" />
        <MetricCard
          label="Items"
          value={totalItems}
          detail={changedItems ? `${changedItems} new in selected list` : "Selected list reviewed"}
        />
        <MetricCard label="Tokens" value={tokenItems} tone="success" />
        <MetricCard label="Wallets" value={walletItems} tone="warning" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr_360px]">
        <Panel title="Lists" icon={<Eye className="h-4 w-4" />}>
          <div className="divide-y divide-outline">
            {watchlists.map((watchlist) => (
              <button
                key={watchlist.id}
                onClick={() => setSelectedWatchlistId(watchlist.id)}
                className={`w-full px-standard py-4 text-left transition-colors ${selectedWatchlist?.id === watchlist.id ? "bg-primary/5" : "bg-surface hover:bg-surface-high"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-on-surface">{watchlist.name}</p>
                  <StatusBadge tone="default">{watchlist.itemCount}</StatusBadge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">
                  {watchlist.description || "No description"}
                </p>
              </button>
            ))}
            {watchlists.length === 0 ? (
              <div className="p-standard text-sm text-on-surface-variant">
                No watchlists created yet.
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          title={selectedWatchlist?.name ?? "Watchlist Items"}
          eyebrow={
            lastReviewedAt ? `Reviewed ${formatRelative(lastReviewedAt)}` : "Not reviewed yet"
          }
          icon={<WalletCards className="h-4 w-4" />}
          action={
            selectedWatchlist ? (
              <button
                type="button"
                onClick={markReviewed}
                className="inline-flex items-center gap-2 rounded-sm border border-outline bg-surface px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface hover:text-primary"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark reviewed
              </button>
            ) : undefined
          }
        >
          <div className="divide-y divide-outline">
            {!selectedWatchlist || selectedWatchlist.items.length === 0 ? (
              <EmptyState
                title="No monitored items"
                message="Add a token from Scanner or Research, or add a wallet from Wallet Intelligence."
                action={
                  <ActionLink href="/scanner" tone="primary">
                    Open scanner
                  </ActionLink>
                }
              />
            ) : (
              selectedWatchlist.items.map((item) => {
                const title =
                  item.itemType === "token"
                    ? item.token?.symbol
                      ? `$${item.token.symbol}`
                      : "Unknown Token"
                    : item.wallet?.label || item.wallet?.classification || "Tracked Wallet";
                const href =
                  item.itemType === "token"
                    ? `/tokens/${item.itemAddress}`
                    : `/wallets?address=${item.itemAddress}`;
                const isNew = !lastReviewedAt || new Date(item.addedAt) > new Date(lastReviewedAt);
                return (
                  <div key={item.id} className="px-standard py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={item.itemType === "token" ? "success" : "warning"}>
                            {item.itemType}
                          </StatusBadge>
                          {isNew ? <StatusBadge tone="primary">New</StatusBadge> : null}
                          <Link
                            href={href}
                            className="font-semibold text-on-surface hover:text-primary"
                          >
                            {title}
                          </Link>
                        </div>
                        <p className="mt-2 font-mono text-xs text-primary">
                          {shortAddress(item.itemAddress, 10, 8)}
                        </p>
                        <p className="mt-2 text-sm text-on-surface-variant">
                          {item.note || "No note"} - added {formatRelative(item.addedAt)}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          selectedWatchlist && removeItem(selectedWatchlist.id, item.id)
                        }
                        className="rounded-sm border border-outline bg-surface p-2 text-on-surface-variant hover:text-destructive"
                        title="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Create Watchlist" icon={<Plus className="h-4 w-4" />}>
            <div className="space-y-3 p-standard">
              <input
                value={newWatchlistName}
                onChange={(event) => setNewWatchlistName(event.target.value)}
                placeholder="Alpha candidates"
                className="h-10 w-full rounded-sm border border-outline bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary"
              />
              <input
                value={newWatchlistDescription}
                onChange={(event) => setNewWatchlistDescription(event.target.value)}
                placeholder="Description"
                className="h-10 w-full rounded-sm border border-outline bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary"
              />
              <button
                onClick={createWatchlist}
                className="w-full rounded-sm border border-primary/30 bg-primary-container px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary-foreground"
              >
                Create
              </button>
            </div>
          </Panel>

          <Panel title="Add Item" icon={<Plus className="h-4 w-4" />}>
            <div className="space-y-3 p-standard">
              <AegisSelect
                label="Watchlist"
                value={selectedWatchlistId}
                options={[
                  { label: "Select watchlist", value: "" },
                  ...watchlists.map((watchlist) => ({
                    label: watchlist.name,
                    value: watchlist.id,
                  })),
                ]}
                onChange={setSelectedWatchlistId}
              />
              <AegisSelect
                label="Item type"
                value={itemType}
                options={[
                  { label: "Token", value: "token" },
                  { label: "Wallet", value: "wallet" },
                ]}
                onChange={(value) => setItemType(value as "token" | "wallet")}
              />
              <input
                value={itemAddress}
                onChange={(event) => setItemAddress(event.target.value)}
                placeholder="Address"
                className="h-10 w-full rounded-sm border border-outline bg-surface px-3 font-mono text-sm text-on-surface outline-none focus:border-primary"
              />
              <input
                value={itemNote}
                onChange={(event) => setItemNote(event.target.value)}
                placeholder="Note"
                className="h-10 w-full rounded-sm border border-outline bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary"
              />
              <button
                onClick={addItem}
                className="w-full rounded-sm border border-outline bg-surface-container px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface"
              >
                Add Item
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
