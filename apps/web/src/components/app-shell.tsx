"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  BellRing,
  Bot,
  Command,
  LayoutDashboard,
  Network,
  Radar,
  Search,
  Settings,
  Shield,
  TerminalSquare,
  Wallet,
  Waypoints,
  Eye,
  FlaskConical,
  MoreHorizontal,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api-url";

interface SystemStatus {
  pendingAlerts: number;
  dataFreshness?: {
    latestSnapshotAt: string | null;
    latestSignalAt: string | null;
  };
  queues: Record<string, { waiting: number; active: number; failed: number; deadLetter: number; available?: boolean }>;
}

const desktopNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: /^\/dashboard$/ },
  { href: "/scanner", label: "Scanner", icon: Radar, match: /^\/scanner$/ },
  { href: "/alerts", label: "Alerts", icon: BellRing, match: /^\/alerts$/ },
  { href: "/research", label: "Research", icon: Search, match: /^\/(research|tokens\/)/ },
  { href: "/wallets", label: "Wallets", icon: Wallet, match: /^\/wallets$/ },
  { href: "/watchlists", label: "Watchlists", icon: Eye, match: /^\/watchlists$/ },
  { href: "/strategies", label: "Strategies", icon: FlaskConical, match: /^\/strategies$/ },
  { href: "/terminal", label: "Terminal", icon: TerminalSquare, match: /^\/terminal$/ },
];

const mobileNavItems = [
  { href: "/dashboard", label: "Dash", icon: LayoutDashboard, match: /^\/dashboard$/ },
  { href: "/scanner", label: "Scanner", icon: Radar, match: /^\/scanner$/ },
  { href: "/alerts", label: "Alerts", icon: BellRing, match: /^\/alerts$/ },
  { href: "/terminal", label: "Terminal", icon: TerminalSquare, match: /^\/terminal$/ },
];

const mobileMoreItems = [
  { href: "/research", label: "Research", icon: Search, match: /^\/(research|tokens\/)/ },
  { href: "/wallets", label: "Wallets", icon: Wallet, match: /^\/wallets$/ },
  { href: "/watchlists", label: "Watchlists", icon: Eye, match: /^\/watchlists$/ },
  { href: "/strategies", label: "Strategies", icon: FlaskConical, match: /^\/strategies$/ },
  { href: "/settings", label: "Settings", icon: Settings, match: /^\/settings$/ },
];

function isActive(pathname: string, pattern: RegExp) {
  return pattern.test(pathname);
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "group flex items-center gap-3 rounded-sm px-3 py-2 transition-colors",
        active
          ? "border-r-2 border-primary bg-surface-container text-primary"
          : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
      ].join(" ")}
    >
      <Icon className={["h-[18px] w-[18px]", active ? "text-primary" : "group-hover:text-primary"].join(" ")} />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [statusOnline, setStatusOnline] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/status`, { cache: "no-store" });
        const payload = await response.json() as { success?: boolean; data?: SystemStatus };
        if (active && response.ok && payload.success && payload.data) {
          setStatus(payload.data);
          setStatusOnline(true);
        } else if (active) {
          setStatusOnline(false);
        }
      } catch {
        if (active) setStatusOnline(false);
      }
    };
    void fetchStatus();
    const timer = window.setInterval(fetchStatus, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const latestDataAt = status?.dataFreshness?.latestSnapshotAt || status?.dataFreshness?.latestSignalAt;
  const latestDataAgeSeconds = latestDataAt ? Math.max(0, Math.floor((Date.now() - new Date(latestDataAt).getTime()) / 1000)) : null;
  const dataFresh = latestDataAgeSeconds !== null && latestDataAgeSeconds <= 120;
  const deadLetters = status ? Object.values(status.queues).reduce((total, queue) => total + queue.deadLetter, 0) : 0;
  const queuesAvailable = status ? Object.values(status.queues).every((queue) => queue.available !== false) : false;
  const systemState = !statusOnline ? "Offline" : dataFresh && deadLetters === 0 && queuesAvailable ? "Live" : "Degraded";
  const stateTone = systemState === "Live" ? "text-success" : systemState === "Degraded" ? "text-warning" : "text-destructive";

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query)) {
      router.push(`/tokens/${encodeURIComponent(query)}`);
    } else {
      router.push(`/scanner?search=${encodeURIComponent(query)}`);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-sidebar border-r border-outline bg-surface px-dense py-standard lg:flex lg:flex-col">
        <div className="mb-8 px-standard">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary-container text-primary-foreground">
              <TerminalSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="font-sans text-lg font-bold tracking-tight text-primary">AEGIS TERMINAL</p>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">
                Institutional Grade
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-dense">
          {desktopNavItems.map((item) => (
            <NavLink
              key={item.label}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(pathname, item.match)}
            />
          ))}
        </nav>

        <div className="mt-4 border-t border-outline px-dense pt-4">
          <NavLink
            href="/settings"
            label="Settings"
            icon={Settings}
            active={isActive(pathname, /^\/settings$/)}
          />

          <div className="mt-4 flex items-center gap-3 px-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-outline bg-surface-container-high text-primary">
              <Shield className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-on-surface">Trader_Alpha</p>
              <p className="flex items-center gap-1 font-mono text-[11px] text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Online
              </p>
            </div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-outline bg-surface/95 backdrop-blur lg:ml-sidebar">
        <div className="flex h-topbar items-center justify-between gap-4 px-standard md:px-grid">
          <div className="hidden items-center gap-5 lg:flex">
            <div className="flex items-center gap-2 font-mono text-[13px] text-on-surface-variant">
              <Waypoints className={`h-4 w-4 ${stateTone}`} />
              <span>
                State: <span className={`font-semibold ${stateTone}`}>{systemState}</span>
              </span>
            </div>
            <div className="h-4 w-px bg-outline" />
            <div className="font-mono text-[13px] text-on-surface-variant">
              Data age: <span className="text-on-surface">{latestDataAgeSeconds === null ? "--" : `${latestDataAgeSeconds}s`}</span>
            </div>
            <div className="h-4 w-px bg-outline" />
            <div className="font-mono text-[13px] text-on-surface-variant">
              Pending: <span className="text-on-surface">{status?.pendingAlerts ?? "--"}</span>
              {deadLetters > 0 ? (
                <>
                  {" / "}DLQ: <span className="text-warning">{deadLetters}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3 lg:ml-auto">
            <form onSubmit={submitSearch} role="search" className="hidden h-9 w-[280px] items-center gap-2 rounded-sm border border-outline bg-surface-container px-3 lg:flex">
              <Search className="h-4 w-4 text-on-surface-variant" />
              <input
                id="global-search"
                aria-label="Search"
                placeholder="Search tokens, wallets, rules..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60"
              />
              <div className="flex items-center gap-1 font-mono text-[11px] text-on-surface-variant/80">
                <Command className="h-3.5 w-3.5" />
                K
              </div>
            </form>

            <Link href="/terminal" aria-label="Open terminal" title="Terminal" className="rounded-sm p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface">
              <Bot className="h-4 w-4" />
            </Link>
            <Link href="/settings" aria-label="Open personal access settings" title="Personal access" className="rounded-sm p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface">
              <Shield className="h-4 w-4" />
            </Link>
            <Link href="/dashboard" aria-label="Open system status" title="System status" className={`rounded-sm p-2 transition-colors hover:bg-surface-container ${stateTone}`}>
              <Network className="h-4 w-4" />
            </Link>

            <div className="h-6 w-px bg-outline" />

            <div className="flex items-center gap-2 rounded-sm border border-primary-container/50 bg-primary-container/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
              <span className={`h-2 w-2 rounded-full ${statusOnline ? "bg-success" : "bg-destructive"}`} />
              Mainnet
            </div>
          </div>
        </div>
      </header>

      <main className="pb-[88px] lg:ml-sidebar lg:pb-10">
        <div className="min-h-[calc(100vh-96px)] px-standard py-standard md:px-grid">{children}</div>
      </main>

      <footer className="fixed inset-x-0 bottom-16 z-30 border-t border-outline bg-surface-lowest/95 backdrop-blur lg:bottom-0 lg:left-sidebar">
        <div className="flex h-8 items-center justify-between px-standard md:px-grid">
          <div className={`flex items-center gap-2 font-mono text-[12px] ${stateTone}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusOnline ? (dataFresh ? "bg-success" : "bg-warning") : "bg-destructive"}`} />
            <span className="hidden sm:inline">System: {systemState} | Data: {latestDataAgeSeconds === null ? "unavailable" : `${latestDataAgeSeconds}s old`} | Chain: SOL-Mainnet</span>
            <span className="sm:hidden">System {systemState}</span>
          </div>
          <div className="hidden items-center gap-4 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant sm:flex">
            <span>Logs</span>
            <span>Transactions</span>
            <span>Network Status</span>
          </div>
        </div>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-outline bg-surface-container lg:hidden">
        {mobileMoreOpen && (
          <div className="absolute bottom-16 right-2 w-52 rounded-sm border border-outline bg-surface-container-high p-2 shadow-panel-strong">
            {mobileMoreItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileMoreOpen(false)}
                  className={[
                    "flex items-center gap-3 rounded-sm px-3 py-3 text-sm transition-colors",
                    isActive(pathname, item.match) ? "bg-primary-container/15 text-primary" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
        <div className="grid h-16 grid-cols-5">
          {mobileNavItems.map((item) => {
            const active = isActive(pathname, item.match);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={[
                  "flex flex-col items-center justify-center gap-1 transition-colors",
                  active ? "text-primary" : "text-on-surface-variant",
                ].join(" ")}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em]">{item.label}</span>
              </Link>
              );
            })}
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={mobileMoreOpen}
            onClick={() => setMobileMoreOpen((open) => !open)}
            className={[
              "flex flex-col items-center justify-center gap-1 transition-colors",
              mobileMoreOpen || mobileMoreItems.some((item) => isActive(pathname, item.match)) ? "text-primary" : "text-on-surface-variant",
            ].join(" ")}
          >
            <MoreHorizontal className="h-[18px] w-[18px]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
