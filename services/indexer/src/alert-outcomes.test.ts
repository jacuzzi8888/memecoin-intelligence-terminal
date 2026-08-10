import { describe, expect, it } from "vitest";
import { getPathOutcome } from "./alert-outcomes.js";

const at = (minutes: number) => new Date(Date.UTC(2026, 7, 2, 12, minutes));

describe("getPathOutcome", () => {
  it("measures maximum adverse excursion and upside from price snapshots", () => {
    const result = getPathOutcome(
      { tokenAddress: "token", priceUsd: "1", marketCapUsd: "100", snapshotAt: at(0) },
      [
        { tokenAddress: "token", priceUsd: "0.5", marketCapUsd: "50", snapshotAt: at(10) },
        { tokenAddress: "token", priceUsd: "2", marketCapUsd: "200", snapshotAt: at(20) },
      ],
    );

    expect(result).toMatchObject({
      metric: "priceUsd",
      baselineValue: 1,
      maePct: -50,
      maxReturnPct: 100,
    });
  });

  it("falls back to market cap when price data is unavailable", () => {
    const result = getPathOutcome(
      { tokenAddress: "token", priceUsd: null, marketCapUsd: "100", snapshotAt: at(0) },
      [{ tokenAddress: "token", priceUsd: null, marketCapUsd: "80", snapshotAt: at(10) }],
    );

    expect(result).toMatchObject({
      metric: "marketCapUsd",
      baselineValue: 100,
      maePct: -20,
      maxReturnPct: -20,
    });
  });
});
