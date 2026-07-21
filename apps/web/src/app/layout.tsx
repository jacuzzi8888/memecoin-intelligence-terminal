import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Memecoin Intelligence Terminal",
  description: "Solana Memecoin Intelligence Scanner and Trading Terminal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <div className="relative flex min-h-screen flex-col">
          <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 items-center px-4 md:px-6">
              <nav className="flex items-center space-x-4 lg:space-x-6">
                <a href="/" className="flex items-center space-x-2">
                  <span className="text-lg font-bold">MIT</span>
                </a>
                <a href="/dashboard" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Dashboard</a>
                <a href="/scanner" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Scanner</a>
                <a href="/alerts" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Alerts</a>
                <a href="/wallets" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Wallets</a>
                <a href="/terminal" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Terminal</a>
              </nav>
              <div className="ml-auto flex items-center space-x-4">
                <a href="/settings" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Settings</a>
              </div>
            </div>
          </header>
          <main className="flex-1">
            <div className="container px-4 py-6 md:px-6">{children}</div>
          </main>
          <footer className="border-t py-4">
            <div className="container flex items-center justify-between px-4 md:px-6">
              <p className="text-xs text-muted-foreground">Memecoin Intelligence Terminal v0.1.0 - Foundation Phase</p>
              <p className="text-xs text-muted-foreground">No real trades executed. Development data only.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
