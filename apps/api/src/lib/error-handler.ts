import { StatusMap } from "elysia";

import {
  isMalformedRequest,
  malformedRequestFields,
  malformedRequestPart,
} from "./malformed-request";

/** Caller-controlled headers are logged for triage — bounded so they can't pad ingest. */
const MAX_HEADER_LOG_LENGTH = 200;

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

  return numericStatus(setStatus) ?? 500;
}

/** `set.status` as a number, or undefined when it is absent or unrecognized. */
export function numericStatus(setStatus: unknown): number | undefined {
  if (typeof setStatus === "number") {
    return setStatus;
  }

  if (typeof setStatus === "string" && setStatus in StatusMap) {
    return StatusMap[setStatus as keyof typeof StatusMap];
  }

  return;
}

/**
 * A denial the caller could be probing for. Route-thrown 403s ("AWS account
 * does not belong to this organization") are the cross-org resource-ownership
 * checks; a spike in them grouped by apiKeyId is an enumeration attempt, not a
 * bug, so it belongs in a log monitor rather than Sentry.
 */
function isAuthzDenial(status: number): boolean {
  return status === 401 || status === 403;
}

type AuthLike = {
  organizationId: string;
  apiKeyId: string | null;
  userId: string | null;
};

export type ApiErrorInput = {
  error: unknown;
  request: Request;
  code: string | number;
  /** Raw `set.status` — may be a number, an Elysia status name, or absent. */
  setStatus: unknown;
  /** Absent when the failure happened before the derive that assigns it. */
  requestId: string | undefined;
  auth: AuthLike | null;
};

export type ApiErrorSinks = {
  log: {
    error: (
      msg: string,
      error: unknown,
      data?: Record<string, unknown>
    ) => void;
    warn: (msg: string, data?: Record<string, unknown>) => void;
  };
  /** Fires only for 5xx. Wraps whatever incident pipeline the caller wires up. */
  captureException: (error: Error, context: ApiErrorContext) => void;
};

export type ApiErrorContext = {
  requestId: string | undefined;
  url: string;
  method: string;
  path: string;
  status: number;
  organizationId?: string;
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function authMethodOf(
  auth: AuthLike | null
): "api_key" | "session" | undefined {
  if (auth?.apiKeyId) {
    return "api_key";
  }

  return auth ? "session" : undefined;
}

/**
 * The response body every failure shares.
 *
 * `error` is for a person, `code` is for a program: stable across releases and
 * safe to branch on, which a prose message is not. `requestId` is the same id
 * the structured logs carry, so a caller reporting a failure hands support the
 * one string that finds it.
 */
export type ApiErrorBody = {
  error: string;
  code: string;
  requestId?: string;
};

/**
 * Status → code. Exported so the OpenAPI error schema enumerates exactly what
 * the handler can emit, instead of a hand-kept copy that drifts.
 */
export const STATUS_ERROR_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  402: "PAYMENT_REQUIRED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "VALIDATION_FAILED",
  429: "RATE_LIMITED",
};

export const GENERIC_CLIENT_ERROR_CODE = "REQUEST_FAILED";
export const INTERNAL_ERROR_CODE = "INTERNAL_ERROR";
export const MALFORMED_REQUEST_CODE = "MALFORMED_REQUEST";

/** Every value `handleApiError` can put in `code`, sorted and deduplicated. */
export const API_ERROR_CODES: readonly string[] = [
  ...new Set([
    ...Object.values(STATUS_ERROR_CODES),
    GENERIC_CLIENT_ERROR_CODE,
    INTERNAL_ERROR_CODE,
    MALFORMED_REQUEST_CODE,
  ]),
].sort();

const CLIENT_ERROR_FLOOR = 400;
const SERVER_ERROR_FLOOR = 500;

/**
 * Machine-readable code for a status. Elysia's own `code` wins when it names
 * something more specific than the status does.
 */
export function errorCodeFor(
  status: number,
  elysiaCode: string | number
): string {
  if (elysiaCode === "PARSE") {
    return MALFORMED_REQUEST_CODE;
  }
  if (elysiaCode === "VALIDATION") {
    return STATUS_ERROR_CODES[422];
  }

  const mapped = STATUS_ERROR_CODES[status];
  if (mapped) {
    return mapped;
  }

  return status >= SERVER_ERROR_FLOOR
    ? INTERNAL_ERROR_CODE
    : GENERIC_CLIENT_ERROR_CODE;
}

function errorBody(
  message: string,
  code: string,
  requestId: string | undefined
): ApiErrorBody {
  return requestId === undefined
    ? { error: message, code }
    : { error: message, code, requestId };
}

/**
 * The global onError handler, extracted so tests can mount the real thing.
 *
 * Three responsibilities, deliberately in one place because they share the
 * resolved status: emit telemetry, decide whether this is an incident, and
 * shape a response body that never leaks internals.
 */
export function handleApiError(
  input: ApiErrorInput,
  sinks: ApiErrorSinks
): ApiErrorBody {
  const { error, request, code, setStatus, requestId, auth } = input;
  const url = new URL(request.url);
  const status = resolveErrorStatus(code, setStatus);

  if (isMalformedRequest(code)) {
    // Deliberately NOT api.error: Elysia's ValidationError message embeds the
    // caller's payload (`found: {...}`), which would put customer emails and
    // phone numbers in the log. This event carries schema-derived field paths
    // only, and is a superset of what api.error would have said.
    sinks.log.warn("api.malformed_request", {
      requestId,
      method: request.method,
      path: url.pathname,
      status,
      code,
      part: malformedRequestPart(error),
      fields: malformedRequestFields(error),
      contentType: request.headers
        .get("content-type")
        ?.slice(0, MAX_HEADER_LOG_LENGTH),
      userAgent: request.headers
        .get("user-agent")
        ?.slice(0, MAX_HEADER_LOG_LENGTH),
      organizationId: auth?.organizationId,
      apiKeyId: auth?.apiKeyId,
      userId: auth?.userId,
    });
  } else if (isAuthzDenial(status)) {
    // Suppressed from Sentry with the rest of the 4xx, so this is the only
    // trace a credential-stuffing or cross-org enumeration attempt leaves.
    // Alert on a rate spike grouped by apiKeyId — see docs in the PR.
    sinks.log.warn("api.authz_denied", {
      requestId,
      method: request.method,
      path: url.pathname,
      status,
      organizationId: auth?.organizationId,
      apiKeyId: auth?.apiKeyId,
      userId: auth?.userId,
      authMethod: authMethodOf(auth),
      sourceIp: request.headers.get("x-source-ip"),
      userAgent: request.headers
        .get("user-agent")
        ?.slice(0, MAX_HEADER_LOG_LENGTH),
    });
  } else {
    sinks.log.error("api.error", asError(error), {
      requestId,
      method: request.method,
      path: url.pathname,
      status,
      code,
      organizationId: auth?.organizationId,
      apiKeyId: auth?.apiKeyId,
      userId: auth?.userId,
      authMethod: authMethodOf(auth),
    });
  }

  // Only unexpected failures are incidents — deliberate 4xx responses thrown by
  // routes are part of the API contract.
  if (status >= 500) {
    sinks.captureException(asError(error), {
      requestId,
      url: request.url,
      method: request.method,
      path: url.pathname,
      status,
      organizationId: auth?.organizationId,
    });
  }

  if (code === "NOT_FOUND") {
    return errorBody("Not found", STATUS_ERROR_CODES[404], requestId);
  }

  if (code === "VALIDATION") {
    return errorBody("Validation failed", STATUS_ERROR_CODES[422], requestId);
  }

  // 4xx errors from routes are already sanitized — pass through
  if (status >= CLIENT_ERROR_FLOOR && status < SERVER_ERROR_FLOOR) {
    return errorBody(
      asError(error).message,
      errorCodeFor(status, code),
      requestId
    );
  }

  // 5xx: never leak internal details
  return errorBody("Internal server error", INTERNAL_ERROR_CODE, requestId);
}

/**
 * Fill in `code` on an error body a route returned directly.
 *
 * Routes that answer with their own `{ error }` object never reach
 * `handleApiError`, so without this the published contract — every failure
 * carries a machine-readable `code` — would hold for framework errors and
 * quietly not for the 40-odd hand-written ones. Normalizing on the way out
 * keeps one contract without threading a code through every route.
 *
 * Returns undefined when there is nothing to add, which the caller reads as
 * "leave the response alone".
 */
export function normalizeErrorPayload(
  response: unknown,
  setStatus: unknown
): Record<string, unknown> | undefined {
  const status = numericStatus(setStatus);
  if (status === undefined || status < CLIENT_ERROR_FLOOR) {
    return;
  }

  if (
    response === null ||
    typeof response !== "object" ||
    Array.isArray(response)
  ) {
    return;
  }

  const body = response as Record<string, unknown>;
  if (typeof body.error !== "string" || typeof body.code === "string") {
    return;
  }

  return { ...body, code: errorCodeFor(status, "") };
}
