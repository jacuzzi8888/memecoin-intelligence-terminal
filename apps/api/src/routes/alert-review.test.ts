import { describe, expect, it } from "vitest";
import { reviewRecommendation } from "./alert-review.js";

describe("alert review recommendations", () => {
  it("waits for a complete outcome before suggesting a verdict", () => {
    expect(reviewRecommendation([]).verdict).toBe("pending_evidence");
  });

  it("flags negative follow-through as likely false positive", () => {
    expect(reviewRecommendation([{ outcomeType: "return_24h_pct", outcomeValue: -4 }]).verdict)
      .toBe("likely_false_positive");
  });

  it("keeps positive outcomes reviewable rather than auto-accepting them", () => {
    expect(reviewRecommendation([{ outcomeType: "return_24h_pct", outcomeValue: 12 }].concat([{ outcomeType: "mae_24h_pct", outcomeValue: -4 }])).verdict)
      .toBe("likely_valid");
  });
});
