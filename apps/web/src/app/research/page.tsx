"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CircleHelp, Radar, Search, ShieldCheck, Wallet } from "lucide-react";
import { ErrorState, LoadingRows, MetricCard, Panel, StatusBadge, formatRelative, formatUsd, shortAddress } from "@/components/aegis-ui";
import { API_BASE_URL } from "@/lib/api-url";

interface ResearchCandidate {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  signalScore: number;
  confidence: number;
  detectedAt: string;
  dataFreshness: string;
  risk: { score: number | null; rating: string | null };
  market: { liquidityUsd: number; volume1hUsd: number; marketCapUsd: number } | null;
  walletEvidence: { walletCount: number; qualifiedWalletCount: number };
}

function confidenceTone(confidence: number) {
  if (confidence >= 0.75) return "success" as const;
  if (confidence >= 0.55) return "warning" as const;
  return "default" as const;
}

export default function ResearchPage() {
  const [candidates, setCandidates] = useState<ResearchCandidate[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams({ timeframe: "24h", limit: "12", minScore: "0", sortBy: "signal_score", sortOrder: "desc" });
        const response = await fetch(`${API_BASE_URL}/api/v1/scanner?${params}`, { cache: "no-store" });
        const payload = await response.json() as { success?: boolean; data?: ResearchCandidate[]; error?: string };
        if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || "Research data is unavailable.");
        if (active) {
          setCandidates(payload.data);
          setError(null);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Research data is unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? candidates.filter((candidate) => [candidate.tokenSymbol, candidate.tokenName, candidate.tokenAddress].some((value) => value.toLowerCase().includes(normalizedQuery)))
    : candidates;
  const qualifiedCount = candidates.filter((candidate) => candidate.walletEvidence.qualifiedWalletCount > 0).length;
  const knownRiskCount = candidates.filter((candidate) => candidate.risk.rating && candidate.risk.rating !== "unknown").length;

  if (loading) return <LoadingRows rows={6} />;

  return (
    <div className="space-y-4">
      {error ? <ErrorState title="Research degraded" message={error} /> : null}

      <section className="rounded-lg border border-outline bg-surface-container p-standard shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold text-on-surface">Evidence Workbench</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">
              Compare the strongest observed candidates, then open a token dossier before acting. A score is a ranking signal, not a trade recommendation.
            </p>
          </div>
          <label className="flex h-10 w-full max-w-md items-center gap-2 rounded-sm border border-outline bg-surface px-3">
            <Search className="h-4 w-4 text-on-surface-variant" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter symbol, name, or address" className="w-full bg-transparent text-sm text-on-surface outline-none" />
          </label>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Candidates Reviewed" value={candidates.length} tone="primary" />
        <MetricCard label="Wallet-Evidenced" value={qualifiedCount} tone="success" />
        <MetricCard label="Known Risk" value={knownRiskCount} tone="warning" />
        <MetricCard label="Evidence Window" value="24H" detail="Refreshes every 15 seconds" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel title="Ranked Candidates" icon={<Radar className="h-4 w-4" />}>
          <div className="grid gap-3 p-standard md:grid-cols-2">
            {visible.length === 0 ? (
              <div className="rounded-sm border border-outline bg-surface px-4 py-10 text-center text-sm text-on-surface-variant md:col-span-2">No candidates match this filter.</div>
            ) : visible.map((candidate) => (
              <Link key={candidate.id} href={`/tokens/${candidate.tokenAddress}`} className="group rounded-lg border border-outline bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-surface-high">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-on-surface">${candidate.tokenSymbol}</p>
                    <p className="truncate text-xs text-on-surface-variant">{candidate.tokenName} · {shortAddress(candidate.tokenAddress)}</p>
                  </div>
                  <p className="font-mono text-xl text-primary">{candidate.signalScore}</p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-on-surface-variant">Liquidity</p><p className="mt-1 font-mono text-on-surface">{formatUsd(candidate.market?.liquidityUsd)}</p></div>
                  <div><p className="text-on-surface-variant">1H volume</p><p className="mt-1 font-mono text-on-surface">{formatUsd(candidate.market?.volume1hUsd)}</p></div>
                  <div><p className="text-on-surface-variant">Qualified</p><p className="mt-1 font-mono text-on-surface">{candidate.walletEvidence.qualifiedWalletCount}/{candidate.walletEvidence.walletCount}</p></div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={confidenceTone(candidate.confidence)}>{Math.round(candidate.confidence * 100)}% confidence</StatusBadge>
                    <StatusBadge tone={candidate.risk.rating === "low" ? "success" : candidate.risk.rating === "medium" ? "warning" : "default"}>Risk {candidate.risk.rating ?? "unknown"}</StatusBadge>
                  </div>
                  <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
                </div>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">Observed {formatRelative(candidate.detectedAt)}</p>
              </Link>
            ))}
          </div>
        </Panel>

        <aside className="space-y-4">
          <Panel title="Evidence Gate" icon={<CircleHelp className="h-4 w-4" />}>
            <div className="space-y-3 p-standard text-sm text-on-surface-variant">
              <p>Prefer candidates with fresh market data, known contract risk, qualified wallet evidence, and enough liquidity for the intended position size.</p>
              <p>Unknown risk or missing wallet evidence is uncertainty, not safety. Open the dossier and verify every factor.</p>
            </div>
          </Panel>
          <Link href="/wallets" className="flex items-center justify-between rounded-lg border border-outline bg-surface-container p-standard text-on-surface transition-colors hover:border-primary/50">
            <span><span className="block font-semibold">Wallet Intelligence</span><span className="mt-1 block text-sm text-on-surface-variant">Inspect tracked trader evidence</span></span>
            <Wallet className="h-5 w-5 text-primary" />
          </Link>
        </aside>
      </div>
    </div>
  );
}
