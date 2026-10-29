import { parseAsStringLiteral } from "nuqs";

/** The lists the Addresses to review panel shows, in tab order. */
export const REVIEW_LISTS = [
  "recommended",
  "soft",
  "hard",
  "complaint",
  "suppressed",
] as const;

export type ReviewListParam = (typeof REVIEW_LISTS)[number];

/**
 * The `list` URL state. It is the only review param in the URL: no email,
 * search text or offset is ever written there.
 */
export const reviewListParser =
  parseAsStringLiteral(REVIEW_LISTS).withDefault("recommended");
