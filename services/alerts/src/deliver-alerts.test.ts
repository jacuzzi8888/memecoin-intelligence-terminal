import { describe, expect, it, vi } from "vitest";
import { deliverPendingAlerts, type AlertsRepository } from "./deliver-alerts.js";

function createRepository(overrides: Partial<AlertsRepository> = {}): AlertsRepository {
  return {
    getPendingAlerts: vi.fn().mockResolvedValue([]),
    getSignalFactors: vi.fn().mockResolvedValue([]),
    getAlertDestinations: vi.fn().mockResolvedValue([{ channel: "dev_outbox", destination: "log", priorityMin: "info" }]),
    insertAlertDelivery: vi.fn().mockResolvedValue(undefined),
    markAlertDelivered: vi.fn().mockResolvedValue(undefined),
    markAlertFailed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("deliverPendingAlerts", () => {
  it("creates a dev delivery for pending alerts", async () => {
    const repository = createRepository({
      getPendingAlerts: vi.fn().mockResolvedValue([
        {
          id: "alert-1",
          tokenAddress: "Mint111111111111111111111111111111111111111",
          priority: "high",
          signalScore: 77,
          title: "Signal created",
          webDeepLink: "http://localhost:3000/tokens/Mint111111111111111111111111111111111111111",
          telegramDeepLink: "https://t.me/example",
          triggeredAt: new Date(),
          tokenSymbol: "TEST",
          confidence: "0.8",
          signalId: "signal-1",
        },
      ]),
      getSignalFactors: vi.fn().mockResolvedValue([
        { factorType: "positive", factorName: "liquidity", rawValue: "15000" },
      ]),
    });

    const result = await deliverPendingAlerts({ repository });

    expect(result).toEqual({ delivered: 1, failed: 0 });
    expect(repository.insertAlertDelivery).toHaveBeenCalledTimes(1);
    expect(repository.markAlertDelivered).toHaveBeenCalledWith("alert-1");
  });

  it("marks failed deliveries when repository operations throw", async () => {
    const repository = createRepository({
      getPendingAlerts: vi.fn().mockResolvedValue([
        {
          id: "alert-2",
          tokenAddress: "Mint111111111111111111111111111111111111111",
          priority: "high",
          signalScore: 77,
          title: "Signal created",
          webDeepLink: "http://localhost:3000/tokens/Mint111111111111111111111111111111111111111",
          telegramDeepLink: null,
          triggeredAt: new Date(),
          tokenSymbol: "TEST",
          confidence: "0.8",
          signalId: "signal-2",
        },
      ]),
      getSignalFactors: vi.fn().mockRejectedValue(new Error("boom")),
    });

    const result = await deliverPendingAlerts({ repository });

    expect(result).toEqual({ delivered: 0, failed: 1 });
    expect(repository.markAlertFailed).toHaveBeenCalledWith("alert-2", expect.any(Error));
  });
});
