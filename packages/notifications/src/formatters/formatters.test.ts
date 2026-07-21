import { describe, it, expect } from "vitest";
import { formatTelegramAlert, formatDevLogAlert, generateDeepLinks } from "./index";
import type { AlertData } from "./index";

const baseAlert: AlertData = {
  id: "test-alert-1",
  tokenSymbol: "BONK",
  tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  priority: "high",
  signalScore: 82,
  confidence: 0.78,
  marketCapUsd: 500000,
  liquidityUsd: 25000,
  volume1hUsd: 125000,
  holderCount: 350,
  qualifiedWalletCount: 4,
  tokenAgeMinutes: 15,
  positiveFactors: ["Good liquidity", "Multiple qualified wallets"],
  negativeFactors: ["High concentration"],
  webDeepLink: "http://localhost:3000/tokens/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  telegramDeepLink: "https://t.me/memecoin_bot?start=token_DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  triggeredAt: "2024-01-01T00:00:00.000Z",
};

describe("formatTelegramAlert", () => {
  it("includes token symbol", () => {
    const result = formatTelegramAlert(baseAlert);
    expect(result).toContain("BONK");
  });

  it("includes signal score", () => {
    const result = formatTelegramAlert(baseAlert);
    expect(result).toContain("82/100");
  });

  it("includes confidence", () => {
    const result = formatTelegramAlert(baseAlert);
    expect(result).toContain("0.78");
  });

  it("includes priority emoji for critical", () => {
    const result = formatTelegramAlert({ ...baseAlert, priority: "critical" });
    expect(result).toContain("🔴");
  });

  it("includes priority emoji for high", () => {
    const result = formatTelegramAlert(baseAlert);
    expect(result).toContain("🟠");
  });

  it("includes positive factors", () => {
    const result = formatTelegramAlert(baseAlert);
    expect(result).toContain("Good liquidity");
    expect(result).toContain("Multiple qualified wallets");
  });

  it("includes negative factors", () => {
    const result = formatTelegramAlert(baseAlert);
    expect(result).toContain("High concentration");
  });

  it("includes web deep link", () => {
    const result = formatTelegramAlert(baseAlert);
    expect(result).toContain("localhost:3000/tokens/");
  });

  it("includes market data when available", () => {
    const result = formatTelegramAlert(baseAlert);
    expect(result).toContain("$500.0K");
    expect(result).toContain("$25.0K");
  });
});

describe("formatDevLogAlert", () => {
  it("returns structured object", () => {
    const result = formatDevLogAlert(baseAlert);
    expect(result.alertId).toBe("test-alert-1");
    expect(result.type).toBe("signal_alert");
  });

  it("includes token info", () => {
    const result = formatDevLogAlert(baseAlert);
    expect((result.token as Record<string, unknown>).symbol).toBe("BONK");
  });

  it("includes score", () => {
    const result = formatDevLogAlert(baseAlert);
    expect(result.score).toBe(82);
  });
});

describe("generateDeepLinks", () => {
  it("generates correct web URL", () => {
    const links = generateDeepLinks("abc123", "http://localhost:3000");
    expect(links.webUrl).toBe("http://localhost:3000/tokens/abc123");
  });

  it("generates correct telegram URL", () => {
    const links = generateDeepLinks("abc123", "http://localhost:3000");
    expect(links.telegramUrl).toContain("t.me/memecoin_bot");
    expect(links.telegramUrl).toContain("abc123");
  });
});
