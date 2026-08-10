"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Clock3,
  RefreshCw,
  WifiOff,
} from "lucide-react";

type Tone = "default" | "primary" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  default: "border-outline bg-surface text-on-surface",
  primary: "border-primary/35 bg-primary-container/10 text-primary",
  success: "border-success/35 bg-success/10 text-success",
  warning: "border-warning/35 bg-warning/10 text-warning",
  danger: "border-destructive/35 bg-destructive/10 text-destructive",
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-lg border border-outline bg-[radial-gradient(circle_at_top_right,hsl(var(--primary-container)/0.14),transparent_38%),linear-gradient(135deg,hsl(var(--surface-high))_0%,hsl(var(--surface-lowest))_100%)] px-standard py-standard shadow-panel md:px-6 md:py-5">
      <div className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-on-surface md:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">{description}</p>
          {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function ActionLink({
  href,
  children,
  icon,
  tone = "default",
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors hover:border-primary/60 hover:text-primary ${toneClasses[tone]}`}
    >
      {icon}
      <span>{children}</span>
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

export function ModuleNotice({
  tone = "default",
  title,
  message,
  action,
}: {
  tone?: Tone;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "danger"
        ? WifiOff
        : tone === "warning"
          ? CircleAlert
          : CircleHelp;
  return (
    <div
      className={`flex flex-col gap-3 rounded-sm border px-4 py-3 sm:flex-row sm:items-start sm:justify-between ${toneClasses[tone]}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-5 text-on-surface-variant">{message}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
      <CircleHelp className="h-6 w-6 text-primary" />
      <p className="mt-3 font-semibold text-on-surface">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-5 text-on-surface-variant">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function FreshnessStamp({
  value,
  label = "Updated",
}: {
  value: string | null | undefined;
  label?: string;
}) {
  const time = value ? new Date(value) : null;
  const ageMinutes =
    time && !Number.isNaN(time.getTime())
      ? Math.max(0, Math.floor((Date.now() - time.getTime()) / 60_000))
      : null;
  const stale = ageMinutes === null || ageMinutes > 5;
  const display =
    ageMinutes === null
      ? "Unknown"
      : ageMinutes < 1
        ? "Now"
        : ageMinutes < 60
          ? `${ageMinutes}m ago`
          : `${Math.floor(ageMinutes / 60)}h ago`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${stale ? toneClasses.warning : toneClasses.success}`}
    >
      <Clock3 className="h-3 w-3" />
      {label} {display}
    </span>
  );
}

export function EvidenceBar({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | null | undefined;
  detail?: string;
}) {
  const percentage =
    value === null || value === undefined || Number.isNaN(value)
      ? 0
      : Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
  const tone = percentage >= 70 ? "bg-success" : percentage >= 40 ? "bg-warning" : "bg-destructive";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="text-on-surface-variant">{label}</span>
        <span className="font-mono text-on-surface">
          {value === null || value === undefined ? "n/a" : `${Math.round(percentage)}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-highest">
        <div className={`h-full ${tone}`} style={{ width: `${percentage}%` }} />
      </div>
      {detail ? (
        <p className="mt-1.5 text-[11px] leading-4 text-on-surface-variant">{detail}</p>
      ) : null}
    </div>
  );
}

export function RefreshButton({
  onClick,
  busy = false,
  label = "Refresh",
}: {
  onClick: () => void;
  busy?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-outline bg-surface px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface transition-colors hover:border-primary/60 hover:text-primary disabled:cursor-wait disabled:opacity-60"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
      {label}
    </button>
  );
}

export function FilterChip({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${active ? toneClasses.primary : toneClasses.default}`}
    >
      {children}
    </span>
  );
}
