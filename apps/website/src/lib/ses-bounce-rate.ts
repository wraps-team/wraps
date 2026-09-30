// SES bounce and complaint rate estimate. Client-side only, no network.
//
// Thresholds come from AWS's sending review FAQ
// (https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html) as quoted
// on apps/website/src/app/ses/bounce-rate/page.tsx (best practice 2%, review
// at 5% or greater, pause at 10% or greater) and
// apps/website/src/app/ses/complaint-rate/page.tsx (best practice and review
// at 0.1% or greater, pause at 0.5% or greater). Re-verify against those pages
// if AWS changes them. Review and pause comparisons are >=.
//
// Thresholds are stored in basis points (1 bp = 0.01%) so the comparisons use
// integer math and never trip on floating point (0.07 * 100 !== 7).

export type RateThresholds = {
  bestPracticeBp: number;
  reviewBp: number;
  pauseBp: number;
};

export const BOUNCE_THRESHOLDS: RateThresholds = {
  bestPracticeBp: 200,
  reviewBp: 500,
  pauseBp: 1000,
};

export const COMPLAINT_THRESHOLDS: RateThresholds = {
  bestPracticeBp: 10,
  reviewBp: 10,
  pauseBp: 50,
};

export type RateStatus =
  | "within-best-practice"
  | "above-best-practice"
  | "review"
  | "pause";

export type MetricResult = {
  count: number;
  /** Percent, e.g. 4.9 for 4.9%. */
  ratePercent: number;
  status: RateStatus;
  /** Events at which the rate first reaches the review line. */
  countAtReview: number;
  countAtPause: number;
  /** How many more events at the current volume before the review line. */
  headroomToReview: number;
  headroomToPause: number;
};

export type SesRateEstimate = {
  sends: number;
  bounce: MetricResult;
  complaint: MetricResult;
  /** Shown separately: SES does not count these toward the bounce rate. */
  softBounces: number;
  /** True when hard bounces or complaints exceed sends. */
  inconsistent: boolean;
};

export type SesRateInput = {
  sends: number;
  hardBounces: number;
  softBounces: number;
  complaints: number;
};

function wholeNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function countAtRate(bp: number, sends: number): number {
  return Math.ceil((bp * sends) / 10_000);
}

function statusFor(
  count: number,
  sends: number,
  thresholds: RateThresholds
): RateStatus {
  const scaled = count * 10_000;
  if (scaled >= thresholds.pauseBp * sends) {
    return "pause";
  }
  if (scaled >= thresholds.reviewBp * sends) {
    return "review";
  }
  if (scaled >= thresholds.bestPracticeBp * sends) {
    return "above-best-practice";
  }
  return "within-best-practice";
}

function metric(
  count: number,
  sends: number,
  thresholds: RateThresholds
): MetricResult {
  const countAtReview = countAtRate(thresholds.reviewBp, sends);
  const countAtPause = countAtRate(thresholds.pauseBp, sends);
  return {
    count,
    ratePercent: (count / sends) * 100,
    status: statusFor(count, sends, thresholds),
    countAtReview,
    countAtPause,
    headroomToReview: Math.max(0, countAtReview - count),
    headroomToPause: Math.max(0, countAtPause - count),
  };
}

/**
 * Estimate only. AWS counts hard bounces to unverified domains over a
 * representative volume it does not publish, so nobody can recompute its exact
 * number. Returns null when there are no sends.
 */
export function estimateSesRates(input: SesRateInput): SesRateEstimate | null {
  const sends = wholeNumber(input.sends);
  if (sends === 0) {
    return null;
  }
  const hardBounces = wholeNumber(input.hardBounces);
  const complaints = wholeNumber(input.complaints);
  return {
    sends,
    bounce: metric(hardBounces, sends, BOUNCE_THRESHOLDS),
    complaint: metric(complaints, sends, COMPLAINT_THRESHOLDS),
    softBounces: wholeNumber(input.softBounces),
    inconsistent: hardBounces > sends || complaints > sends,
  };
}
