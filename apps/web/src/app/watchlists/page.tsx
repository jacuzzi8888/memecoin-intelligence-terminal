"use client";

import { useEffect, useState } from "react";

interface WatchlistItem {
  id: string;
  itemType: "token" | "wallet";
  itemAddress: string;
  note?: string | null;
  addedAt: string;
  token?: {
    symbol?: string | null;
    name?: string | null;
  } | null;
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

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  async function fetchWatchlists() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/v1/watchlists`);
      const payload: any = await response.json();

      if (!payload.success) {
        throw new Error(payload.error || "Failed to load watchlists");
      }

      setWatchlists(payload.data);
      if (!selectedWatchlistId && payload.data[0]?.id) {
        setSelectedWatchlistId(payload.data[0].id);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load watchlists");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWatchlists();
  }, []);

  async function createWatchlist() {
    if (!newWatchlistName.trim()) return;

    const response = await fetch(`${apiUrl}/api/v1/watchlists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newWatchlistName.trim(),
        description: newWatchlistDescription.trim() || undefined,
      }),
    });
    const payload: any = await response.json();

    if (payload.success) {
      setWatchlists(payload.data);
      setNewWatchlistName("");
      setNewWatchlistDescription("");
      if (payload.data[0]?.id && !selectedWatchlistId) {
        setSelectedWatchlistId(payload.data[0].id);
      }
    }
  }

  async function addItem() {
    if (!selectedWatchlistId || !itemAddress.trim()) return;

    const response = await fetch(`${apiUrl}/api/v1/watchlists/${selectedWatchlistId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemType,
        itemAddress: itemAddress.trim(),
        note: itemNote.trim() || undefined,
      }),
    });
    const payload: any = await response.json();

    if (payload.success) {
      setWatchlists(payload.data);
      setItemAddress("");
      setItemNote("");
    }
  }

  async function removeItem(watchlistId: string, itemId: string) {
    const response = await fetch(`${apiUrl}/api/v1/watchlists/${watchlistId}/items/${itemId}`, {
      method: "DELETE",
    });
    const payload: any = await response.json();

    if (payload.success) {
      setWatchlists(payload.data);
    }
  }

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Watchlists</h1>
        <p className="text-muted-foreground">Track token and wallet addresses from persisted application data.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Create Watchlist</h2>
            <p className="text-sm text-muted-foreground">Development-mode watchlists are stored in the database and can mix tokens and wallets.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={newWatchlistName}
              onChange={(e) => setNewWatchlistName(e.target.value)}
              placeholder="Alpha candidates"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <input
              value={newWatchlistDescription}
              onChange={(e) => setNewWatchlistDescription(e.target.value)}
              placeholder="Optional description"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <button onClick={createWatchlist} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
            Create Watchlist
          </button>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Add Item</h2>
            <p className="text-sm text-muted-foreground">Attach a token mint or wallet address to any saved watchlist.</p>
          </div>
          <div className="grid gap-3">
            <select
              value={selectedWatchlistId}
              onChange={(e) => setSelectedWatchlistId(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select watchlist</option>
              {watchlists.map((watchlist) => (
                <option key={watchlist.id} value={watchlist.id}>{watchlist.name}</option>
              ))}
            </select>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value as "token" | "wallet")}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="token">Token</option>
              <option value="wallet">Wallet</option>
            </select>
            <input
              value={itemAddress}
              onChange={(e) => setItemAddress(e.target.value)}
              placeholder={itemType === "token" ? "Token mint address" : "Wallet address"}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <input
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              placeholder="Optional note"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <button onClick={addItem} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
            Add Item
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted" />)}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && watchlists.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">
          No watchlists yet. Create one above to start tracking tokens or wallets.
        </div>
      )}

      {!loading && !error && watchlists.length > 0 && (
        <div className="grid gap-4">
          {watchlists.map((watchlist) => (
            <div key={watchlist.id} className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{watchlist.name}</h2>
                  <p className="text-sm text-muted-foreground">{watchlist.description || "No description"}</p>
                </div>
                <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
                  {watchlist.itemCount} item{watchlist.itemCount === 1 ? "" : "s"}
                </span>
              </div>

              {watchlist.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items in this watchlist yet.</p>
              ) : (
                <div className="space-y-3">
                  {watchlist.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-4 rounded-md border p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase text-muted-foreground">{item.itemType}</span>
                          <p className="font-medium">
                            {item.itemType === "token"
                              ? item.token?.symbol || "Unknown Token"
                              : item.wallet?.label || item.wallet?.classification || "Tracked Wallet"}
                          </p>
                        </div>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{item.itemAddress}</p>
                        {item.itemType === "token" && item.token?.name ? (
                          <p className="mt-1 text-xs text-muted-foreground">{item.token.name}</p>
                        ) : null}
                        {item.itemType === "wallet" && item.wallet ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.wallet.classification || "unknown"} • {item.wallet.totalTrades ?? 0} trades
                          </p>
                        ) : null}
                        {item.note ? <p className="mt-2 text-sm">{item.note}</p> : null}
                      </div>
                      <button
                        onClick={() => removeItem(watchlist.id, item.id)}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-muted/50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
