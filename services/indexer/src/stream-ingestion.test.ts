import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const where = vi.fn(() => ({
    limit: vi.fn().mockResolvedValue([]),
  }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const getDb = vi.fn(() => ({ select }));
  const runIngestionPipeline = vi.fn().mockResolvedValue({
    eventId: "event-1",
    processing: { mode: "queue", queued: 1, jobId: "job-1", processed: 0, failed: 0 },
    delivery: { mode: "queue", queued: 0, jobId: null, delivered: 0, failed: 0 },
  });

  return {
    where,
    from,
    select,
    getDb,
    runIngestionPipeline,
  };
});

vi.mock("@memecoin/database", async () => {
  const actual = await vi.importActual<typeof import("@memecoin/database")>("@memecoin/database");
  return {
    ...actual,
    getDb: mocks.getDb,
  };
});

vi.mock("./pipeline.js", async () => {
  const actual = await vi.importActual<typeof import("./pipeline.js")>("./pipeline.js");
  return {
    ...actual,
    runIngestionPipeline: mocks.runIngestionPipeline,
  };
});

import { processStreamEvent } from "./stream-ingestion.js";

describe("processStreamEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockReturnValue({
      limit: vi.fn().mockResolvedValue([]),
    });
  });

  it("turns a streamed token transaction into queued ingestion work", async () => {
    const registry: any = {
      transactionStream: { name: "helius-stream" },
      tokenDiscovery: {
        getTokenInfo: vi.fn().mockResolvedValue({
          address: "Mint111111111111111111111111111111111111111",
          symbol: "TEST",
          name: "Test Token",
          decimals: 9,
        }),
      },
    };

    const handled = await processStreamEvent({
      type: "transaction",
      signature: "sig-1",
      slot: 123,
      timestamp: 1785076800,
      data: {
        transaction: {
          message: {
            accountKeys: [{ pubkey: "Deployer11111111111111111111111111111111111" }],
          },
          meta: {
            postTokenBalances: [{
              mint: "Mint111111111111111111111111111111111111111",
              uiTokenAmount: { decimals: 9 },
            }],
          },
        },
      },
    }, registry);

    expect(handled).toBe(true);
    expect(mocks.runIngestionPipeline).toHaveBeenCalledWith(expect.objectContaining({
      tokenAddress: "Mint111111111111111111111111111111111111111",
      symbol: "TEST",
      name: "Test Token",
      deployer: "Deployer11111111111111111111111111111111111",
    }), {
      provider: "helius-stream",
      txSignature: "sig-1",
    });
  });
});
