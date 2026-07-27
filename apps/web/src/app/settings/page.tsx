"use client";

import { useEffect, useState } from "react";

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

interface SettingsPayload {
  settings: {
    preferences: Record<string, unknown>;
    notificationPrefs: Record<string, unknown>;
    displayPrefs: Record<string, unknown>;
    tradingPrefs: Record<string, unknown>;
  };
  destinations: Array<{
    id: string;
    channel: string;
    destination: string;
    enabled: boolean;
    priorityMin: string;
  }>;
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
  const [strategyDescription, setStrategyDescription] = useState("");
  const [strategyConfig, setStrategyConfig] = useState("{\n  \"minScore\": 70,\n  \"maxAgeMinutes\": 30,\n  \"minLiquidityUsd\": 15000\n}");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  async function fetchSettings() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/v1/settings`);
      const data: any = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to load settings");
      }

      setPayload(data.data);
      setNotificationPrefs(JSON.stringify(data.data.settings.notificationPrefs ?? {}, null, 2));
      setTradingPrefs(JSON.stringify(data.data.settings.tradingPrefs ?? {}, null, 2));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  async function saveSettings() {
    try {
      const response = await fetch(`${apiUrl}/api/v1/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationPrefs: JSON.parse(notificationPrefs),
          tradingPrefs: JSON.parse(tradingPrefs),
        }),
      });
      const data: any = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to save settings");
      }
      await fetchSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings");
    }
  }

  async function toggleStrategy(strategy: Strategy) {
    const latestVersion = strategy.versions[0];

    try {
      const response = await fetch(`${apiUrl}/api/v1/settings/strategies/${strategy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: strategy.name,
          description: strategy.description,
          isActive: !strategy.isActive,
          config: latestVersion?.config ?? {},
        }),
      });
      const data: any = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to update strategy");
      }
      await fetchSettings();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update strategy");
    }
  }

  async function createStrategy() {
    try {
      const response = await fetch(`${apiUrl}/api/v1/settings/strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: strategyName,
          description: strategyDescription || undefined,
          isActive: true,
          config: JSON.parse(strategyConfig),
        }),
      });
      const data: any = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to create strategy");
      }
      setStrategyName("");
      setStrategyDescription("");
      await fetchSettings();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create strategy");
    }
  }

  async function deleteStrategy(strategyId: string) {
    try {
      const response = await fetch(`${apiUrl}/api/v1/settings/strategies/${strategyId}`, {
        method: "DELETE",
      });
      const data: any = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to delete strategy");
      }
      await fetchSettings();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete strategy");
    }
  }

  async function createDestination() {
    try {
      const response = await fetch(`${apiUrl}/api/v1/settings/destinations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: destinationChannel,
          destination: destinationValue,
          priorityMin: destinationPriority,
          enabled: true,
        }),
      });
      const data: any = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to create destination");
      }
      setDestinationValue("");
      await fetchSettings();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create destination");
    }
  }

  async function toggleDestination(destination: SettingsPayload["destinations"][number]) {
    try {
      const response = await fetch(`${apiUrl}/api/v1/settings/destinations/${destination.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: !destination.enabled,
        }),
      });
      const data: any = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to update destination");
      }
      await fetchSettings();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update destination");
    }
  }

  async function deleteDestination(destinationId: string) {
    try {
      const response = await fetch(`${apiUrl}/api/v1/settings/destinations/${destinationId}`, {
        method: "DELETE",
      });
      const data: any = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to delete destination");
      }
      await fetchSettings();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete destination");
    }
  }

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Development-mode settings, notification preferences, and strategy configuration.</p>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted" />)}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && payload ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div>
                <h2 className="font-semibold">Notification Preferences</h2>
                <p className="text-sm text-muted-foreground">Edit the persisted JSON preferences used by the development user.</p>
              </div>
              <textarea
                value={notificationPrefs}
                onChange={(e) => setNotificationPrefs(e.target.value)}
                rows={10}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
              />
            </div>

            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div>
                <h2 className="font-semibold">Trading Preferences</h2>
                <p className="text-sm text-muted-foreground">Persist local execution preferences even though trading remains Phase 3 work.</p>
              </div>
              <textarea
                value={tradingPrefs}
                onChange={(e) => setTradingPrefs(e.target.value)}
                rows={10}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
              />
            </div>
          </div>

          <button onClick={saveSettings} className="w-fit rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
            Save Settings
          </button>

          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div>
              <h2 className="font-semibold">Notification Destinations</h2>
              <p className="text-sm text-muted-foreground">Persisted delivery routes used by the alerts worker.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-[auto_1fr_auto_auto]">
              <select
                value={destinationChannel}
                onChange={(e) => setDestinationChannel(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="telegram">telegram</option>
                <option value="discord">discord</option>
                <option value="dev_outbox">dev_outbox</option>
              </select>
              <input
                value={destinationValue}
                onChange={(e) => setDestinationValue(e.target.value)}
                placeholder="Chat ID, webhook URL, or log"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <select
                value={destinationPriority}
                onChange={(e) => setDestinationPriority(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                {["critical", "high", "medium", "low", "info"].map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
              <button onClick={createDestination} className="rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
                Add
              </button>
            </div>
            {payload.destinations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No destinations configured yet.</p>
            ) : (
              <div className="grid gap-3">
                {payload.destinations.map((destination) => (
                  <div key={destination.id} className="rounded-md border p-4 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium">{destination.channel}</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {destination.enabled ? "enabled" : "disabled"}
                        </span>
                        <button onClick={() => toggleDestination(destination)} className="rounded-md border px-2 py-1 text-xs hover:bg-muted/50">
                          {destination.enabled ? "Disable" : "Enable"}
                        </button>
                        <button onClick={() => deleteDestination(destination.id)} className="rounded-md border px-2 py-1 text-xs hover:bg-muted/50">
                          Remove
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-muted-foreground">{destination.destination}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Min priority: {destination.priorityMin}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div>
              <h2 className="font-semibold">Strategies</h2>
              <p className="text-sm text-muted-foreground">Persisted strategy definitions and versioned configs used by runtime evaluation.</p>
            </div>
            <div className="grid gap-3">
              <input
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
                placeholder="Strategy name"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <input
                value={strategyDescription}
                onChange={(e) => setStrategyDescription(e.target.value)}
                placeholder="Optional description"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <textarea
                value={strategyConfig}
                onChange={(e) => setStrategyConfig(e.target.value)}
                rows={6}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
              />
              <button onClick={createStrategy} className="w-fit rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
                Create Strategy
              </button>
            </div>
            <div className="grid gap-4">
              {payload.strategies.map((strategy) => (
                <div key={strategy.id} className="rounded-md border p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{strategy.name}</h3>
                        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {strategy.isActive ? "active" : "inactive"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{strategy.description || "No description"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleStrategy(strategy)} className="rounded-md border px-3 py-1 text-sm hover:bg-muted/50">
                        {strategy.isActive ? "Disable" : "Enable"}
                      </button>
                      <button onClick={() => deleteStrategy(strategy.id)} className="rounded-md border px-3 py-1 text-sm hover:bg-muted/50">
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Current version: {strategy.currentVersion}
                  </div>
                  <div className="grid gap-2">
                    {strategy.versions.slice(0, 2).map((version) => (
                      <div key={version.id} className="rounded border bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-4">
                          <p className="font-medium">{version.version}</p>
                          <span>{new Date(version.createdAt).toLocaleString()}</span>
                        </div>
                        <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(version.config, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
