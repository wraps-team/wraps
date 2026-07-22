import { Elysia } from "elysia";
import { describe, expect, it, vi } from "vitest";

import {
  resolveErrorStatus,
  shouldReportToMonitoring,
} from "../lib/error-response";

/**
 * Sentry API-6 ("Error: Batch not found"): routes signal client errors with
 * `set.status = 4xx` + `throw new Error(...)`. Elysia reports those with
 * code "UNKNOWN", so gating monitoring on the code alone reported deliberate
 * 404/400/403 responses as production errors.
 */
function createTestApp(captureException: (error: Error) => void) {
  return new Elysia()
    .onError(({ error, code, set }) => {
      const status = resolveErrorStatus(code, set.status);

      if (shouldReportToMonitoring(code, status)) {
        captureException(
          error instanceof Error ? error : new Error(String(error))
        );
      }

      return { error: status >= 500 ? "Internal server error" : "handled" };
    })
    .get("/batch/:id", ({ set }) => {
      set.status = 404;
      throw new Error("Batch not found");
    })
    .get("/forbidden", ({ set }) => {
      set.status = 403;
      throw new Error("AWS account does not belong to this organization");
    })
    .get("/boom", () => {
      throw new Error("connection terminated unexpectedly");
    });
}

describe("monitoring noise from route-level client errors", () => {
  it("does not report a route-thrown 404 to Sentry", async () => {
    const captureException = vi.fn();
    const app = createTestApp(captureException);

    const res = await app.handle(new Request("http://localhost/batch/missing"));

    expect(res.status).toBe(404);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("does not report a route-thrown 403 to Sentry", async () => {
    const captureException = vi.fn();
    const app = createTestApp(captureException);

    const res = await app.handle(new Request("http://localhost/forbidden"));

    expect(res.status).toBe(403);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("still reports unhandled 5xx errors to Sentry", async () => {
    const captureException = vi.fn();
    const app = createTestApp(captureException);

    const res = await app.handle(new Request("http://localhost/boom"));

    expect(res.status).toBe(500);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0].message).toBe(
      "connection terminated unexpectedly"
    );
  });

  it("does not report unmatched routes", async () => {
    const captureException = vi.fn();
    const app = createTestApp(captureException);

    await app.handle(new Request("http://localhost/nope"));

    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("resolveErrorStatus", () => {
  it("maps framework NOT_FOUND to 404", () => {
    expect(resolveErrorStatus("NOT_FOUND", undefined)).toBe(404);
  });

  it("maps framework VALIDATION to 400", () => {
    expect(resolveErrorStatus("VALIDATION", undefined)).toBe(400);
  });

  it("uses the status the route set", () => {
    expect(resolveErrorStatus("UNKNOWN", 403)).toBe(403);
  });

  it("resolves a string status set by a route", () => {
    expect(resolveErrorStatus("UNKNOWN", "Not Found")).toBe(404);
  });

  it("defaults to 500 when no status was set", () => {
    expect(resolveErrorStatus("UNKNOWN", undefined)).toBe(500);
  });
});

describe("shouldReportToMonitoring", () => {
  it("reports 5xx", () => {
    expect(shouldReportToMonitoring("UNKNOWN", 500)).toBe(true);
    expect(shouldReportToMonitoring("INTERNAL_SERVER_ERROR", 503)).toBe(true);
  });

  it("skips every 4xx status regardless of code", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(shouldReportToMonitoring("UNKNOWN", status)).toBe(false);
    }
  });

  it("skips framework validation and not-found codes", () => {
    expect(shouldReportToMonitoring("VALIDATION", 400)).toBe(false);
    expect(shouldReportToMonitoring("NOT_FOUND", 404)).toBe(false);
  });
});
