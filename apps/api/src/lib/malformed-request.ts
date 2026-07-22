/**
 * Malformed-request telemetry.
 *
 * A client error that means "your request was unintelligible" is a signal about
 * us — wrong docs, a wrong SDK, a wrong OpenAPI spec — in a way that "not
 * found" or "conflict" is not. Those are business outcomes; these are contract
 * failures. They no longer go to Sentry (they are not incidents), so they get a
 * dedicated wide event instead, queryable by path/field/user-agent.
 */

/** Elysia codes that mean the request itself could not be understood. */
const MALFORMED_REQUEST_CODES = new Set([
  "VALIDATION",
  "PARSE",
  "INVALID_FILE_TYPE",
  "INVALID_COOKIE_SIGNATURE",
]);

export function isMalformedRequest(code: string | number): boolean {
  return typeof code === "string" && MALFORMED_REQUEST_CODES.has(code);
}

/** Which part of the request failed to validate. */
type RequestPart = "body" | "query" | "params" | "headers" | "cookie";

const REQUEST_PARTS = new Set<string>([
  "body",
  "query",
  "params",
  "headers",
  "cookie",
]);

export function malformedRequestPart(error: unknown): RequestPart | undefined {
  if (typeof error !== "object" || error === null || !("type" in error)) {
    return;
  }

  const { type } = error as { type: unknown };
  return typeof type === "string" && REQUEST_PARTS.has(type)
    ? (type as RequestPart)
    : undefined;
}

export type MalformedField = {
  /** JSON pointer into the failing part, e.g. "/age" or "/topics/0/id". */
  path: string;
  /** Schema-derived expectation, e.g. "Expected number". */
  expected: string;
};

/** Cap the per-request field list so one bad payload can't flood the dataset. */
const MAX_REPORTED_FIELDS = 5;

/**
 * Pull the failing field paths off an Elysia ValidationError.
 *
 * Deliberately reads only `path` and the schema-derived `message` — never
 * `value`, `schema.default`, or the top-level `message`, all of which can echo
 * the caller's payload (contact emails, phone numbers) into the log.
 */
export function malformedRequestFields(error: unknown): MalformedField[] {
  if (typeof error !== "object" || error === null || !("all" in error)) {
    return [];
  }

  const { all } = error as { all: unknown };
  if (!Array.isArray(all)) {
    return [];
  }

  const fields: MalformedField[] = [];

  for (const entry of all) {
    if (fields.length >= MAX_REPORTED_FIELDS) {
      break;
    }

    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const { path, message } = entry as { path?: unknown; message?: unknown };

    if (typeof path === "string" && typeof message === "string") {
      fields.push({ path, expected: message });
    }
  }

  return fields;
}
