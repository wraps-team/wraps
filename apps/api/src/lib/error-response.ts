/**
 * Resolve the HTTP status an errored request will respond with.
 *
 * Elysia populates `set.status` for every failure mode it owns — 422 for schema
 * validation, 400 for parse errors, 500 for unknown throws (even when the route
 * had already assigned a 2xx). Routes signal client errors the same way, with
 * `set.status = 4xx` before throwing. The one case where `set.status` lies is an
 * unmatched route: it is still 200 while the response is 404, so NOT_FOUND has
 * to come from `code`.
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
