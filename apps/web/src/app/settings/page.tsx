"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
  Gauge,
  KeyRound,
  Lock,
  LockOpen,
  Plus,
  Radar,
  Settings2,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { AegisSelect, LoadingRows, MetricCard, Panel, StatusBadge } from "@/components/aegis-ui";
import {
  ActionLink,
  EmptyState,
  ModuleNotice,
  PageHeader,
  RefreshButton,
} from "@/components/workflow-ui";
import { API_BASE_URL } from "@/lib/api-url";
import {
  apiFetch,
  clearPersonalWriteKey,
  getPersonalWriteKey,
  setPersonalWriteKey,
  verifyPersonalWriteKey,
} from "@/lib/api-client";

interface Strategy {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  currentVersion: string;
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

const refreshOptions = [
  { label: "15 seconds", value: "15" },
  { label: "30 seconds", value: "30" },
  { label: "60 seconds", value: "60" },
];

const timeframeOptions = [
  { label: "1 hour", value: "1h" },
  { label: "4 hours", value: "4h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
];

export default function SettingsPage() {
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState("15");
  const [defaultTimeframe, setDefaultTimeframe] = useState("24h");
  const [deliveryMode, setDeliveryMode] = useState("immediate");
  const [destinationChannel, setDestinationChannel] = useState("telegram");
  const [destinationValue, setDestinationValue] = useState("");
  const [destinationPriority, setDestinationPriority] = useState("medium");
  const [writeKey, setWriteKey] = useState("");
  const [writeUnlocked, setWriteUnlocked] = useState(false);
  const [checkingWriteKey, setCheckingWriteKey] = useState(false);
  const apiUrl = API_BASE_URL;

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`${apiUrl}/api/v1/settings`, { cache: "no-store" });
      const data = (await response.json()) as {
        success?: boolean;
        data?: SettingsPayload;
        error?: string;
      };
      if (!response.ok || !data.success || !data.data)
        throw new Error(data.error || "Failed to load settings");
      setPayload(data.data);

      const savedRefresh = String(data.data.settings.displayPrefs.refreshIntervalSeconds ?? "15");
      const savedTimeframe = String(
        data.data.settings.displayPrefs.defaultScannerTimeframe ?? "24h",
      );
      const savedDelivery = String(
        data.data.settings.notificationPrefs.deliveryMode ?? "immediate",
      );
      setRefreshInterval(
        refreshOptions.some((option) => option.value === savedRefresh) ? savedRefresh : "15",
      );
      setDefaultTimeframe(
        timeframeOptions.some((option) => option.value === savedTimeframe) ? savedTimeframe : "24h",
      );
      setDeliveryMode(
        ["immediate", "critical_only", "muted"].includes(savedDelivery)
          ? savedDelivery
          : "immediate",
      );
      setError(null);
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
      setSaveMessage("Write access unlocked in this browser.");
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
    setSaveMessage("Write access locked. Read-only intelligence remains available.");
  }

  async function saveOperatorDefaults() {
    if (!writeUnlocked) {
      setError("Unlock personal write access before saving operator defaults.");
      return;
    }
    try {
      const displayPrefs = {
        ...(payload?.settings.displayPrefs ?? {}),
        refreshIntervalSeconds: Number(refreshInterval),
        defaultScannerTimeframe: defaultTimeframe,
      };
      const notificationPrefs = {
        ...(payload?.settings.notificationPrefs ?? {}),
        deliveryMode,
      };
      const response = await apiFetch(`${apiUrl}/api/v1/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayPrefs, notificationPrefs }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to save settings");
      window.localStorage.setItem(
        "aegis-operator-preferences",
        JSON.stringify({
          refreshIntervalSeconds: Number(refreshInterval),
          defaultScannerTimeframe: defaultTimeframe,
        }),
      );
      setSaveMessage("Operator defaults saved and applied to this browser.");
      setError(null);
      await fetchSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings");
    }
  }

  async function createDestination() {
    if (!writeUnlocked || !destinationValue.trim()) return;
    try {
      const response = await apiFetch(`${apiUrl}/api/v1/settings/destinations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: destinationChannel,
          destination: destinationValue.trim(),
          priorityMin: destinationPriority,
          enabled: true,
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success)
        throw new Error(data.error || "Failed to create destination");
      setDestinationValue("");
      setSaveMessage("Notification destination added.");
      setError(null);
      await fetchSettings();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create destination");
    }
  }

  async function toggleDestination(destination: Destination) {
    if (!writeUnlocked) return;
    try {
      const response = await apiFetch(`${apiUrl}/api/v1/settings/destinations/${destination.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !destination.enabled }),
      });
      if (!response.ok) throw new Error("Failed to update destination");
      await fetchSettings();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update destination");
    }
  }

  async function deleteDestination(destinationId: string) {
    if (!writeUnlocked) return;
    try {
      const response = await apiFetch(`${apiUrl}/api/v1/settings/destinations/${destinationId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to remove destination");
      await fetchSettings();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to remove destination");
    }
  }

  if (loading && !payload) return <LoadingRows rows={5} />;

  const activeDestinations =
    payload?.destinations.filter((destination) => destination.enabled).length ?? 0;
  const activeStrategies = payload?.strategies.filter((strategy) => strategy.isActive).length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Operator configuration"
        title="Settings"
        description="Control browser defaults and alert delivery without editing raw configuration. Intelligence remains readable when write access is locked."
        actions={
          <>
            <ActionLink href="/strategies" icon={<Gauge className="h-4 w-4" />}>
              Strategy controls
            </ActionLink>
            <RefreshButton onClick={() => void fetchSettings()} busy={loading} />
          </>
        }
        meta={
          <StatusBadge tone={writeUnlocked ? "success" : "warning"}>
            {writeUnlocked ? "Changes unlocked" : "Read-only"}
          </StatusBadge>
        }
      />

      {error ? (
        <ModuleNotice
          tone="danger"
          title="Settings need attention"
          message={error}
          action={
            <button
              type="button"
              onClick={() => setError(null)}
              className="font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              Dismiss
            </button>
          }
        />
      ) : null}
      {saveMessage ? (
        <ModuleNotice
          tone="success"
          title="Configuration updated"
          message={saveMessage}
          action={
            <button
              type="button"
              onClick={() => setSaveMessage(null)}
              className="font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              Dismiss
            </button>
          }
        />
      ) : null}

      <Panel
        title="Personal Write Access"
        icon={writeUnlocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      >
        <div className="flex flex-col gap-4 p-standard md:flex-row md:items-end md:justify-between">
          <div>
            <StatusBadge tone={writeUnlocked ? "success" : "warning"}>
              {writeUnlocked ? "Unlocked in this browser" : "Read-only mode"}
            </StatusBadge>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-on-surface-variant">
              This key protects scans and configuration changes on the public deployment without
              adding account sign-in. It is stored only in this browser.
            </p>
          </div>
          {writeUnlocked ? (
            <button
              type="button"
              onClick={lockWrites}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-outline bg-surface-container px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface"
            >
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void unlockWrites();
                  }}
                  placeholder="Enter personal write key"
                  className="h-10 w-full rounded-sm border border-outline bg-surface pl-10 pr-3 text-sm text-on-surface outline-none focus:border-primary"
                />
              </label>
              <button
                type="button"
                disabled={checkingWriteKey || !writeKey.trim()}
                onClick={() => void unlockWrites()}
                className="h-10 rounded-sm border border-primary/30 bg-primary-container px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-primary-foreground disabled:opacity-50"
              >
                {checkingWriteKey ? "Checking..." : "Unlock changes"}
              </button>
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Destinations" value={payload?.destinations.length ?? 0} tone="primary" />
        <MetricCard label="Enabled Routes" value={activeDestinations} tone="success" />
        <MetricCard label="Strategies" value={payload?.strategies.length ?? 0} />
        <MetricCard label="Active Strategies" value={activeStrategies} tone="warning" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Panel title="Operator Defaults" icon={<Settings2 className="h-4 w-4" />}>
            <div className="space-y-4 p-standard">
              <div className="grid gap-3 md:grid-cols-3">
                <AegisSelect
                  label="Live refresh"
                  value={refreshInterval}
                  options={refreshOptions}
                  onChange={setRefreshInterval}
                />
                <AegisSelect
                  label="Scanner timeframe"
                  value={defaultTimeframe}
                  options={timeframeOptions}
                  onChange={setDefaultTimeframe}
                />
                <AegisSelect
                  label="Alert delivery"
                  value={deliveryMode}
                  options={[
                    { label: "Immediate", value: "immediate" },
                    { label: "Critical only", value: "critical_only" },
                    { label: "Muted", value: "muted" },
                  ]}
                  onChange={setDeliveryMode}
                />
              </div>
              <div className="flex flex-col gap-3 border-t border-outline pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-2xl text-sm leading-5 text-on-surface-variant">
                  The scanner uses these defaults in this browser. Delivery still requires at least
                  one enabled destination.
                </p>
                <button
                  type="button"
                  disabled={!writeUnlocked}
                  onClick={() => void saveOperatorDefaults()}
                  className="h-10 shrink-0 rounded-sm border border-primary/30 bg-primary-container px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Save defaults
                </button>
              </div>
            </div>
          </Panel>

          <Panel title="Notification Destinations" icon={<BellRing className="h-4 w-4" />}>
            <div className="space-y-3 p-standard">
              <div className="grid gap-3 md:grid-cols-[170px_1fr_170px_auto]">
                <AegisSelect
                  label="Channel"
                  value={destinationChannel}
                  options={[
                    { label: "Telegram", value: "telegram" },
                    { label: "Discord", value: "discord" },
                    { label: "Development outbox", value: "dev_outbox" },
                  ]}
                  onChange={setDestinationChannel}
                />
                <label>
                  <span className="sr-only">Destination address</span>
                  <input
                    value={destinationValue}
                    onChange={(event) => setDestinationValue(event.target.value)}
                    placeholder="Chat ID, webhook, or destination"
                    className="h-10 w-full rounded-sm border border-outline bg-surface px-3 text-sm text-on-surface outline-none"
                  />
                </label>
                <AegisSelect
                  label="Min priority"
                  value={destinationPriority}
                  options={["critical", "high", "medium", "low", "info"].map((priority) => ({
                    label: priority,
                    value: priority,
                  }))}
                  onChange={setDestinationPriority}
                />
                <button
                  type="button"
                  disabled={!writeUnlocked || !destinationValue.trim()}
                  onClick={() => void createDestination()}
                  className="flex min-h-10 items-center justify-center rounded-sm border border-primary/30 bg-primary-container px-3 text-primary-foreground disabled:opacity-45"
                  aria-label="Add notification destination"
                  title="Add destination"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {!writeUnlocked ? (
                <p className="text-xs text-warning">
                  Unlock write access to add, pause, or remove destinations.
                </p>
              ) : null}
              <div className="divide-y divide-outline rounded-lg border border-outline bg-surface">
                {(payload?.destinations ?? []).length === 0 ? (
                  <EmptyState
                    title="No delivery routes"
                    message="Add Telegram, Discord, or a development outbox destination when alerts are ready to leave the terminal."
                  />
                ) : (
                  payload!.destinations.map((destination) => (
                    <div
                      key={destination.id}
                      className="flex items-start justify-between gap-4 px-standard py-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={destination.enabled ? "success" : "default"}>
                            {destination.channel}
                          </StatusBadge>
                          <p className="truncate font-mono text-sm text-on-surface">
                            {destination.destination}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-on-surface-variant">
                          Minimum priority: {destination.priorityMin}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!writeUnlocked}
                          onClick={() => void toggleDestination(destination)}
                          className="rounded-sm border border-outline bg-surface-container p-2 text-on-surface disabled:opacity-40"
                          aria-label={`${destination.enabled ? "Pause" : "Enable"} ${destination.channel} destination`}
                          title="Toggle destination"
                        >
                          {destination.enabled ? (
                            <ToggleRight className="h-4 w-4 text-success" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-on-surface-variant" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={!writeUnlocked}
                          onClick={() => void deleteDestination(destination.id)}
                          className="rounded-sm border border-outline bg-surface-container p-2 text-on-surface-variant hover:text-destructive disabled:opacity-40"
                          aria-label={`Remove ${destination.channel} destination`}
                          title="Remove destination"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Intelligence Controls" icon={<Radar className="h-4 w-4" />}>
            <div className="space-y-4 p-standard">
              <ModuleNotice
                tone="warning"
                title="Strategies are evidence-gated"
                message="New strategies stay inactive until a matching backtest passes the current evidence gate. Raw strategy JSON is no longer edited here."
              />
              <div className="space-y-2">
                {(payload?.strategies ?? []).slice(0, 4).map((strategy) => (
                  <div
                    key={strategy.id}
                    className="rounded-sm border border-outline bg-surface px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-semibold text-on-surface">{strategy.name}</p>
                      <StatusBadge tone={strategy.isActive ? "success" : "default"}>
                        {strategy.currentVersion}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {strategy.description ||
                        (strategy.isActive ? "Active intelligence rule" : "Draft or inactive rule")}
                    </p>
                  </div>
                ))}
              </div>
              <ActionLink href="/strategies" tone="primary" icon={<Gauge className="h-4 w-4" />}>
                Open strategy lab
              </ActionLink>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
