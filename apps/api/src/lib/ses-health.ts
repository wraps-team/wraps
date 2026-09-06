/**
 * SES health classifier: a pure module that turns the numbers the
 * account-health sweep already reads (SendingEnabled, EnforcementStatus,
 * CloudWatch reputation rates, quota usage) into a verdict the dashboard can
 * show without re-reading AWS.
 *
 * No AWS SDK, no `db`, no logging, no `Date.now()` — everything it needs is
 * passed in, so it is trivially unit-testable and safe to import from any
 * package without pulling in AWS credentials or a database connection.
 */

/**
 * AWS SES enforcement thresholds. These are AWS's numbers, not ours, and they
 * are the reason this product exists: crossing the review line starts a manual
 * AWS review, crossing the pause line stops your mail.
 *
 * Rates are DECIMALS (0–1) to match what CloudWatch's Reputation.* metrics
 * return, so nothing has to convert on the comparison path.
 */
export const SES_THRESHOLDS = {
  bounce: { review: 0.05, pause: 0.1 },
  complaint: { review: 0.001, pause: 0.005 },
  /** Not an AWS enforcement line — the point at which running out matters. */
  quotaWarnRatio: 0.8,
} as const;

export type SesHealthStatus = "healthy" | "at_risk" | "in_danger";

export type SesHealthInput = {
  sendingEnabled: boolean | null;
  enforcementStatus: string | null;
  bounceRate: number | null;
  complaintRate: number | null;
  quotaUsedRatio: number | null;
};

export type SesHealthVerdict = {
  status: SesHealthStatus;
  reasons: string[];
};

/**
 * Classifies the current SES health signals for a single account.
 *
 * `reasons` accumulates every rule that fired, worst tier first; `status` is
 * the worst tier reached. A `null` rate simply does not fire its rule — a
 * brand-new account with no published metrics is not unhealthy, it is
 * unmeasured (represented at the database layer by `healthStatus` being NULL,
 * never by a status value returned from here).
 */
export function classifySesHealth(input: SesHealthInput): SesHealthVerdict {
  const dangerReasons: string[] = [];
  const riskReasons: string[] = [];

  if (input.sendingEnabled === false) {
    dangerReasons.push("sending_disabled");
  }
  if (
    input.enforcementStatus !== null &&
    input.enforcementStatus !== "HEALTHY" &&
    input.enforcementStatus !== "PROBATION"
  ) {
    dangerReasons.push(`enforcement_${input.enforcementStatus.toLowerCase()}`);
  }
  if (
    input.bounceRate !== null &&
    input.bounceRate >= SES_THRESHOLDS.bounce.pause
  ) {
    dangerReasons.push("bounce_pause");
  }
  if (
    input.complaintRate !== null &&
    input.complaintRate >= SES_THRESHOLDS.complaint.pause
  ) {
    dangerReasons.push("complaint_pause");
  }

  if (input.enforcementStatus === "PROBATION") {
    riskReasons.push("enforcement_probation");
  }
  if (
    input.bounceRate !== null &&
    input.bounceRate >= SES_THRESHOLDS.bounce.review
  ) {
    riskReasons.push("bounce_review");
  }
  if (
    input.complaintRate !== null &&
    input.complaintRate >= SES_THRESHOLDS.complaint.review
  ) {
    riskReasons.push("complaint_review");
  }
  if (
    input.quotaUsedRatio !== null &&
    input.quotaUsedRatio >= SES_THRESHOLDS.quotaWarnRatio
  ) {
    riskReasons.push("quota_high");
  }

  if (dangerReasons.length > 0) {
    return { status: "in_danger", reasons: [...dangerReasons, ...riskReasons] };
  }
  if (riskReasons.length > 0) {
    return { status: "at_risk", reasons: riskReasons };
  }
  return { status: "healthy", reasons: [] };
}

/**
 * Multi-account rollup. `unknown` represents an account no completed sweep has
 * ever written a verdict for (healthStatus IS NULL), and it deliberately
 * outranks `healthy`: an org where one account has never been checked is not
 * entitled to a green badge.
 *
 * Exported — not inlined into a caller — because plan 218 serves the same
 * rollup through the public API and must not re-implement this ordering.
 */
export type SesHealthRollupStatus = SesHealthStatus | "unknown";

export const SES_STATUS_RANK: Record<SesHealthRollupStatus, number> = {
  in_danger: 3,
  at_risk: 2,
  unknown: 1,
  healthy: 0,
};

/** Worst status wins. An empty list rolls up to "unknown". */
export function rollUpSesHealth(
  statuses: Array<SesHealthStatus | null>
): SesHealthRollupStatus {
  if (statuses.length === 0) {
    return "unknown";
  }
  let worst: SesHealthRollupStatus = "healthy";
  for (const status of statuses) {
    const candidate: SesHealthRollupStatus = status ?? "unknown";
    if (SES_STATUS_RANK[candidate] > SES_STATUS_RANK[worst]) {
      worst = candidate;
    }
  }
  return worst;
}
