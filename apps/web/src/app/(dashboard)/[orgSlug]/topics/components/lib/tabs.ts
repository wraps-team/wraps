import { parseAsStringLiteral } from "nuqs";

/** The `?tab=` values for /topics. Existing links depend on these strings. */
export const TOPICS_TABS = [
  "list",
  "double-opt-in",
  "preference-center",
] as const;

export type TopicsTab = (typeof TOPICS_TABS)[number];

export const TOPICS_TAB_LABEL: Record<TopicsTab, string> = {
  list: "Topics",
  "double-opt-in": "Double Opt-In",
  "preference-center": "Preference Center",
};

/** Ids are `${TOPICS_TAB_ID_PREFIX}-${tab}`, so a panel can name its tab. */
export const TOPICS_TAB_ID_PREFIX = "topics-tab";

/**
 * The `tab` URL state. The tabs and the Create Topic action share this one
 * definition, so they agree on the default, and a bogus `?tab=` falls back to
 * the list instead of a blank page.
 */
export const topicsTabParser =
  parseAsStringLiteral(TOPICS_TABS).withDefault("list");
