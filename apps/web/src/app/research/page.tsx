"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useState } from "react";
import {
  ArrowRight,
  BookmarkPlus,
  GitCompareArrows,
  Radar,
  Search,
  ShieldCheck,
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
  FreshnessStamp,
  ModuleNotice,
  PageHeader,
  RefreshButton,
} from "@/components/workflow-ui";
import { API_BASE_URL } from "@/lib/api-url";

interface ResearchCandidate {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  signalScore: number;
  confidence: number;
  priority: string;
  detectedAt: string;
  dataFreshness: string;
  dataSource: string;
  risk: { score: number | null; rating: string | null };
  market: {
    liquidityUsd: number;
    volume1hUsd: number;
    marketCapUsd: number;
    priceChange1h: number;
  } | null;
  walletEvidence: { walletCount: number; qualifiedWalletCount: number; tradeCount: number };
}

function confidenceTone(confidence: number) {
  if (confidence >= 0.75) return "success" as const;
  if (confidence >= 0.55) return "warning" as const;
  return "default" as const;
}

export default function ResearchPage() {
  const [candidates, setCandidates] = useState<ResearchCandidate[]>([]);
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [evidenceFilter, setEvidenceFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("all");
  const [compareAddresses, setCompareAddresses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({
        timeframe: "24h",
        limit: "24",
        minScore: "0",
        sortBy: "signal_score",
        sortOrder: "desc",
      });
      const response = await fetch(`${API_BASE_URL}/api/v1/scanner?${params}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        data?: ResearchCandidate[];
        error?: string;
        timestamp?: string;
      };
      if (!response.ok || !payload.success || !payload.data)
        throw new Error(payload.error || "Research data is unavailable.");
      setCandidates(payload.data);
      setLastUpdatedAt(payload.timestamp ?? new Date().toISOString());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Research data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const visible = candidates.filter((candidate) => {
    const matchesQuery =
      !deferredQuery ||
      [candidate.tokenSymbol, candidate.tokenName, candidate.tokenAddress].some((value) =>
        value.toLowerCase().includes(deferredQuery),
      );
    const matchesRisk =
      riskFilter === "all" ||
      (riskFilter === "known"
        ? Boolean(candidate.risk.rating && candidate.risk.rating !== "unknown")
        : (candidate.risk.rating ?? "unknown") === riskFilter);
    const matchesEvidence =
      evidenceFilter === "all" ||
      (evidenceFilter === "wallets" && candidate.walletEvidence.walletCount > 0) ||
      (evidenceFilter === "qualified" && candidate.walletEvidence.qualifiedWalletCount > 0) ||
      (evidenceFilter === "missing" && candidate.walletEvidence.walletCount === 0);
    const matchesConfidence =
      confidenceFilter === "all" ||
      (confidenceFilter === "high" && candidate.confidence >= 0.75) ||
      (confidenceFilter === "medium" &&
        candidate.confidence >= 0.55 &&
        candidate.confidence < 0.75) ||
      (confidenceFilter === "low" && candidate.confidence < 0.55);
    return matchesQuery && matchesRisk && matchesEvidence && matchesConfidence;
  });
  const compared = compareAddresses
    .map((address) => candidates.find((candidate) => candidate.tokenAddress === address))
    .filter((candidate): candidate is ResearchCandidate => Boolean(candidate));
  const qualifiedCount = candidates.filter(
    (candidate) => candidate.walletEvidence.qualifiedWalletCount > 0,
  ).length;
  const knownRiskCount = candidates.filter(
    (candidate) => candidate.risk.rating && candidate.risk.rating !== "unknown",
  ).length;

  function toggleCompare(address: string) {
    setCompareAddresses((current) =>
      current.includes(address)
        ? current.filter((item) => item !== address)
        : current.length < 3
          ? [...current, address]
          : [...current.slice(1), address],
    );
  }

  if (loading && candidates.length === 0) return <LoadingRows rows={6} />;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Evidence workbench"
        title="Move from ranking to defensible conviction"
        description="Compare candidates using confidence, risk coverage, liquidity, and wallet evidence. Scores prioritize research; they are not trade recommendations."
        meta={
          <>
            <FreshnessStamp value={lastUpdatedAt} label="Evidence" />
            <StatusBadge tone="primary">24h evidence window</StatusBadge>
          </>
        }
        actions={
          <>
            <ActionLink href="/scanner" icon={<Radar className="h-3.5 w-3.5" />}>
              Refine scanner
            </ActionLink>
            <ActionLink href="/wallets" icon={<Wallet className="h-3.5 w-3.5" />}>
              Wallet intelligence
            </ActionLink>
          </>
        }
      />

      {error ? (
        <ModuleNotice
          tone="warning"
          title="Research refresh degraded"
          message={`${error} The last successful evidence set remains visible.`}
          action={<RefreshButton onClick={() => void load()} busy={loading} />}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Candidates" value={candidates.length} tone="primary" />
        <MetricCard
          label="Qualified Wallet Evidence"
          value={qualifiedCount}
          tone={qualifiedCount ? "success" : "default"}
        />
        <MetricCard
          label="Known Risk"
          value={knownRiskCount}
          tone={knownRiskCount ? "warning" : "default"}
        />
        <MetricCard
          label="Compared"
          value={`${compared.length}/3`}
          detail="Select candidates below"
        />
      </div>

      <Panel title="Research Filters" icon={<Search className="h-4 w-4" />}>
        <div className="grid gap-3 p-standard sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_190px_180px_auto]">
          <label className="flex h-10 items-center gap-2 rounded-sm border border-outline bg-surface px-3">
            <Search className="h-4 w-4 text-on-surface-variant" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Symbol, name, or address"
              className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant"
            />
          </label>
          <AegisSelect
            label="Risk"
            value={riskFilter}
            onChange={setRiskFilter}
            options={[
              { label: "Any risk", value: "all" },
              { label: "Known risk", value: "known" },
              { label: "Low", value: "low" },
              { label: "Medium", value: "medium" },
              { label: "High", value: "high" },
              { label: "Unknown", value: "unknown" },
            ]}
          />
          <AegisSelect
            label="Wallet evidence"
            value={evidenceFilter}
            onChange={setEvidenceFilter}
            options={[
              { label: "Any evidence", value: "all" },
              { label: "Has wallets", value: "wallets" },
              { label: "Has qualified", value: "qualified" },
              { label: "Missing wallets", value: "missing" },
            ]}
          />
          <AegisSelect
            label="Confidence"
            value={confidenceFilter}
            onChange={setConfidenceFilter}
            options={[
              { label: "Any confidence", value: "all" },
              { label: "High 75%+", value: "high" },
              { label: "Medium 55-74%", value: "medium" },
              { label: "Low under 55%", value: "low" },
            ]}
          />
          <RefreshButton onClick={() => void load()} busy={loading} />
        </div>
      </Panel>

      {compared.length ? (
        <Panel
          title="Candidate Comparison"
          eyebrow="Side-by-side evidence"
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
          <div className="grid gap-3 p-standard md:grid-cols-2 xl:grid-cols-3">
            {compared.map((candidate) => (
              <div
                key={candidate.tokenAddress}
                className="rounded-sm border border-outline bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/tokens/${candidate.tokenAddress}`}
                      className="font-semibold text-on-surface hover:text-primary"
                    >
                      ${candidate.tokenSymbol}
                    </Link>
                    <p className="mt-1 font-mono text-[10px] text-on-surface-variant">
                      {shortAddress(candidate.tokenAddress)}
                    </p>
                  </div>
                  <span className={`font-mono text-xl ${scoreTone(candidate.signalScore)}`}>
                    {candidate.signalScore}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  <EvidenceBar label="Confidence" value={candidate.confidence} />
                  <EvidenceBar
                    label="Wallet coverage"
                    value={
                      candidate.walletEvidence.walletCount
                        ? Math.min(
                            100,
                            (candidate.walletEvidence.qualifiedWalletCount /
                              candidate.walletEvidence.walletCount) *
                              100,
                          )
                        : 0
                    }
                    detail={`${candidate.walletEvidence.qualifiedWalletCount}/${candidate.walletEvidence.walletCount} qualified`}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-on-surface-variant">Liquidity</p>
                    <p className="mt-1 font-mono text-on-surface">
                      {formatUsd(candidate.market?.liquidityUsd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant">Risk</p>
                    <p className="mt-1 font-mono uppercase text-on-surface">
                      {candidate.risk.rating ?? "unknown"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="Ranked Candidates"
          eyebrow={`${visible.length} matching`}
          icon={<Radar className="h-4 w-4" />}
        >
          <div className="grid gap-3 p-standard md:grid-cols-2">
            {visible.length === 0 ? (
              <div className="md:col-span-2">
                <EmptyState
                  title="No candidates match"
                  message="Relax one or more evidence filters or return to Scanner to broaden discovery."
                />
              </div>
            ) : (
              visible.map((candidate) => {
                const comparing = compareAddresses.includes(candidate.tokenAddress);
                return (
                  <article
                    key={candidate.id}
                    className={`rounded-lg border bg-surface p-4 transition-colors ${comparing ? "border-primary/60" : "border-outline hover:border-primary/40"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/tokens/${candidate.tokenAddress}`}
                          className="truncate text-lg font-semibold text-on-surface hover:text-primary"
                        >
                          ${candidate.tokenSymbol}
                        </Link>
                        <p className="truncate text-xs text-on-surface-variant">
                          {candidate.tokenName} · {shortAddress(candidate.tokenAddress)}
                        </p>
                      </div>
                      <p className={`font-mono text-xl ${scoreTone(candidate.signalScore)}`}>
                        {candidate.signalScore}
                      </p>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-on-surface-variant">Liquidity</p>
                        <p className="mt-1 font-mono text-on-surface">
                          {formatUsd(candidate.market?.liquidityUsd)}
                        </p>
                      </div>
                      <div>
                        <p className="text-on-surface-variant">1H volume</p>
                        <p className="mt-1 font-mono text-on-surface">
                          {formatUsd(candidate.market?.volume1hUsd)}
                        </p>
                      </div>
                      <div>
                        <p className="text-on-surface-variant">Qualified</p>
                        <p className="mt-1 font-mono text-on-surface">
                          {candidate.walletEvidence.qualifiedWalletCount}/
                          {candidate.walletEvidence.walletCount}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <StatusBadge tone={confidenceTone(candidate.confidence)}>
                        {Math.round(candidate.confidence * 100)}% confidence
                      </StatusBadge>
                      <StatusBadge
                        tone={
                          candidate.risk.rating === "low"
                            ? "success"
                            : candidate.risk.rating === "medium"
                              ? "warning"
                              : candidate.risk.rating === "high"
                                ? "danger"
                                : "default"
                        }
                      >
                        Risk {candidate.risk.rating ?? "unknown"}
                      </StatusBadge>
                    </div>
                    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                      {candidate.dataSource} ·{" "}
                      {formatRelative(candidate.dataFreshness || candidate.detectedAt)}
                    </p>
                    <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
                      <Link
                        href={`/tokens/${candidate.tokenAddress}`}
                        className="flex min-h-9 items-center justify-center gap-2 rounded-sm border border-primary/30 bg-primary-container/10 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-primary"
                      >
                        Open dossier <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleCompare(candidate.tokenAddress)}
                        title="Compare candidate"
                        aria-label={`Compare ${candidate.tokenSymbol}`}
                        className={`rounded-sm border p-2 ${comparing ? "border-primary bg-primary-container/20 text-primary" : "border-outline text-on-surface-variant hover:text-primary"}`}
                      >
                        <GitCompareArrows className="h-4 w-4" />
                      </button>
                      <Link
                        href={`/watchlists?type=token&address=${candidate.tokenAddress}&note=${encodeURIComponent(`Research score ${candidate.signalScore}`)}`}
                        title="Add to watchlist"
                        aria-label={`Watch ${candidate.tokenSymbol}`}
                        className="rounded-sm border border-outline p-2 text-on-surface-variant hover:text-primary"
                      >
                        <BookmarkPlus className="h-4 w-4" />
                      </Link>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </Panel>

        <aside className="space-y-4">
          <Panel title="Evidence Gate" icon={<ShieldCheck className="h-4 w-4" />}>
            <div className="space-y-3 p-standard text-sm text-on-surface-variant">
              <p>
                Prefer fresh market data, known risk, qualified wallet evidence, and liquidity
                appropriate for the intended position.
              </p>
              <p>
                Unknown risk and missing wallet evidence are uncertainty, not safety. The token
                dossier explains the factors available.
              </p>
            </div>
          </Panel>
          <ModuleNotice
            tone="warning"
            title="No trading shortcut"
            message="Research must hand off into a watchlist, alert, or strategy proof. Phase 3 execution remains locked until the evidence gate passes."
          />
        </aside>
      </div>
    </div>
  );
}
