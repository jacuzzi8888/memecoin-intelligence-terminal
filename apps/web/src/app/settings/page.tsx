export default function SettingsPage() {
  return (
    <div className="flex flex-col space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Settings</h1><p className="text-muted-foreground">User preferences and configuration</p></div>
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div><h2 className="font-semibold">Notification Settings</h2><p className="text-sm text-muted-foreground">Configure alert delivery channels and preferences.</p></div>
        <div><h2 className="font-semibold">Trading Settings</h2><p className="text-sm text-muted-foreground">Slippage tolerance, priority fees, and trading preferences.</p></div>
        <div><h2 className="font-semibold">Display Settings</h2><p className="text-sm text-muted-foreground">Theme, density, and display preferences.</p></div>
        <div className="rounded-md border bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Settings will be fully configurable in Phase 2.</p></div>
      </div>
    </div>
  );
}