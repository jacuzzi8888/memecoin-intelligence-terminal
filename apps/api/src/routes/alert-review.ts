export type AlertReviewRecommendation = {
  verdict: "likely_valid" | "likely_false_positive" | "pending_evidence";
  reason: string;
};

export function reviewRecommendation(
  outcomes: Array<{ outcomeType: string; outcomeValue: number | null }>,
): AlertReviewRecommendation {
  const return24h = outcomes.find((outcome) => outcome.outcomeType === "return_24h_pct")?.outcomeValue ?? null;
  const mae24h = outcomes.find((outcome) => outcome.outcomeType === "mae_24h_pct")?.outcomeValue ?? null;

  if (return24h === null || !Number.isFinite(return24h)) {
    return { verdict: "pending_evidence", reason: "A complete 24-hour outcome is not available yet." };
  }
  if ((mae24h !== null && mae24h <= -25) || return24h <= 0) {
    return { verdict: "likely_false_positive", reason: "The alert did not produce positive 24-hour follow-through or experienced a deep drawdown." };
  }
  return { verdict: "likely_valid", reason: "The alert produced positive 24-hour follow-through; review the context before accepting it." };
}
