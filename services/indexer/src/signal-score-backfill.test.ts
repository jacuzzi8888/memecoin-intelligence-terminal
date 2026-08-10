import { describe, expect, it } from "vitest";
import { calculateSignalScore } from "@memecoin/intelligence";
import { buildBackfillScoreInput } from "./signal-score-backfill.js";

describe("buildBackfillScoreInput", () => {
  it("reconstructs the score input from snapshot and stored evidence", () => {
    const input = buildBackfillScoreInput({
      detectedAt: new Date("2026-08-10T01:00:00.000Z"),
      firstSeenAt: new Date("2026-08-10T00:55:00.000Z"),
      snapshot: {
        liquidityUsd: "0",
        volume1hUsd: "22000",
        holderCount: null,
        qualifiedWalletCount: null,
      },
      metadata: {
        holderEvidence: { topHolderConcentrationPct: null },
        walletEvidence: { qualifiedWalletCount: null },
      },
    });

    expect(input).toMatchObject({
      tokenAge: 5,
      liquidityUsd: 0,
      volume1hUsd: 22_000,
      holderCount: null,
      qualifiedWalletCount: null,
    });
    expect(calculateSignalScore(input).score).toBe(38);
  });

  it("prefers snapshot wallet evidence and preserves zero values", () => {
    const input = buildBackfillScoreInput({
      detectedAt: new Date("2026-08-10T01:00:00.000Z"),
      firstSeenAt: null,
      snapshot: {
        liquidityUsd: "10000",
        volume1hUsd: "0",
        holderCount: 0,
        qualifiedWalletCount: 0,
      },
      metadata: {
        walletEvidence: { qualifiedWalletCount: 4 },
      },
    });

    expect(input.qualifiedWalletCount).toBe(0);
    expect(input.holderCount).toBe(0);
    expect(input.tokenAge).toBeNull();
  });
});
