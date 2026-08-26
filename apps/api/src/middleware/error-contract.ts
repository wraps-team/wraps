/**
 * Makes one error contract true for every response.
 *
 * `handleApiError` shapes the failures Elysia routes through onError, but ~40
 * routes answer with their own `{ error }` object and never reach it. This
 * plugin fills in the machine-readable `code` on the way out, so the OpenAPI
 * `ApiError` schema describes every 4xx and 5xx rather than most of them.
 *
 * It runs in `mapResponse`, after a route's own response schema has been
 * applied, so adding the field cannot trip validation.
 */

import { Elysia } from "elysia";

import { normalizeErrorPayload, numericStatus } from "../lib/error-handler";

export const errorContract = new Elysia({ name: "error-contract" }).mapResponse(
  { as: "global" },
  ({ response, set }) => {
    const normalized = normalizeErrorPayload(response, set.status);
    if (!normalized) {
      return;
    }

    return new Response(JSON.stringify(normalized), {
      status: numericStatus(set.status),
      headers: { "content-type": "application/json" },
    });
  }
);
