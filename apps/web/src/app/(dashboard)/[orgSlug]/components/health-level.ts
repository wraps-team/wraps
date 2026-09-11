/**
 * How the overview banner resolves many channel verdicts into the one line at
 * the top of the page. Pure — no React, no hooks — so the rule that matters
 * most here can be tested exhaustively: nothing measured is never reported as
 * healthy.
 */

export type HealthLevel = "healthy" | "warning" | "critical" | "unknown";

/** `SesHealthResponse.status` from the hourly account-health sweep. */
export const SES_STATUS_LEVEL: Record<string, HealthLevel> = {
  healthy: "healthy",
  at_risk: "warning",
  in_danger: "critical",
  unknown: "unknown",
};

export function getOverallLevel(levels: HealthLevel[]): HealthLevel {
  if (levels.includes("critical")) {
    return "critical";
  }
  if (levels.includes("warning")) {
    return "warning";
  }
  // Deliberately above "healthy": an account nobody has managed to check is
  // exactly the account most likely to be in trouble, so it must never be
  // reported as fine. Same principle `aws_account.healthStatus` is documented
  // with, where NULL renders as "unknown" and never as healthy.
  if (levels.includes("unknown")) {
    return "unknown";
  }
  return "healthy";
}

/**
 * The banner's headline level.
 *
 * Both "still loading" and "no channels reported anything" resolve to
 * `unknown` rather than the green default this banner used to fall back to:
 * an empty channel list means nothing has been measured, which is not the
 * same claim as nothing being wrong.
 */
export function getBannerLevel(
  levels: HealthLevel[],
  isLoading: boolean
): HealthLevel {
  if (isLoading || levels.length === 0) {
    return "unknown";
  }
  return getOverallLevel(levels);
}
