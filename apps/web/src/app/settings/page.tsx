"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Code2, KeyRound, Lock, LockOpen, Plus, Settings, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { AegisSelect, ErrorState, LoadingRows, MetricCard, Panel, StatusBadge } from "@/components/aegis-ui";
import { API_BASE_URL } from "@/lib/api-url";
import {
  apiFetch,
  clearPersonalWriteKey,
  getPersonalWriteKey,
  setPersonalWriteKey,
  verifyPersonalWriteKey,
} from "@/lib/api-client";

interface StrategyVersion {
  id: string;
  version: string;
  isActive: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}

interface Strategy {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  currentVersion: string;
  versions: StrategyVersion[];
}

interface Destination {
  id: string;
  channel: string;
  destination: string;
  enabled: boolean;
  priorityMin: string;
}

interface SettingsPayload {
  settings: {
    preferences: Record<string, unknown>;
    notificationPrefs: Record<string, unknown>;
    displayPrefs: Record<string, unknown>;
    tradingPrefs: Record<string, unknown>;
  };
  destinations: Destination[];
  strategies: Strategy[];
}

export default function SettingsPage() {
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState("{}");
  const [tradingPrefs, setTradingPrefs] = useState("{}");
  const [destinationChannel, setDestinationChannel] = useState("telegram");
  const [destinationValue, setDestinationValue] = useState("");
  const [destinationPriority, setDestinationPriority] = useState("medium");
  const [strategyName, setStrategyName] = useState("");
  const [strategyConfig, setStrategyConfig] = useState("{\n  \"minScore\": 70,\n  \"maxAgeMinutes\": 30,\n  \"minLiquidityUsd\": 15000\n}");
  const [writeKey, setWriteKey] = useState("");
  const [writeUnlocked, setWriteUnlocked] = useState(false);
  const [checkingWriteKey, setCheckingWriteKey] = useState(false);
  const apiUrl = API_BASE_URL;

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${apiUrl}/api/v1/settings`, { cache: "no-store" });
      const data: { success?: boolean; data?: SettingsPayload; error?: string } = await response.json();
      if (!data.success || !data.data) throw new Error(data.error || "Failed to load settings");
      setPayload(data.data);
      setNotificationPrefs(JSON.stringify(data.data.settings.notificationPrefs ?? {}, null, 2));
      setTradingPrefs(JSON.stringify(data.data.settings.tradingPrefs ?? {}, null, 2));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    setWriteUnlocked(Boolean(getPersonalWriteKey()));
    void fetchSettings();
  }, [fetchSettings]);

  async function unlockWrites() {
    if (!writeKey.trim()) return;
    setCheckingWriteKey(true);
    setError(null);
    try {
      await verifyPersonalWriteKey(apiUrl, writeKey.trim());
      setPersonalWriteKey(writeKey.trim());
      setWriteUnlocked(true);
      setWriteKey("");
      await fetchSettings();
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "The write key was rejected.");
    } finally {
      setCheckingWriteKey(false);
    }
  }

  function lockWrites() {
    clearPersonalWriteKey();
    setWriteUnlocked(false);
    setWriteKey("");
  }

  async function saveSettings() {
    try {
      const response = await apiFetch(`${apiUrl}/api/v1/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPrefs: JSON.parse(notificationPrefs), tradingPrefs: JSON.parse(tradingPrefs) }),
      });
      const data: { success?: boolean; error?: string } = await response.json();
      if (!data.success) throw new Error(data.error || "Failed to save settings");
      await fetchSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings");
    }
  }

  async function createDestination() {
    if (!destinationValue.trim()) return;
    try {
      const response = await apiFetch(`${apiUrl}/api/v1/settings/destinations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: destinationChannel, destination: destinationValue, priorityMin: destinationPriority, enabled: true }),
      });
      const data: { success?: boolean; error?: string } = await response.json();
      if (!data.success) throw new Error(data.error || "Failed to create destination");
      setDestinationValue("");
      await fetchSettings();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create destination");
    }
  }

  async function toggleDestination(destination: Destination) {
    const response = await apiFetch(`${apiUrl}/api/v1/settings/destinations/${destination.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !destination.enabled }),
    });
    if (response.ok) await fetchSettings();
  }

  async function deleteDestination(destinationId: string) {
    const response = await apiFetch(`${apiUrl}/api/v1/settings/destinations/${destinationId}`, { method: "DELETE" });
    if (response.ok) await fetchSettings();
  }

  async function createStrategy() {
    if (!strategyName.trim()) return;
    try {
      const response = await apiFetch(`${apiUrl}/api/v1/settings/strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: strategyName, isActive: true, config: JSON.parse(strategyConfig) }),
      });
      const data: { success?: boolean; error?: string } = await response.json();
      if (!data.success) throw new Error(data.error || "Failed to create strategy");
      setStrategyName("");
      await fetchSettings();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create strategy");
    }
  }

  if (loading) return <LoadingRows rows={5} />;

  return (
    <div className="space-y-4">
      {error ? <ErrorState title="Settings degraded" message={error} /> : null}

      <Panel title="Personal Write Access" icon={writeUnlocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-standard md:flex-row md:items-end md:justify-between">
          <div>
            <StatusBadge tone={writeUnlocked ? "success" : "warning"}>
              {writeUnlocked ? "Unlocked in this browser" : "Read-only mode"}
            </StatusBadge>
            <p className="mt-3 max-w-2xl text-sm text-on-surface-variant">
              The key protects scans and configuration changes without requiring an account. It stays in this browser and is never bundled into the site.
            </p>
          </div>
          {writeUnlocked ? (
            <button type="button" onClick={lockWrites} className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-outline bg-surface-container px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface">
              <Lock className="h-4 w-4" /> Lock changes
            </button>
          ) : (
            <div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
              <label className="relative flex-1">
                <span className="sr-only">Personal write key</span>
                <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-on-surface-variant" />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={writeKey}
                  onChange={(event) => setWriteKey(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void unlockWrites(); }}
                  placeholder="Enter personal write key"
                  className="h-10 w-full rounded-sm border border-outline bg-surface pl-10 pr-3 text-sm text-on-surface outline-none focus:border-primary"
                />
              </label>
              <button type="button" disabled={checkingWriteKey || !writeKey.trim()} onClick={() => void unlockWrites()} className="h-10 rounded-sm border border-primary/30 bg-primary-container px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-primary-foreground disabled:opacity-50">
                {checkingWriteKey ? "Checking..." : "Unlock changes"}
              </button>
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Destinations" value={payload?.destinations.length ?? 0} tone="primary" />
        <MetricCard label="Enabled Routes" value={payload?.destinations.filter((destination) => destination.enabled).length ?? 0} tone="success" />
        <MetricCard label="Strategies" value={payload?.strategies.length ?? 0} />
        <MetricCard label="Active Strategies" value={payload?.strategies.filter((strategy) => strategy.isActive).length ?? 0} tone="warning" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Panel title="Notification Destinations" icon={<BellRing className="h-4 w-4" />}>
            <div className="space-y-3 p-standard">
              <div className="grid gap-3 md:grid-cols-[170px_1fr_170px_auto]">
                <AegisSelect
                  label="Channel"
                  value={destinationChannel}
                  options={[
                    { label: "telegram", value: "telegram" },
                    { label: "discord", value: "discord" },
                    { label: "dev_outbox", value: "dev_outbox" },
                  ]}
                  onChange={setDestinationChannel}
                />
                <input value={destinationValue} onChange={(event) => setDestinationValue(event.target.value)} placeholder="Chat ID, webhook, or destination" className="h-10 rounded-sm border border-outline bg-surface px-3 text-sm text-on-surface outline-none" />
                <AegisSelect
                  label="Min priority"
                  value={destinationPriority}
                  options={["critical", "high", "medium", "low", "info"].map((priority) => ({ label: priority, value: priority }))}
                  onChange={setDestinationPriority}
                />
                <button onClick={createDestination} className="rounded-sm border border-primary/30 bg-primary-container px-3 py-2 text-primary-foreground" title="Add destination">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="divide-y divide-outline rounded-lg border border-outline bg-surface">
                {(payload?.destinations ?? []).length === 0 ? (
                  <div className="p-standard text-sm text-on-surface-variant">No destinations configured.</div>
                ) : (
                  payload!.destinations.map((destination) => (
                    <div key={destination.id} className="flex items-start justify-between gap-4 px-standard py-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={destination.enabled ? "success" : "default"}>{destination.channel}</StatusBadge>
                          <p className="truncate font-mono text-sm text-on-surface">{destination.destination}</p>
                        </div>
                        <p className="mt-2 text-sm text-on-surface-variant">Minimum priority: {destination.priorityMin}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => toggleDestination(destination)} className="rounded-sm border border-outline bg-surface-container p-2 text-on-surface" title="Toggle destination">
                          {destination.enabled ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-on-surface-variant" />}
                        </button>
                        <button onClick={() => deleteDestination(destination.id)} className="rounded-sm border border-outline bg-surface-container p-2 text-on-surface-variant hover:text-destructive" title="Remove destination">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Preference Payloads" icon={<Code2 className="h-4 w-4" />}>
            <div className="grid gap-4 p-standard lg:grid-cols-2">
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Notifications</span>
                <textarea value={notificationPrefs} onChange={(event) => setNotificationPrefs(event.target.value)} rows={12} className="mt-2 w-full rounded-sm border border-outline bg-surface px-3 py-2 font-mono text-xs text-on-surface outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">Trading</span>
                <textarea value={tradingPrefs} onChange={(event) => setTradingPrefs(event.target.value)} rows={12} className="mt-2 w-full rounded-sm border border-outline bg-surface px-3 py-2 font-mono text-xs text-on-surface outline-none focus:border-primary" />
              </label>
              <button onClick={saveSettings} className="w-fit rounded-sm border border-primary/30 bg-primary-container px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary-foreground">Save Settings</button>
            </div>
          </Panel>
        </div>

        <Panel title="Strategy Settings" icon={<Settings className="h-4 w-4" />}>
          <div className="space-y-4 p-standard">
            <input value={strategyName} onChange={(event) => setStrategyName(event.target.value)} placeholder="Strategy name" className="h-10 w-full rounded-sm border border-outline bg-surface px-3 text-sm text-on-surface outline-none" />
            <textarea value={strategyConfig} onChange={(event) => setStrategyConfig(event.target.value)} rows={8} className="w-full rounded-sm border border-outline bg-surface px-3 py-2 font-mono text-xs text-on-surface outline-none" />
            <button onClick={createStrategy} className="w-full rounded-sm border border-outline bg-surface-container px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface">Create Strategy</button>
            <div className="divide-y divide-outline rounded-lg border border-outline bg-surface">
              {(payload?.strategies ?? []).map((strategy) => (
                <div key={strategy.id} className="px-standard py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-on-surface">{strategy.name}</p>
                    <StatusBadge tone={strategy.isActive ? "success" : "default"}>{strategy.currentVersion}</StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-on-surface-variant">{strategy.description || "No description"}</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
