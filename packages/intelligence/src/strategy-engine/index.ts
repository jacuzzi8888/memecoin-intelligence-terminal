import { logger } from "@memecoin/logger";

const log = logger("strategy-engine");

export interface StrategyCondition {
  field: string;
  operator: "gt" | "lt" | "eq" | "gte" | "lte" | "between" | "in";
  value: number | string | boolean | [number, number] | string[];
  weight: number;
}

export interface StrategyConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  isActive: boolean;
  alertThreshold: number;
  cooldownMinutes: number;
  conditions: StrategyCondition[];
  channels: string[];
  priority: "critical" | "high" | "medium" | "low";
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyEvaluationInput {
  [key: string]: number | string | boolean | null;
}

export interface StrategyEvaluationResult {
  strategyId: string;
  strategyName: string;
  matched: boolean;
  score: number;
  confidence: number;
  matchedConditions: string[];
  unmatchedConditions: string[];
  priority: string;
  alertThreshold: number;
}

export interface RuntimeStrategyRecord {
  id: string;
  name?: string;
  description?: string | null;
  version?: string;
  isActive?: boolean;
  userId?: string | null;
  config: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

const RULESET_VERSION = "strategy-engine-v0.1.0";

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isPriority(value: unknown): value is StrategyConfig["priority"] {
  return value === "critical" || value === "high" || value === "medium" || value === "low";
}

function isCondition(value: unknown): value is StrategyCondition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const condition = value as Partial<StrategyCondition>;
  return typeof condition.field === "string"
    && ["gt", "lt", "eq", "gte", "lte", "between", "in"].includes(String(condition.operator))
    && typeof condition.weight === "number"
    && condition.weight >= 0;
}

/** Converts persisted strategy JSON into the one runtime format used by every ingestion path. */
export function toRuntimeStrategyConfig(record: RuntimeStrategyRecord): StrategyConfig {
  const config = record.config;
  const configuredConditions = Array.isArray(config.conditions)
    ? config.conditions.filter(isCondition)
    : [];

  // Preserve old min/max strategy records while making their semantics explicit and strict.
  const legacyConditions: StrategyCondition[] = [];
  if (typeof config.minScore === "number") {
    legacyConditions.push({ field: "token_score", operator: "gte", value: config.minScore, weight: 1 });
  }
  if (typeof config.minQualifiedWallets === "number") {
    legacyConditions.push({ field: "qualified_wallet_count", operator: "gte", value: config.minQualifiedWallets, weight: 1 });
  }
  if (typeof config.maxAgeMinutes === "number") {
    legacyConditions.push({ field: "token_age_minutes", operator: "lte", value: config.maxAgeMinutes, weight: 1 });
  }
  if (typeof config.minLiquidityUsd === "number") {
    legacyConditions.push({ field: "liquidity_usd", operator: "gte", value: config.minLiquidityUsd, weight: 1 });
  }

  const conditions = configuredConditions.length > 0 ? configuredConditions : legacyConditions;
  const channels = Array.isArray(config.channels)
    ? config.channels.filter((channel): channel is string => typeof channel === "string")
    : ["web"];

  return {
    id: record.id,
    name: record.name ?? record.id,
    description: record.description ?? "",
    version: record.version ?? "v0.1.0",
    isActive: record.isActive ?? true,
    alertThreshold: configuredConditions.length > 0
      ? finiteNumber(config.alertThreshold, 70)
      : 100,
    cooldownMinutes: finiteNumber(config.cooldownMinutes, 60),
    conditions,
    channels,
    priority: isPriority(config.priority) ? config.priority : "medium",
    userId: record.userId ?? null,
    createdAt: record.createdAt ?? new Date(0).toISOString(),
    updatedAt: record.updatedAt ?? new Date(0).toISOString(),
  };
}

export class StrategyEngine {
  evaluate(config: StrategyConfig, input: StrategyEvaluationInput): StrategyEvaluationResult {
    const matchedConditions: string[] = [];
    const unmatchedConditions: string[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    for (const condition of config.conditions) {
      const fieldValue = input[condition.field];
      const weight = condition.weight;
      totalWeight += weight;

      const matched = this.evaluateCondition(condition, fieldValue);

      if (matched) {
        matchedConditions.push(condition.field);
        totalScore += weight;
      } else {
        unmatchedConditions.push(condition.field);
      }
    }

    const normalizedScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
    const matched = normalizedScore >= config.alertThreshold;
    const confidence = matchedConditions.length / Math.max(config.conditions.length, 1);

    if (matched) {
      log.info(
        {
          strategy: config.name,
          score: normalizedScore,
          matchedCount: matchedConditions.length,
        },
        "Strategy matched",
      );
    }

    return {
      strategyId: config.id,
      strategyName: config.name,
      matched,
      score: Math.round(normalizedScore),
      confidence: Math.round(confidence * 100) / 100,
      matchedConditions,
      unmatchedConditions,
      priority: config.priority,
      alertThreshold: config.alertThreshold,
    };
  }

  evaluateAll(
    configs: StrategyConfig[],
    input: StrategyEvaluationInput,
  ): StrategyEvaluationResult[] {
    return configs
      .filter((c) => c.isActive)
      .map((c) => this.evaluate(c, input))
      .filter((r) => r.matched)
      .sort((a, b) => b.score - a.score);
  }

  private evaluateCondition(
    condition: StrategyCondition,
    fieldValue: number | string | boolean | null | undefined,
  ): boolean {
    if (fieldValue === null || fieldValue === undefined) return false;

    switch (condition.operator) {
      case "gt":
        return typeof fieldValue === "number" && typeof condition.value === "number" && fieldValue > condition.value;
      case "lt":
        return typeof fieldValue === "number" && typeof condition.value === "number" && fieldValue < condition.value;
      case "eq":
        return fieldValue === condition.value;
      case "gte":
        return typeof fieldValue === "number" && typeof condition.value === "number" && fieldValue >= condition.value;
      case "lte":
        return typeof fieldValue === "number" && typeof condition.value === "number" && fieldValue <= condition.value;
      case "between":
        return (
          Array.isArray(condition.value) &&
          typeof fieldValue === "number" &&
          fieldValue >= (condition.value[0] as number) &&
          fieldValue <= (condition.value[1] as number)
        );
      case "in":
        return Array.isArray(condition.value) && (condition.value as string[]).includes(String(fieldValue));
      default:
        return false;
    }
  }

  static createDefaultStrategies(): StrategyConfig[] {
    const now = new Date().toISOString();
    return [
      {
        id: "alpha-alert",
        name: "Alpha Alert",
        description: "High token score + multiple qualified wallets",
        version: "v0.1.0",
        isActive: true,
        alertThreshold: 70,
        cooldownMinutes: 60,
        priority: "high",
        channels: ["telegram", "web"],
        conditions: [
          { field: "token_score", operator: "gte", value: 70, weight: 0.4 },
          { field: "qualified_wallet_count", operator: "gte", value: 2, weight: 0.3 },
          { field: "liquidity_usd", operator: "gte", value: 10000, weight: 0.15 },
          { field: "token_age_minutes", operator: "lt", value: 60, weight: 0.15 },
        ],
        userId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "early-entry",
        name: "Early Entry",
        description: "Very new token + high wallet quality",
        version: "v0.1.0",
        isActive: true,
        alertThreshold: 60,
        cooldownMinutes: 30,
        priority: "critical",
        channels: ["telegram", "web"],
        conditions: [
          { field: "token_age_minutes", operator: "lt", value: 30, weight: 0.3 },
          { field: "qualified_wallet_count", operator: "gte", value: 1, weight: 0.3 },
          { field: "token_score", operator: "gte", value: 50, weight: 0.2 },
          { field: "risk_score", operator: "lt", value: 50, weight: 0.2 },
        ],
        userId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "volume-spike",
        name: "Volume Spike",
        description: "Unusual volume + positive risk factors",
        version: "v0.1.0",
        isActive: true,
        alertThreshold: 65,
        cooldownMinutes: 120,
        priority: "medium",
        channels: ["web"],
        conditions: [
          { field: "volume_1h_usd", operator: "gt", value: 100000, weight: 0.35 },
          { field: "volume_to_liquidity_ratio", operator: "gt", value: 2, weight: 0.25 },
          { field: "risk_score", operator: "lt", value: 60, weight: 0.2 },
          { field: "holder_count", operator: "gt", value: 100, weight: 0.2 },
        ],
        userId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "cohort-signal",
        name: "Cohort Signal",
        description: "Multiple wallets from same cohort entering same token",
        version: "v0.1.0",
        isActive: false,
        alertThreshold: 75,
        cooldownMinutes: 60,
        priority: "high",
        channels: ["telegram", "web"],
        conditions: [
          { field: "cohort_entry_count", operator: "gte", value: 3, weight: 0.4 },
          { field: "cohort_quality_score", operator: "gte", value: 70, weight: 0.3 },
          { field: "token_age_minutes", operator: "lt", value: 120, weight: 0.15 },
          { field: "risk_score", operator: "lt", value: 50, weight: 0.15 },
        ],
        userId: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }
}

export { RULESET_VERSION as STRATEGY_ENGINE_VERSION };
