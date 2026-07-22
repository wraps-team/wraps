import { Elysia, t } from "elysia";
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

      if (shouldReportToMonitoring(status)) {
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
    })
    .get("/created-then-boom", ({ set }) => {
      set.status = 201;
      throw new Error("workflow event emission failed");
    })
    .post("/validated", () => ({ ok: true }), {
      body: t.Object({ name: t.String() }),
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

  it("does not report unmatched routes", async () => {
    const captureException = vi.fn();
    const app = createTestApp(captureException);

    const res = await app.handle(new Request("http://localhost/nope"));

    expect(res.status).toBe(404);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("does not report schema validation failures", async () => {
    const captureException = vi.fn();
    const app = createTestApp(captureException);

    const res = await app.handle(
      new Request("http://localhost/validated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notName: 123 }),
      })
    );

    expect(res.status).toBe(422);
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

  it("still reports a 5xx thrown after the route assigned a 2xx status", async () => {
    const captureException = vi.fn();
    const app = createTestApp(captureException);

    const res = await app.handle(
      new Request("http://localhost/created-then-boom")
    );

    // Elysia resets set.status to 500 before onError, so the earlier 201 does
    // not suppress the report.
    expect(res.status).toBe(500);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

describe("resolveErrorStatus", () => {
  it("maps framework NOT_FOUND to 404 despite the stale 200 on set.status", () => {
    expect(resolveErrorStatus("NOT_FOUND", 200)).toBe(404);
  });

  it("reports the 422 Elysia actually responds with for validation failures", () => {
    expect(resolveErrorStatus("VALIDATION", 422)).toBe(422);
  });

  it("uses the status the route set", () => {
    expect(resolveErrorStatus("UNKNOWN", 403)).toBe(403);
  });

  it("defaults to 500 when no numeric status was set", () => {
    expect(resolveErrorStatus("UNKNOWN", undefined)).toBe(500);
  });
});

describe("shouldReportToMonitoring", () => {
  it("reports 5xx", () => {
    expect(shouldReportToMonitoring(500)).toBe(true);
    expect(shouldReportToMonitoring(503)).toBe(true);
  });

  it("skips every 4xx status", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(shouldReportToMonitoring(status)).toBe(false);
    }
  });
});
