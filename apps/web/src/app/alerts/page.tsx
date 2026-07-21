"use client";
import { useEffect, useState } from "react";

interface AlertData {
  id: string;
  title: string;
  priority: string;
  signalScore: number;
  status: string;
  triggeredAt: string;
  tokenAddress: string;
  webDeepLink: string;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    fetch(`${apiUrl}/api/v1/alerts?limit=50`).then(r => r.json()).then((d: any) => { if (d.success) setAlerts(d.data); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4"><h1 className="text-3xl font-bold tracking-tight">Alerts</h1>{[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted" />)}</div>;

  return (
    <div className="flex flex-col space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Alerts</h1><p className="text-muted-foreground">Signal alerts and delivery status</p></div>
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-12"><p className="text-lg font-medium">No alerts yet</p><p className="text-sm text-muted-foreground">Alerts will appear here when signals are generated.</p></div>
      ) : (
        <div className="space-y-3">
          {alerts.map(a => (
            <div key={a.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${a.priority === "critical" ? "bg-destructive/10 text-destructive" : a.priority === "high" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"}`}>{a.priority}</span>
                    <p className="font-medium">{a.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground font-mono">{a.tokenAddress.slice(0, 16)}...</p>
                  <p className="mt-1 text-xs text-muted-foreground">Score: {a.signalScore} | Status: {a.status} | {new Date(a.triggeredAt).toLocaleString()}</p>
                </div>
                {a.webDeepLink && <a href={a.webDeepLink} className="text-sm text-primary hover:underline">View Token</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
