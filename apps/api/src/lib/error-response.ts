import { StatusMap } from "elysia";

/**
 * Resolve the HTTP status an errored request will respond with.
 *
 * Elysia populates `set.status` for every failure mode it owns — 422 for schema
 * validation, 400 for parse errors, 500 for unknown throws (even when the route
 * had already assigned a 2xx). Routes signal client errors the same way, with
 * `set.status = 4xx` before throwing. Two cases need care:
 *
 * - An unmatched route leaves `set.status` at a stale 200 while responding 404,
 *   so NOT_FOUND has to come from `code`.
 * - `set.status` accepts Elysia's status *names* ("Forbidden"), which reach the
 *   wire as the right number but would otherwise resolve to 500 here — paging
 *   Sentry for a deliberate 4xx and replacing the route's message with
 *   "Internal server error".
 */
export function resolveErrorStatus(
  code: string | number,
  setStatus: unknown
): number {
  if (code === "NOT_FOUND") {
    return 404;
  }

  if (typeof setStatus === "number") {
    return setStatus;
  }

  if (typeof setStatus === "string" && setStatus in StatusMap) {
    return StatusMap[setStatus as keyof typeof StatusMap];
  }

  return 500;
}

/**
 * Only unexpected failures belong in Sentry/PostHog. Deliberate 4xx responses
 * — missing resources, failed authorization, invalid input — are part of the
 * API contract, not incidents.
 */
export function shouldReportToMonitoring(status: number): boolean {
  return status >= 500;
}
