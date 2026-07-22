/**
 * Malformed-request telemetry.
 *
 * A client error that means "your request was unintelligible" is a signal about
 * us — wrong docs, a wrong SDK, a wrong OpenAPI spec — in a way that "not
 * found" or "conflict" is not. Those are business outcomes; these are contract
 * failures. They no longer go to Sentry (they are not incidents), so they get a
 * dedicated wide event instead, queryable by path/field/user-agent.
 */

/**
 * Elysia codes that mean the request itself could not be understood.
 *
 * INVALID_FILE_TYPE and INVALID_COOKIE_SIGNATURE are deliberately absent: this
 * API has no upload routes and never reads cookies (see the CORS note above
 * `app` in index.ts). Add them back alongside the route that can raise them.
 */
const MALFORMED_REQUEST_CODES = new Set(["VALIDATION", "PARSE"]);

export function isMalformedRequest(code: string | number): boolean {
  return typeof code === "string" && MALFORMED_REQUEST_CODES.has(code);
}

/** Which part of the request failed to validate. */
const REQUEST_PARTS = ["body", "query", "params", "headers"] as const;

type RequestPart = (typeof REQUEST_PARTS)[number];

export function malformedRequestPart(error: unknown): RequestPart | undefined {
  if (typeof error !== "object" || error === null || !("type" in error)) {
    return;
  }

  const { type } = error as { type: unknown };
  return REQUEST_PARTS.find((part) => part === type);
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
 * Bound the expectation string. TypeBox builds these from the schema, but
 * Elysia's standard-schema branch passes the validator's own message through,
 * and zod/valibot messages echo the received value. Truncating keeps a future
 * validator swap from quietly turning this field into a payload sink.
 */
const MAX_EXPECTED_LENGTH = 120;

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
      fields.push({ path, expected: message.slice(0, MAX_EXPECTED_LENGTH) });
    }
  }

  return fields;
}
