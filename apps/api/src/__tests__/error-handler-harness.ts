import { Elysia } from "elysia";
import { type Mock, vi } from "vitest";

import { handleApiError } from "../lib/error-handler";

export type ErrorHarnessSinks = {
  log: { error: Mock; warn: Mock };
  captureException: Mock;
};

/**
 * Mounts the REAL onError handler from index.ts with spy sinks.
 *
 * Every error-path test builds on this rather than re-implementing the handler,
 * so a change to its wiring — a moved Sentry call, a deleted branch, a reordered
 * return — fails a test instead of silently passing three partial copies.
 */
export function createErrorHarness() {
  const sinks: ErrorHarnessSinks = {
    log: { error: vi.fn(), warn: vi.fn() },
    captureException: vi.fn(),
  };

  const app = new Elysia().onError(({ error, request, code, set }) =>
    handleApiError(
      {
        error,
        request,
        code,
        setStatus: set.status,
        requestId: "test-request-id",
        auth: null,
      },
      sinks
    )
  );

  return { app, sinks };
}

/** The single api.malformed_request payload emitted during a test. */
export function warnPayload(sinks: ErrorHarnessSinks) {
  return sinks.log.warn.mock.calls[0]?.[1];
}

/** The Error passed to api.error during a test. */
export function loggedError(sinks: ErrorHarnessSinks): Error | undefined {
  return sinks.log.error.mock.calls[0]?.[1];
}
