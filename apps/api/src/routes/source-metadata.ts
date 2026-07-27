interface SourceMetadataOptions {
  signalMetadata?: unknown;
  launchMetadata?: unknown;
  snapshotAt?: Date | null;
  detectedAt?: Date | null;
  launchedAt?: Date | null;
  firstSeenAt?: Date | null;
  fallbackSource?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function resolveSourceMetadata(options: SourceMetadataOptions) {
  const signalMetadata = asRecord(options.signalMetadata);
  const launchMetadata = asRecord(options.launchMetadata);

  const dataSource =
    readString(signalMetadata, "marketDataProvider") ||
    readString(signalMetadata, "discoveryProvider") ||
    readString(launchMetadata, "marketDataProvider") ||
    readString(launchMetadata, "discoveryProvider") ||
    options.fallbackSource ||
    "development";

  const freshnessDate =
    options.snapshotAt ||
    options.detectedAt ||
    options.launchedAt ||
    options.firstSeenAt ||
    null;

  return {
    dataSource,
    dataFreshness: freshnessDate?.toISOString() || new Date().toISOString(),
  };
}
