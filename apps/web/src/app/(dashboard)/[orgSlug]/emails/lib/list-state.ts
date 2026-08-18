import type { EmailsListStateKind } from "./analytics";

export type EmailsListStateInput = {
  /** The selected window, in days. Only ever mentioned by the filtered state. */
  days: number;
  /** Does this organization have any email send on record, in any window? */
  hasEverSent: boolean;
  isError: boolean;
  rowCount: number;
  /** `true` in the SES sandbox, `false` in production, `null` never scanned. */
  sandboxStatus: boolean | null;
  search?: string;
  status?: string;
};

/**
 * Decides which of four states the emails list is actually in (audit F1 + F6).
 *
 * All four used to collapse into one sentence - "No emails found / Try
 * adjusting the time range or send your first email" - which was measured
 * being shown to 4 users across 579 failed fetches. It told them, as a
 * statement of fact about their data, that they had no email history, and then
 * blamed a filter.
 *
 * Order matters:
 * 1. A failure is never an empty result. It outranks everything.
 * 2. Rows on screen means there is nothing to explain.
 * 3. An active search or status filter explains the gap by itself.
 * 4. Sends exist but not in this window - also a filter problem, just the
 *    time range rather than an explicit control.
 * 5. Sandbox before never-sent: for an org AWS will reject, "send your first
 *    email" is advice that cannot be followed.
 */
export function resolveEmailsListState(
  input: EmailsListStateInput
): EmailsListStateKind {
  if (input.isError) {
    return "error";
  }
  if (input.rowCount > 0) {
    return "ok";
  }
  if (input.search || input.status) {
    return "empty-filtered";
  }
  if (input.hasEverSent) {
    return "empty-filtered";
  }
  if (input.sandboxStatus === true) {
    return "empty-sandbox";
  }
  return "empty-never-sent";
}

export const TIME_RANGE_DAYS = [1, 7, 30, 90] as const;

/** The next window up from the current one, or null at the widest. */
export function nextWiderRange(days: number): number | null {
  return TIME_RANGE_DAYS.find((d) => d > days) ?? null;
}

export function rangeLabel(days: number): string {
  if (days === 1) {
    return "the last 24 hours";
  }
  return `the last ${days} days`;
}

/**
 * The one sentence the filtered state leads with. It names what was actually
 * asked for rather than suggesting the user "adjust the time range", which is
 * the boilerplate this replaces.
 */
export function describeActiveFilters(input: {
  days: number;
  search?: string;
  status?: string;
}): string {
  const subject = input.status ? `${input.status} messages` : "messages";
  const term = input.search ? ` match "${input.search}"` : "";
  return `No ${subject}${term} in ${rangeLabel(input.days)}.`;
}
