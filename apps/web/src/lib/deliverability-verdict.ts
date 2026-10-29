import { formatThreshold, SES_THRESHOLDS } from "@/lib/ses-thresholds";

/** Below this many window sends a single bounce moves the rate too far to rate. */
export const MIN_SENDS_FOR_VERDICT = 100;

export type VerdictLevel =
  | "healthy"
  | "watch"
  | "risk"
  | "unknown"
  | "insufficient"
  | "none";

export type Verdict = {
  level: VerdictLevel;
  label: string;
  sentence: string;
  /** The metric that set the level. Bounce wins a tie. */
  worst: "bounce" | "complaint" | null;
};

type RatedLevel = "healthy" | "watch" | "risk";

const RANK: Record<RatedLevel, number> = { healthy: 0, watch: 1, risk: 2 };

function rate(value: number, review: number): RatedLevel {
  // `value` is a percentage (2.6 = 2.6%); the review lines are decimals.
  const decimal = value / 100;
  if (decimal >= review) {
    return "risk";
  }
  if (decimal >= review / 2) {
    return "watch";
  }
  return "healthy";
}

/**
 * Grades the account's deliverability from SES's published reputation rates.
 *
 * `bounceRate` and `complaintRate` are percentages, as the overview route
 * returns them (2.6 = 2.6%), and must be the SES account reputation, not the
 * window's rates. `sends` is the window's `totalSent` (null while loading);
 * `rangeLabel` reads as "the last ${rangeLabel}", e.g. "30 days".
 */
export function deliverabilityVerdict(input: {
  bounceRate: number | null;
  complaintRate: number | null;
  sends: number | null;
  rangeLabel: string;
}): Verdict {
  const { bounceRate, complaintRate, sends, rangeLabel } = input;

  if (sends === 0) {
    return {
      level: "none",
      label: "—",
      sentence: `Nothing sent in the last ${rangeLabel}. Deliverability appears here once you start sending.`,
      worst: null,
    };
  }

  if (sends !== null && sends < MIN_SENDS_FOR_VERDICT) {
    return {
      level: "insufficient",
      label: "Not rated",
      sentence: `Not enough sends to judge. You sent ${sends} emails in the last ${rangeLabel}, and one bounce moves the rate by ${Math.round(100 / sends)} points. Ratings start at ${MIN_SENDS_FOR_VERDICT} sends.`,
      worst: null,
    };
  }

  const bounce =
    bounceRate === null ? null : rate(bounceRate, SES_THRESHOLDS.bounce.review);
  const complaint =
    complaintRate === null
      ? null
      : rate(complaintRate, SES_THRESHOLDS.complaint.review);

  if (bounce === null && complaint === null) {
    return {
      level: "unknown",
      label: "Not rated",
      sentence: "SES has not published a reputation rate for this account yet.",
      worst: null,
    };
  }

  // Bounce is checked first, so it wins a tie.
  let worst: "bounce" | "complaint" = "bounce";
  let level: RatedLevel = bounce ?? "healthy";
  if (
    complaint !== null &&
    (bounce === null || RANK[complaint] > RANK[bounce])
  ) {
    worst = "complaint";
    level = complaint;
  }

  if (level === "risk") {
    const line = formatThreshold(SES_THRESHOLDS[worst].review);
    return {
      level: "risk",
      label: "At risk",
      sentence: `Your ${worst} rate is at or over the SES review line (${line}). SES may start an account review.`,
      worst,
    };
  }
  if (level === "watch") {
    const line = formatThreshold(SES_THRESHOLDS[worst].review);
    return {
      level: "watch",
      label: "Watch",
      sentence: `Your ${worst} rate is past half of the SES review line (${line}).`,
      worst,
    };
  }
  return {
    level: "healthy",
    label: "Healthy",
    sentence:
      "Bounce and complaint rates are well under half of the SES review lines.",
    worst,
  };
}
