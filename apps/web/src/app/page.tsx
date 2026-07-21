export default function Home() {
  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Memecoin Intelligence Terminal</h1>
        <p className="text-muted-foreground">Solana memecoin intelligence scanner and trading terminal</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <a href="/dashboard" className="rounded-lg border bg-card p-6 shadow-sm transition-colors hover:bg-accent">
          <h3 className="font-semibold">Dashboard</h3>
          <p className="text-sm text-muted-foreground">System status and overview</p>
        </a>
        <a href="/scanner" className="rounded-lg border bg-card p-6 shadow-sm transition-colors hover:bg-accent">
          <h3 className="font-semibold">Scanner</h3>
          <p className="text-sm text-muted-foreground">Real-time token signals</p>
        </a>
        <a href="/alerts" className="rounded-lg border bg-card p-6 shadow-sm transition-colors hover:bg-accent">
          <h3 className="font-semibold">Alerts</h3>
          <p className="text-sm text-muted-foreground">Recent signals and notifications</p>
        </a>
        <a href="/terminal" className="rounded-lg border bg-card p-6 shadow-sm transition-colors hover:bg-accent">
          <h3 className="font-semibold">Terminal</h3>
          <p className="text-sm text-muted-foreground">Trading interface (read-only)</p>
        </a>
      </div>
    </div>
  );
}
