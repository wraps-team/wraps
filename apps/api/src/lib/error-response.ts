import { StatusMap } from "elysia";

/**
 * Resolve the HTTP status an errored request will respond with.
 *
 * Elysia reports framework failures through `code`, while routes signal client
 * errors by assigning `set.status` before throwing. Both have to be consulted:
 * a route-thrown error carries code "UNKNOWN" no matter which status it set.
 */
export function resolveErrorStatus(
  code: string | number,
  setStatus: unknown
): number {
  if (code === "NOT_FOUND") {
    return 404;
  }

  if (code === "VALIDATION") {
    return 400;
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
export function shouldReportToMonitoring(
  code: string | number,
  status: number
): boolean {
  if (code === "NOT_FOUND" || code === "VALIDATION") {
    return false;
  }

  return status >= 500;
}
