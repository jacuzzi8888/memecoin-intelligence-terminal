export default function TerminalPage() {
  return (
    <div className="flex flex-col space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Trading Terminal</h1><p className="text-muted-foreground">Non-custodial swap execution</p></div>
      <div className="rounded-lg border-2 border-dashed border-warning/50 bg-warning/5 p-6">
        <p className="font-medium text-warning">Execution Unavailable</p>
        <p className="mt-1 text-sm text-muted-foreground">Trading is not available during the foundation phase. This is a read-only shell demonstrating the planned interface.</p>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <div className="space-y-4">
          <div><label className="text-sm font-medium">Token Address</label><input type="text" placeholder="Enter token address..." className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" disabled /></div>
          <div className="flex gap-2"><button className="rounded-md bg-primary/20 px-4 py-2 text-sm font-medium text-primary" disabled>Buy</button><button className="rounded-md border px-4 py-2 text-sm font-medium" disabled>Sell</button></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="text-sm font-medium">Amount</label><input type="number" placeholder="0.00" className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" disabled /></div>
            <div><label className="text-sm font-medium">Slippage (%)</label><input type="number" placeholder="1.0" className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" disabled /></div>
          </div>
          <div className="rounded-md border bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Quote: Connect wallet and enable trading to see quotes</p></div>
          <div className="rounded-md border bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Simulation: Transactions will be simulated before submission</p></div>
          <button className="w-full rounded-md bg-muted px-4 py-3 text-sm font-medium text-muted-foreground cursor-not-allowed" disabled>Execute Trade (Unavailable)</button>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Wallet Connection: Not connected. Install Phantom or another Solana wallet to trade.</p></div>
        </div>
      </div>
    </div>
  );
}