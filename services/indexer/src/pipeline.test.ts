import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const getDb = vi.fn(() => ({ insert }));
  const add = vi.fn().mockResolvedValue({ id: "job-1" });
  const createRawEventProcessingQueue = vi.fn(() => ({ add }));

  return {
    insertValues,
    insert,
    getDb,
    add,
    createRawEventProcessingQueue,
  };
});

vi.mock("@memecoin/database", async () => {
  const actual = await vi.importActual<typeof import("@memecoin/database")>("@memecoin/database");
  return {
    ...actual,
    getDb: mocks.getDb,
  };
});

vi.mock("@memecoin/queue", async () => {
  const actual = await vi.importActual<typeof import("@memecoin/queue")>("@memecoin/queue");
  return {
    ...actual,
    createRawEventProcessingQueue: mocks.createRawEventProcessingQueue,
  };
});

import { ingestRawTokenEvent, runIngestionPipeline } from "./pipeline.js";

describe("ingestion pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores a raw provider event for development ingestion", async () => {
    const eventId = await ingestRawTokenEvent({
      tokenAddress: "Mint111111111111111111111111111111111111111",
      symbol: "TEST",
      name: "Test Token",
      decimals: 9,
      deployer: "Deployer11111111111111111111111111111111111",
      initialLiquidity: 15000,
      timestamp: "2026-07-26T12:00:00.000Z",
    });

    expect(eventId).toBeTruthy();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      id: eventId,
      provider: "development",
      eventType: "token_launch",
      processingStatus: "pending",
      txSignature: expect.stringMatching(/^dev-tx-/),
      rawJson: expect.objectContaining({
        tokenAddress: "Mint111111111111111111111111111111111111111",
        symbol: "TEST",
      }),
    }));
  });

  it("queues raw event processing instead of running workers inline", async () => {
    const result = await runIngestionPipeline({
      tokenAddress: "Mint111111111111111111111111111111111111111",
      symbol: "TEST",
      name: "Test Token",
      decimals: 9,
      deployer: "Deployer11111111111111111111111111111111111",
      initialLiquidity: 15000,
      timestamp: "2026-07-26T12:00:00.000Z",
    });

    expect(mocks.createRawEventProcessingQueue).toHaveBeenCalledTimes(1);
    expect(mocks.add).toHaveBeenCalledWith(
      "process-pending-raw-events",
      expect.objectContaining({
        eventId: result.eventId,
        limit: 25,
        trigger: "ingest",
      }),
    );
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      queueName: "raw-event-processing",
      jobType: "process-pending-raw-events",
      bullJobId: "job-1",
    }));

    expect(result).toEqual({
      eventId: result.eventId,
      processing: {
        mode: "queue",
        queued: 1,
        jobId: "job-1",
        processed: 0,
        failed: 0,
      },
      delivery: {
        mode: "queue",
        queued: 0,
        jobId: null,
        delivered: 0,
        failed: 0,
      },
    });
  });
});
