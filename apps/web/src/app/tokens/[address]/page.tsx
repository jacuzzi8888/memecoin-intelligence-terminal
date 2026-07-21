"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function TokenPage() {
  const params = useParams();
  const address = params.address as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchToken() {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const res = await fetch(`${apiUrl}/api/v1/tokens/${address}`);
        const json: any = await res.json();
        if (json.success) setData(json.data);
      } catch { /* API may not be running */ } finally { setLoading(false); }
    }
    fetchToken();
  }, [address]);

  if (loading) return <div className="space-y-4"><div className="h-8 w-48 animate-pulse rounded bg-muted" /><div className="h-64 animate-pulse rounded-lg border bg-muted" /></div>;

  if (!data) return <div className="flex flex-col items-center justify-center py-12"><p className="text-lg font-medium">Token not found</p><p className="text-sm text-muted-foreground font-mono">{address}</p></div>;

  const token = data.token;
  const market = data.market;
  const launch = data.launch;
  const intel = data.intelligence;

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{token.symbol} - {token.name}</h1>
        <p className="text-sm text-muted-foreground font-mono">{address}</p>
      </div>

      {market && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Market Cap</p><p className="text-xl font-bold">${Number(market.marketCapUsd).toLocaleString()}</p></div>
          <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Liquidity</p><p className="text-xl font-bold">${Number(market.liquidityUsd).toLocaleString()}</p></div>
          <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Volume (1h)</p><p className="text-xl font-bold">${Number(market.volume1hUsd).toLocaleString()}</p></div>
          <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Holders</p><p className="text-xl font-bold">{market.holderCount}</p></div>
        </div>
      )}

      {intel && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-xl font-semibold">Intelligence Score</h2>
          <div className="flex items-center gap-6">
            <div className={`text-4xl font-bold ${intel.score >= 80 ? "text-success" : intel.score >= 60 ? "text-warning" : "text-muted-foreground"}`}>
              {intel.score}/100
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Confidence: {(intel.confidence * 100).toFixed(0)}%</p>
              <p className="text-sm text-muted-foreground">Ruleset: {intel.rulesetVersion}</p>
              <p className="text-sm text-muted-foreground">Priority: {intel.priority}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 font-medium text-success">Positive Factors</h3>
              {(intel.positiveFactors || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">None</p>
              ) : (
                <ul className="space-y-1">
                  {intel.positiveFactors.map((f: any, i: number) => (
                    <li key={i} className="text-sm">{f.factorName}: +{Number(f.contribution).toFixed(1)}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 font-medium text-destructive">Risk Factors</h3>
              {(intel.negativeFactors || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">None</p>
              ) : (
                <ul className="space-y-1">
                  {intel.negativeFactors.map((f: any, i: number) => (
                    <li key={i} className="text-sm">{f.factorName}: {Number(f.contribution).toFixed(1)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {launch && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-2 font-semibold">Launch Information</h2>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Deployer</span><span className="font-mono">{launch.deployerAddress.slice(0, 12)}...</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Launched</span><span>{new Date(launch.launchedAt).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Initial Liquidity</span><span>${Number(launch.initialLiquidityUsd).toLocaleString()}</span></div>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs text-muted-foreground">Data Source: {data.dataSource} | Freshness: {new Date(data.dataFreshness).toLocaleString()}</p>
      </div>
    </div>
  );
}
