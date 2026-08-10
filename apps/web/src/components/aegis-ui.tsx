"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Check, Clock3 } from "lucide-react";

export function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 1 : 2,
  }).format(value);
}

export function formatTokenPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  if (value === 0) return "$0";
  if (Math.abs(value) >= 0.01) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  return `$${value.toLocaleString("en-US", { minimumSignificantDigits: 2, maximumSignificantDigits: 6 })}`;
}

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatRelative(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const diffMin = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

export function shortAddress(value: string | null | undefined, left = 6, right = 4) {
  if (!value) return "n/a";
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

export function scoreTone(score: number | null | undefined) {
  if ((score ?? 0) >= 80) return "text-success";
  if ((score ?? 0) >= 60) return "text-warning";
  return "text-on-surface-variant";
}

export function priorityTone(priority: string | null | undefined) {
  const value = (priority ?? "").toLowerCase();
  if (value === "critical") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (value === "high") return "border-warning/40 bg-warning/10 text-warning";
  if (value === "medium") return "border-primary/35 bg-primary-container/10 text-primary";
  return "border-outline bg-surface text-on-surface-variant";
}

export function Panel({
  title,
  eyebrow,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-lg border border-outline bg-surface-container shadow-panel ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-outline bg-surface-high px-standard py-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? <span className="shrink-0 text-primary">{icon}</span> : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">{eyebrow}</p>
            ) : null}
            <h2 className="truncate text-base font-semibold text-on-surface">{title}</h2>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger" | "stale";
}) {
  const toneClass = {
    default: "text-on-surface",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    stale: "text-stale",
  }[tone];

  return (
    <div className="rounded-sm border border-outline bg-surface px-3 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">{label}</p>
      <p className={`mt-2 font-mono text-xl tabular-nums ${toneClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-on-surface-variant">{detail}</p> : null}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger" | "stale";
}) {
  const toneClass = {
    default: "border-outline bg-surface text-on-surface-variant",
    primary: "border-primary/35 bg-primary-container/10 text-primary",
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    danger: "border-destructive/35 bg-destructive/10 text-destructive",
    stale: "border-stale/35 bg-stale/10 text-stale",
  }[tone];

  return (
    <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${toneClass}`}>
      {children}
    </span>
  );
}

export function AegisSelect({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={`relative min-w-[160px] ${className}`}>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="group flex h-10 w-full items-center justify-between gap-3 rounded-sm border border-outline bg-[linear-gradient(135deg,hsl(var(--surface-container))_0%,hsl(var(--surface-lowest))_100%)] px-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-primary/50"
      >
        <span className="min-w-0">
          <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant">{label}</span>
          <span className="block truncate font-mono text-[12px] uppercase tracking-[0.12em] text-on-surface">
            {selected?.label ?? "Select"}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-primary transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-labelledby={id}
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[180px] overflow-hidden rounded-sm border border-primary/30 bg-surface-lowest shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value || "empty-option"}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center justify-between gap-3 border-b border-outline/50 px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.12em] transition-colors last:border-b-0",
                  active ? "bg-primary-container/20 text-primary" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                ].join(" ")}
              >
                <span className="truncate">{option.label}</span>
                {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-lg border border-outline bg-surface-container" />
      ))}
    </div>
  );
}

export function ErrorState({ title = "Surface degraded", message }: { title?: string; message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
      <div>
        <p className="font-semibold text-destructive">{title}</p>
        <p className="text-on-surface-variant">{message}</p>
      </div>
    </div>
  );
}

export function StaleBlock({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-stale/40 bg-stale/10 px-4 py-4">
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 h-4 w-4 text-stale" />
        <div>
          <p className="font-semibold text-stale">{title}</p>
          <p className="mt-1 text-sm text-on-surface-variant">{message}</p>
        </div>
      </div>
    </div>
  );
}
