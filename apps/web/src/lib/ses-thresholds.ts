/**
 * AWS SES enforcement thresholds, and the geometry for drawing a rate against
 * them.
 *
 * Mirrors `SES_THRESHOLDS` in apps/api/src/lib/ses-health.ts, which is the
 * source of truth and the module the hourly sweep classifies with. apps/web
 * cannot import from apps/api; if the numbers change there, change them here.
 * `__tests__/ses-thresholds.test.ts` pins them so a silent divergence fails.
 *
 * These are AWS's numbers, not ours: crossing the review line starts a manual
 * AWS review, crossing the pause line stops your mail. Rates are DECIMALS
 * (0–1), matching what CloudWatch returns and what the sweep stores.
 */
export const SES_THRESHOLDS = {
  bounce: { review: 0.05, pause: 0.1 },
  complaint: { review: 0.001, pause: 0.005 },
  /** Not an AWS enforcement line — the point at which running out matters. */
  quotaWarnRatio: 0.8,
} as const;

export type MeterLevel = "ok" | "review" | "pause";

export type MeterGeometry = {
  /** Bar fill, 0–100, clamped so an over-pause rate still renders. */
  valuePct: number;
  /** Where to draw the review tick, 0–100. */
  reviewPct: number;
  /** Where to draw the pause tick, 0–100. */
  pausePct: number;
  level: MeterLevel;
};

/**
 * Lays out one rate against its review and pause lines.
 *
 * The scale runs to 125% of the pause line rather than to 100% of the rate's
 * own range: a bounce rate is enforced at 10%, so a bar scaled 0–100% would
 * render every healthy account as an invisible sliver and put both lines in
 * the last tenth. Ending just past the pause line keeps the two lines legible
 * and still leaves room to show a rate that has crossed it.
 */
export function meterGeometry(
  value: number,
  review: number,
  pause: number
): MeterGeometry {
  const scaleMax = pause * 1.25;
  const pct = (n: number) => Math.min(100, Math.max(0, (n / scaleMax) * 100));

  let level: MeterLevel = "ok";
  if (value >= pause) {
    level = "pause";
  } else if (value >= review) {
    level = "review";
  }

  return {
    valuePct: pct(value),
    reviewPct: pct(review),
    pausePct: pct(pause),
    level,
  };
}

/** `0.0213` -> `"2.13%"`. Rates this small need the decimals to mean anything. */
export function formatRate(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * A threshold label, with trailing zeros dropped: `0.05` -> `"5%"`, not
 * `"5.00%"`. These sit under every meter, so the noise compounds — and AWS
 * states them as "5%" and "0.1%", which is how an operator will recognise
 * them.
 */
export function formatThreshold(value: number): string {
  return `${Number((value * 100).toFixed(3))}%`;
}
