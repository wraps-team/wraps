import { parseAsString, parseAsStringLiteral } from "nuqs";

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
 * The `list` URL state. With `reason`, it is the only review state in the URL:
 * no email, search text or offset is ever written there.
 */
export const reviewListParser =
  parseAsStringLiteral(REVIEW_LISTS).withDefault("recommended");

/**
 * The `reason` URL state: a reason title from the Bounces card, set when a
 * reason is clicked. It narrows the soft and hard lists and is cleared when
 * another tab opens. It names a reason, never an address.
 */
export const reviewReasonParser = parseAsString;

/** The id of the Addresses to review section, scrolled to from a reason. */
export const ADDRESSES_TO_REVIEW_ID = "addresses-to-review";
