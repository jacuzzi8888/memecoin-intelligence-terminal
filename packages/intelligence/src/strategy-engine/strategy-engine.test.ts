import { describe, it, expect } from "vitest";
import { StrategyEngine, toRuntimeStrategyConfig } from "./index";
import type { StrategyConfig, StrategyEvaluationInput } from "./index";

const alphaStrategy: StrategyConfig = {
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const matchingInput: StrategyEvaluationInput = {
  token_score: 85,
  qualified_wallet_count: 4,
  liquidity_usd: 50000,
  token_age_minutes: 15,
};

const nonMatchingInput: StrategyEvaluationInput = {
  token_score: 40,
  qualified_wallet_count: 0,
  liquidity_usd: 5000,
  token_age_minutes: 180,
};

describe("StrategyEngine", () => {
  const engine = new StrategyEngine();

  it("matches when all conditions are met", () => {
    const result = engine.evaluate(alphaStrategy, matchingInput);
    expect(result.matched).toBe(true);
    expect(result.matchedConditions).toContain("token_score");
    expect(result.matchedConditions).toContain("qualified_wallet_count");
  });

  it("does not match when score is below threshold", () => {
    const result = engine.evaluate(alphaStrategy, nonMatchingInput);
    expect(result.matched).toBe(false);
    expect(result.unmatchedConditions.length).toBeGreaterThan(0);
  });

  it("returns a score between 0 and 100", () => {
    const result = engine.evaluate(alphaStrategy, matchingInput);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns a confidence between 0 and 1", () => {
    const result = engine.evaluate(alphaStrategy, matchingInput);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("handles partial matches correctly", () => {
    const partial: StrategyEvaluationInput = {
      token_score: 85,
      qualified_wallet_count: 4,
      liquidity_usd: 5000,
      token_age_minutes: 180,
    };
    const result = engine.evaluate(alphaStrategy, partial);
    expect(result.matchedConditions).toContain("token_score");
    expect(result.matchedConditions).toContain("qualified_wallet_count");
    expect(result.unmatchedConditions).toContain("liquidity_usd");
    expect(result.unmatchedConditions).toContain("token_age_minutes");
  });

  it("handles null values as unmatched", () => {
    const nullInput: StrategyEvaluationInput = {
      token_score: null,
      qualified_wallet_count: null,
      liquidity_usd: null,
      token_age_minutes: null,
    };
    const result = engine.evaluate(alphaStrategy, nullInput);
    expect(result.matched).toBe(false);
    expect(result.unmatchedConditions.length).toBe(4);
  });

  it("evaluateAll only returns matched strategies", () => {
    const inactiveStrategy: StrategyConfig = {
      ...alphaStrategy,
      id: "inactive",
      isActive: false,
    };
    const results = engine.evaluateAll([alphaStrategy, inactiveStrategy], matchingInput);
    expect(results.length).toBe(1);
    expect(results[0]!.strategyId).toBe("alpha-alert");
  });

  it("evaluateAll sorts by score descending", () => {
    const lowerThreshold: StrategyConfig = {
      ...alphaStrategy,
      id: "low-thresh",
      alertThreshold: 30,
    };
    const results = engine.evaluateAll([alphaStrategy, lowerThreshold], matchingInput);
    expect(results.length).toBe(2);
    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
  });

  it("createDefaultStrategies returns 4 strategies", () => {
    const strategies = StrategyEngine.createDefaultStrategies();
    expect(strategies.length).toBe(4);
    expect(strategies.find((s) => s.id === "alpha-alert")).toBeDefined();
    expect(strategies.find((s) => s.id === "early-entry")).toBeDefined();
    expect(strategies.find((s) => s.id === "volume-spike")).toBeDefined();
    expect(strategies.find((s) => s.id === "cohort-signal")).toBeDefined();
  });

  it("supports between operator", () => {
    const strategy: StrategyConfig = {
      ...alphaStrategy,
      conditions: [
        { field: "token_score", operator: "between", value: [60, 90], weight: 1 },
      ],
      alertThreshold: 50,
    };
    expect(engine.evaluate(strategy, { token_score: 75 }).matched).toBe(true);
    expect(engine.evaluate(strategy, { token_score: 50 }).matched).toBe(false);
    expect(engine.evaluate(strategy, { token_score: 95 }).matched).toBe(false);
  });

  it("supports in operator", () => {
    const strategy: StrategyConfig = {
      ...alphaStrategy,
      conditions: [
        { field: "risk_level", operator: "in", value: ["low", "medium"], weight: 1 },
      ],
      alertThreshold: 50,
    };
    expect(engine.evaluate(strategy, { risk_level: "low" }).matched).toBe(true);
    expect(engine.evaluate(strategy, { risk_level: "medium" }).matched).toBe(true);
    expect(engine.evaluate(strategy, { risk_level: "critical" }).matched).toBe(false);
  });

  it("strictly enforces legacy minimum fields instead of defaulting them to zero", () => {
    const strategy = toRuntimeStrategyConfig({
      id: "legacy-alpha",
      config: { minScore: 70, minQualifiedWallets: 2 },
    });

    expect(engine.evaluate(strategy, { token_score: 38, qualified_wallet_count: 2 }).matched).toBe(false);
    expect(engine.evaluate(strategy, { token_score: 75, qualified_wallet_count: 1 }).matched).toBe(false);
    expect(engine.evaluate(strategy, { token_score: 75, qualified_wallet_count: 2 }).matched).toBe(true);
  });

  it("does not match an empty persisted strategy", () => {
    const strategy = toRuntimeStrategyConfig({ id: "empty", config: {} });
    expect(engine.evaluate(strategy, { token_score: 100 }).matched).toBe(false);
  });
});
