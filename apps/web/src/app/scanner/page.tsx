"use client";

import { useEffect, useState } from "react";

interface ScannerItem {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  signalScore: number;
  confidence: number;
  priority: string;
  detectedAt: string;
}

export default function ScannerPage() {
  const [items, setItems] = useState<ScannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("detected_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [minScore, setMinScore] = useState<string>("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function fetchSignals() {
      setLoading(true);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const params = new URLSearchParams({ page: String(page), limit: "20", sortBy, sortOrder });
        if (minScore) params.set("minScore", minScore);
        const res = await fetch(`${apiUrl}/api/v1/scanner?${params}`);
        const data: any = await res.json();
        if (data.success) setItems(data.data);
        else setError(data.error);
      } catch {
        setError("Failed to fetch signals. Is the API running?");
      } finally {
        setLoading(false);
      }
    }
    fetchSignals();
  }, [page, sortBy, sortOrder, minScore]);

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scanner</h1>
        <p className="text-muted-foreground">Real-time token signals and intelligence</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label htmlFor="min-score" className="text-sm font-medium">Min Score</label>
          <input id="min-score" type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore((e.target as HTMLInputElement).value)} placeholder="0" className="mt-1 block w-32 rounded-md border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="sort-by" className="text-sm font-medium">Sort By</label>
          <select id="sort-by" value={sortBy} onChange={(e) => setSortBy((e.target as HTMLSelectElement).value)} className="mt-1 block rounded-md border bg-background px-3 py-2 text-sm">
            <option value="detected_at">Detection Time</option>
            <option value="signal_score">Signal Score</option>
            <option value="priority">Priority</option>
          </select>
        </div>
        <div>
          <label htmlFor="sort-order" className="text-sm font-medium">Order</label>
          <select id="sort-order" value={sortOrder} onChange={(e) => setSortOrder((e.target as HTMLSelectElement).value as "asc" | "desc")} className="mt-1 block rounded-md border bg-background px-3 py-2 text-sm">
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted" />)}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">Error loading signals</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-12">
          <p className="text-lg font-medium">No signals found</p>
          <p className="text-sm text-muted-foreground">Run the ingestion pipeline or adjust filters.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Token</th>
                <th className="px-4 py-3 text-left font-medium">Score</th>
                <th className="px-4 py-3 text-left font-medium">Confidence</th>
                <th className="px-4 py-3 text-left font-medium">Priority</th>
                <th className="px-4 py-3 text-left font-medium">Detected</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{item.tokenSymbol}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.tokenAddress.slice(0, 12)}...</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${item.signalScore >= 80 ? "text-success" : item.signalScore >= 60 ? "text-warning" : "text-muted-foreground"}`}>
                      {item.signalScore}/100
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{(item.confidence * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      item.priority === "critical" ? "bg-destructive/10 text-destructive" :
                      item.priority === "high" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"
                    }`}>{item.priority}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(item.detectedAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <a href={`/tokens/${item.tokenAddress}`} className="text-primary hover:underline text-sm">View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="flex items-center justify-between">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded-md border px-3 py-1 text-sm disabled:opacity-50">Previous</button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <button onClick={() => setPage(page + 1)} className="rounded-md border px-3 py-1 text-sm">Next</button>
        </div>
      )}
    </div>
  );
}
