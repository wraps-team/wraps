/**
 * Humanizes the SES health classifier's machine-readable reason codes.
 *
 * The codes come from `classifySesHealth` in the API (`lib/ses-health.ts`),
 * which is the single authority on whether an AWS account is about to lose
 * its ability to send. Every surface that reports that verdict — the header
 * pill, the overview banner — reads these labels, so the wording cannot drift
 * between them.
 */
const REASON_LABELS: Record<string, string> = {
  sending_disabled: "SES has disabled sending",
  bounce_pause: "bounce rate above AWS's pause line",
  bounce_review: "bounce rate above AWS's review line",
  complaint_pause: "complaint rate above AWS's pause line",
  complaint_review: "complaint rate above AWS's review line",
  quota_high: "daily send quota nearly used up",
  enforcement_probation: "AWS enforcement status: PROBATION",
  enforcement_shutdown: "AWS enforcement status: SHUTDOWN",
};

export function humanizeSesHealthReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}
