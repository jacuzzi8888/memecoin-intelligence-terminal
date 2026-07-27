import { describe, expect, it, vi } from "vitest";
import {
  processPendingRawEvents,
  type RawEventProcessorRepository,
} from "./raw-event-processor.js";

function createRepository(overrides: Partial<RawEventProcessorRepository> = {}): RawEventProcessorRepository {
  return {
    getPendingTokenLaunchEvents: vi.fn().mockResolvedValue([]),
    findTokenByAddress: vi.fn().mockResolvedValue({ id: "token-1" }),
    insertToken: vi.fn().mockResolvedValue(undefined),
    insertTokenLaunch: vi.fn().mockResolvedValue(undefined),
    insertNormalisedTokenEvent: vi.fn().mockResolvedValue(undefined),
    getActiveStrategies: vi.fn().mockResolvedValue([{ id: "strategy-1", config: {} }]),
    insertSignal: vi.fn().mockResolvedValue(undefined),
    insertSignalFactor: vi.fn().mockResolvedValue(undefined),
    insertAlert: vi.fn().mockResolvedValue(undefined),
    markRawEventProcessed: vi.fn().mockResolvedValue(undefined),
    markRawEventFailed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("processPendingRawEvents", () => {
  it("creates signals and alerts from pending raw token launch events", async () => {
    const repository = createRepository({
      getPendingTokenLaunchEvents: vi.fn().mockResolvedValue([
        {
          id: "raw-1",
          provider: "development",
          txSignature: "sig-1",
          rawJson: {
            tokenAddress: "Mint111111111111111111111111111111111111111",
            symbol: "TEST",
            name: "Test Token",
            decimals: 9,
            deployer: "Deployer11111111111111111111111111111111111",
            initialLiquidity: 15000,
            timestamp: new Date(Date.now() - 300000).toISOString(),
          },
        },
      ]),
      getActiveStrategies: vi.fn().mockResolvedValue([
        { id: "strategy-1", config: { minScore: 10 } },
      ]),
    });

    const result = await processPendingRawEvents({
      appUrl: "http://localhost:3000",
      repository,
    });

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(repository.insertNormalisedTokenEvent).toHaveBeenCalledTimes(1);
    expect(repository.insertSignal).toHaveBeenCalledTimes(1);
    expect(repository.insertAlert).toHaveBeenCalledTimes(1);
    expect(repository.markRawEventProcessed).toHaveBeenCalledWith("raw-1");
  });

  it("records failures for invalid raw payloads", async () => {
    const repository = createRepository({
      getPendingTokenLaunchEvents: vi.fn().mockResolvedValue([
        {
          id: "raw-2",
          provider: "development",
          txSignature: null,
          rawJson: {
            tokenAddress: "Mint111111111111111111111111111111111111111",
          },
        },
      ]),
    });

    const result = await processPendingRawEvents({
      appUrl: "http://localhost:3000",
      repository,
    });

    expect(result).toEqual({ processed: 0, failed: 1 });
    expect(repository.markRawEventFailed).toHaveBeenCalledTimes(1);
    expect(repository.insertAlert).not.toHaveBeenCalled();
  });
});
