/**
 * The API's error contract, expressed in OpenAPI.
 *
 * Every failure returns the same object, so it is declared once here and
 * attached to every operation by `injectErrorResponses` rather than repeated in
 * 41 route files — where it would drift the first time someone added a route.
 */

import { API_ERROR_CODES } from "./error-handler";

type OpenApiHeader = {
  description: string;
  schema: { type: "integer" | "string" };
};

const RATE_LIMIT_HEADERS: Record<string, OpenApiHeader> = {
  "RateLimit-Limit": {
    description: "Requests permitted in the window closest to exhaustion.",
    schema: { type: "integer" as const },
  },
  "RateLimit-Remaining": {
    description: "Requests still available in that window.",
    schema: { type: "integer" as const },
  },
  "RateLimit-Reset": {
    description: "Seconds until that window resets.",
    schema: { type: "integer" as const },
  },
  "RateLimit-Policy": {
    description:
      'Every policy in force, as "<limit>;w=<window seconds>", comma-separated.',
    schema: { type: "string" as const },
  },
  "Retry-After": {
    description: "Seconds to wait before retrying.",
    schema: { type: "integer" as const },
  },
};

export const ERROR_SCHEMAS = {
  ApiError: {
    type: "object" as const,
    required: ["error", "code"],
    description:
      "Returned by every 4xx and 5xx response. Branch on `code`, show `error`, quote `requestId` to support.",
    properties: {
      error: {
        type: "string" as const,
        description:
          "Human-readable message. Wording may change; do not parse it.",
        examples: ["AWS account does not belong to this organization"],
      },
      code: {
        type: "string" as const,
        description:
          "Stable machine-readable code. Safe to branch on across releases.",
        enum: [...API_ERROR_CODES],
        examples: ["FORBIDDEN"],
      },
      requestId: {
        type: "string" as const,
        description:
          "Correlates with the `x-request-id` response header and with server logs.",
      },
    },
  },
};

const errorResponse = (
  description: string,
  headers?: Record<string, OpenApiHeader>
) => ({
  description,
  ...(headers ? { headers } : {}),
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ApiError" },
    },
  },
});

export const ERROR_RESPONSES = {
  BadRequest: errorResponse(
    "Malformed request — unparseable body or an invalid parameter."
  ),
  Unauthorized: errorResponse(
    "Missing, malformed, or revoked credentials. Send `Authorization: Bearer <api key>`."
  ),
  Forbidden: errorResponse(
    "Authenticated, but the resource belongs to another organization."
  ),
  NotFound: errorResponse(
    "No such route, or no such resource in this organization."
  ),
  ValidationFailed: errorResponse(
    "The request parsed but failed schema validation."
  ),
  RateLimited: errorResponse(
    "Rate limit exceeded. Wait for the window named by the RateLimit headers.",
    RATE_LIMIT_HEADERS
  ),
  InternalError: errorResponse(
    "Unexpected server failure. Safe to retry with backoff; quote `requestId` if it persists."
  ),
};

/**
 * Statuses attached to every operation. The spec already declares global
 * `security`, so 401/403 apply everywhere; the rest come from framework-level
 * behavior (parsing, validation, rate limiting, unhandled throws) that no route
 * opts out of.
 */
const DEFAULT_ERROR_RESPONSES: Record<string, string> = {
  "400": "BadRequest",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "NotFound",
  "422": "ValidationFailed",
  "429": "RateLimited",
  "500": "InternalError",
};

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

type Operation = { responses?: Record<string, unknown> };
type OpenApiSpec = {
  paths?: Record<string, Record<string, unknown>>;
  components?: Record<string, unknown>;
};

/**
 * Add the shared error responses to every operation that has not declared its
 * own for that status. Mutates and returns the spec.
 */
export function injectErrorResponses<T extends OpenApiSpec>(spec: T): T {
  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) {
        continue;
      }
      if (operation === null || typeof operation !== "object") {
        continue;
      }

      const target = operation as Operation;
      target.responses ??= {};
      const responses = target.responses;
      for (const [status, component] of Object.entries(
        DEFAULT_ERROR_RESPONSES
      )) {
        // A route that documented its own 404 keeps it.
        responses[status] ??= {
          $ref: `#/components/responses/${component}`,
        };
      }
    }
  }

  return spec;
}
