import { parseAsStringLiteral } from "nuqs";

/** The metrics the deliverability views show, in toggle order. */
export const DELIVERABILITY_METRICS = [
  "bounce",
  "complaint",
  "suppression",
] as const;

/**
 * The `metric` URL state. The card and the causes panel read it with this one
 * definition, so the two never disagree about its default.
 */
export const metricParam = parseAsStringLiteral(
  DELIVERABILITY_METRICS
).withDefault("bounce");
