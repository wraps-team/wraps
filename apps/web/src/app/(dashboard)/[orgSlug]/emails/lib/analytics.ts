"use client";

import posthog from "posthog-js";

/**
 * Product instrumentation for the emails list (audit finding F10).
 *
 * The page had none: every signal in the audit came from autocapture, so no
 * fix on this page could be measured. These helpers are the deliberate set.
 *
 * Rules for anything added here:
 * - Event names are snake_case, properties are snake_case, matching
 *   `broadcast_sent` (the only pre-existing capture in this tree).
 * - No PII. Recipient addresses and subjects never leave the browser, and a
 *   search term is reported only by its length. Organization identity is
 *   already attached by `posthog.group("organization", ...)` in
 *   `organization-context.tsx`, so it is not repeated on every event.
 */

/** Which of the four honest states the list resolved to. See `list-state.ts`. */
export type EmailsListStateKind =
  | "ok"
  | "error"
  | "empty-filtered"
  | "empty-sandbox"
  | "empty-never-sent";

type ListViewedProps = {
  days: number;
  has_search: boolean;
  row_count: number;
  state: EmailsListStateKind;
  status: string | null;
};

/**
 * Fired once per resolved state, not once per render. Answers F1 and F6: how
 * often is each state actually shown, and does the ~95%-of-orgs-in-a-zero-state
 * figure from the database survive contact with real traffic?
 */
export function captureEmailsListViewed(props: ListViewedProps) {
  posthog.capture("emails_list_viewed", props);
}

/** F3 - is search used at all, and how often does it come back empty? */
export function captureEmailsSearched(props: {
  has_results: boolean;
  query_length: number;
  result_count: number;
}) {
  posthog.capture("emails_searched", props);
}

/** F8 - how much of the observed /emails to /emails churn is filter changes? */
export function captureEmailsFilterChanged(props: {
  control: "days" | "sort" | "status";
  from: string;
  to: string;
}) {
  posthog.capture("emails_filter_changed", props);
}

/** F7 - does an affordance fix move the 29% list-to-detail rate? */
export function captureEmailsRowOpened(props: {
  position: number;
  status: string;
}) {
  posthog.capture("emails_row_opened", props);
}

/**
 * F2 - the row ceiling, measured properly instead of inferred from dead clicks
 * on a disabled button. Paging is a cursor now, so there is no total page count
 * to report: `page_index` is which page was just asked for and `has_more` is
 * whether the server said another one exists. The event name is unchanged so
 * the before/after comparison survives the rework.
 */
export function captureEmailsPageAdvanced(props: {
  has_more: boolean;
  page_index: number;
  row_count: number;
}) {
  posthog.capture("emails_page_next", props);
}

/** F2 - how many silently truncated exports have shipped. */
export function captureEmailsExported(props: {
  row_count: number;
  selection_only: boolean;
  was_truncated: boolean;
}) {
  posthog.capture("emails_exported_csv", props);
}

/** The best-behaved interaction on the page, and the only one with a funnel. */
export function captureEmailsContactsCreated(props: {
  created: number;
  failed: number;
  recipient_count: number;
  skipped: number;
}) {
  posthog.capture("emails_contacts_created", props);
}

/** Did the Retry the error state now offers actually get used? */
export function captureEmailsErrorRetried(props: {
  surface: "table" | "chart";
}) {
  posthog.capture("emails_error_retried", props);
}
