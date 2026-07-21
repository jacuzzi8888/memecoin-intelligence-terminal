"use client";

import { useEffect, useState } from "react";

interface StatusData {
  tokens: number;
  signals: number;
  alerts: number;
  wallets: number;
  environment: string;
  version: string;
}

interface SignalItem {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  signalScore: number;
  priority: string;
  detectedAt: string;
}

interface AlertItem {
  id: string;
  tokenAddress: string;
  priority: string;
  title: string;
  signalScore: number;
  status: string;
  triggeredAt: string;
}

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const [statusRes, signalsRes, alertsRes] = await Promise.all([
          fetch(`${apiUrl}/api/v1/status`),
          fetch(`${apiUrl}/api/v1/scanner?limit=5`),
          fetch(`${apiUrl}/api/v1/alerts?limit=5`),
        ]);
        const statusData: any = await statusRes.json();
        const signalsData: any = await signalsRes.json();
        const alertsData: any = await alertsRes.json();
        if (statusData.success) setStatus(statusData.data);
        if (signalsData.success) setSignals(signalsData.data);
        if (alertsData.success) setAlerts(alertsData.data);
      } catch {
        // API may not be running in static mode
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">System overview and recent activity</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm font-medium text-muted-foreground">Tokens Indexed</p>
          <p className="text-2xl font-bold">{status?.tokens ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm font-medium text-muted-foreground">Signals Generated</p>
          <p className="text-2xl font-bold">{status?.signals ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm font-medium text-muted-foreground">Alerts Created</p>
          <p className="text-2xl font-bold">{status?.alerts ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm font-medium text-muted-foreground">Wallets Tracked</p>
          <p className="text-2xl font-bold">{status?.wallets ?? 0}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card">
          <div className="border-b p-4">
            <h2 className="font-semibold">Recent Signals</h2>
          </div>
          <div className="p-4">
            {signals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No signals yet. Run the ingestion pipeline to generate data.</p>
            ) : (
              <div className="space-y-2">
                {signals.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium">{s.tokenSymbol}</p>
                      <p className="text-xs text-muted-foreground font-mono">{s.tokenAddress.slice(0, 12)}...</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${s.signalScore >= 80 ? "text-success" : s.signalScore >= 60 ? "text-warning" : "text-muted-foreground"}`}>
                        {s.signalScore}/100
                      </p>
                      <p className="text-xs text-muted-foreground">{s.priority}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="border-b p-4">
            <h2 className="font-semibold">Recent Alerts</h2>
          </div>
          <div className="p-4">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts yet.</p>
            ) : (
              <div className="space-y-2">
                {alerts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.status}</p>
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      a.priority === "critical" ? "bg-destructive/10 text-destructive" :
                      a.priority === "high" ? "bg-warning/10 text-warning" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {a.priority}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 font-semibold">System Status</h2>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Environment</span><span>{status?.environment || "development"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span>{status?.version || "0.1.0"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Database</span><span className="text-success">Connected</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Data Source</span><span>Development (mock)</span></div>
        </div>
      </div>
    </div>
  );
}
