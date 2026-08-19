/**
 * The one place a chart series gets its colour.
 *
 * Every chart used to hand-write its own `oklch()` light/dark pair, and the
 * pairs drifted: "sent" was `oklch(0.45 0.15 250)` on the analytics page and
 * `oklch(0.55 0.12 250)` on the emails page, "delivered" green existed at hue
 * 145, 155 and 160, and two charts still carried raw `hsl()` literals - one of
 * them `hsl(var(--primary))`, which is not valid CSS at all because `--primary`
 * is an `oklch()` value, so that series rendered with no colour.
 *
 * The values live in `globals.css` as `--series-*` so light/dark stays a theme
 * concern. These are `var()` references rather than literals, which means a
 * `ChartConfig` needs only `color:` - the `theme: { light, dark }` form exists
 * to hand-resolve what the cascade already resolves for us.
 *
 * Roles, not metrics, so a new chart has somewhere to land without inventing a
 * colour.
 */
export const SERIES_COLOR = {
  /** Sends, totals, "how much went out". */
  volume: "var(--series-volume)",
  /** Delivered, active, healthy. */
  success: "var(--series-success)",
  /** Opens, suppression - "look at this", not "this failed". */
  attention: "var(--series-attention)",
  /** Clicks and the rates derived from them. */
  engagement: "var(--series-engagement)",
  /** Bounces, complaints, rejections, failures. */
  failure: "var(--series-failure)",
  /** Inbound, and the second channel in a two-channel chart. */
  secondary: "var(--series-secondary)",
} as const;

export type SeriesRole = keyof typeof SERIES_COLOR;

/**
 * Slice colours for categorical charts (pie, donut), in order.
 *
 * Two components carried their own five-colour array of bare `oklch()` values -
 * one blue-first, one teal-first, neither with a dark variant, so slices kept a
 * light-mode lightness on a dark card. Reusing the series palette keeps a
 * category the same colour as the line that means the same thing, and gets the
 * theme swap for free.
 */
export const SERIES_CATEGORICAL = [
  SERIES_COLOR.volume,
  SERIES_COLOR.success,
  SERIES_COLOR.attention,
  SERIES_COLOR.engagement,
  SERIES_COLOR.failure,
  SERIES_COLOR.secondary,
] as const;
