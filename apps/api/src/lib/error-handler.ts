import { resolveErrorStatus, shouldReportToMonitoring } from "./error-response";
import {
  isMalformedRequest,
  malformedRequestFields,
  malformedRequestPart,
} from "./malformed-request";

/** Caller-controlled headers are logged for triage — bounded so they can't pad ingest. */
const MAX_HEADER_LOG_LENGTH = 200;

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
 * The global onError handler, extracted so tests can mount the real thing.
 *
 * Three responsibilities, deliberately in one place because they share the
 * resolved status: emit telemetry, decide whether this is an incident, and
 * shape a response body that never leaks internals.
 */
export function handleApiError(
  input: ApiErrorInput,
  sinks: ApiErrorSinks
): { error: string } {
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
  if (shouldReportToMonitoring(status)) {
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
    return { error: "Not found" };
  }

  if (code === "VALIDATION") {
    return { error: "Validation failed" };
  }

  // 4xx errors from routes are already sanitized — pass through
  if (status >= 400 && status < 500) {
    return { error: asError(error).message };
  }

  // 5xx: never leak internal details
  return { error: "Internal server error" };
}
