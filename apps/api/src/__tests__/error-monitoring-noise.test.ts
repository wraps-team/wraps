import { t } from "elysia";
import { describe, expect, it } from "vitest";

import { resolveErrorStatus } from "../lib/error-handler";
import { createErrorHarness } from "./error-handler-harness";

/**
 * Sentry API-6 ("Error: Batch not found"): routes signal client errors with
 * `set.status = 4xx` + `throw new Error(...)`. Elysia reports those with
 * code "UNKNOWN", so gating monitoring on the code alone reported deliberate
 * 404/400/403 responses as production errors.
 *
 * Mounts the real handler via createErrorHarness — no hand-copied mirror.
 */
function createTestApp() {
  const { app, sinks } = createErrorHarness();

  return {
    sinks,
    app: app
      .get("/batch/:id", ({ set }) => {
        set.status = 404;
        throw new Error("Batch not found");
      })
      .get("/forbidden", ({ set }) => {
        set.status = 403;
        throw new Error("AWS account does not belong to this organization");
      })
      .get("/named-status", ({ set }) => {
        set.status = "Forbidden";
        throw new Error("AWS account does not belong to this organization");
      })
      .get("/unauthorized", ({ set }) => {
        set.status = 401;
        throw new Error("Not authenticated");
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
      }),
  };
}

describe("monitoring noise from route-level client errors", () => {
  it("does not report a route-thrown 404 to Sentry", async () => {
    const { app, sinks } = createTestApp();

    const res = await app.handle(new Request("http://localhost/batch/missing"));

    expect(res.status).toBe(404);
    expect(sinks.captureException).not.toHaveBeenCalled();
  });

  it("does not report a route-thrown 403 to Sentry", async () => {
    const { app, sinks } = createTestApp();

    const res = await app.handle(new Request("http://localhost/forbidden"));

    expect(res.status).toBe(403);
    expect(sinks.captureException).not.toHaveBeenCalled();
  });

  it("does not report a 4xx set by Elysia status name", async () => {
    const { app, sinks } = createTestApp();

    const res = await app.handle(new Request("http://localhost/named-status"));

    expect(res.status).toBe(403);
    expect(sinks.captureException).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      error: "AWS account does not belong to this organization",
    });
  });

  it("does not report unmatched routes", async () => {
    const { app, sinks } = createTestApp();

    const res = await app.handle(new Request("http://localhost/nope"));

    expect(res.status).toBe(404);
    expect(sinks.captureException).not.toHaveBeenCalled();
  });

  it("does not report schema validation failures", async () => {
    const { app, sinks } = createTestApp();

    const res = await app.handle(
      new Request("http://localhost/validated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notName: 123 }),
      })
    );

    expect(res.status).toBe(422);
    expect(sinks.captureException).not.toHaveBeenCalled();
  });

  it("still reports unhandled 5xx errors to Sentry", async () => {
    const { app, sinks } = createTestApp();

    const res = await app.handle(new Request("http://localhost/boom"));

    expect(res.status).toBe(500);
    expect(sinks.captureException).toHaveBeenCalledTimes(1);
    expect(sinks.captureException.mock.calls[0][0].message).toBe(
      "connection terminated unexpectedly"
    );
    expect(sinks.captureException.mock.calls[0][1]).toMatchObject({
      status: 500,
      path: "/boom",
      method: "GET",
    });
  });

  it("still reports a 5xx thrown after the route assigned a 2xx status", async () => {
    const { app, sinks } = createTestApp();

    const res = await app.handle(
      new Request("http://localhost/created-then-boom")
    );

    // Elysia resets set.status to 500 before onError, so the earlier 201 does
    // not suppress the report.
    expect(res.status).toBe(500);
    expect(sinks.captureException).toHaveBeenCalledTimes(1);
  });
});

describe("api.authz_denied signal", () => {
  it("records a route-thrown 403 with the key that was denied", async () => {
    const { app, sinks } = createTestApp();

    const res = await app.handle(
      new Request("http://localhost/forbidden", {
        headers: { "x-source-ip": "203.0.113.7", "User-Agent": "curl/8.4.0" },
      })
    );

    expect(res.status).toBe(403);
    expect(sinks.log.warn).toHaveBeenCalledTimes(1);
    expect(sinks.log.warn.mock.calls[0][0]).toBe("api.authz_denied");
    expect(sinks.log.warn.mock.calls[0][1]).toMatchObject({
      status: 403,
      path: "/forbidden",
      method: "GET",
      sourceIp: "203.0.113.7",
      userAgent: "curl/8.4.0",
    });
  });

  it("records a 401 the same way", async () => {
    const { app, sinks } = createTestApp();

    await app.handle(new Request("http://localhost/unauthorized"));

    expect(sinks.log.warn.mock.calls[0][0]).toBe("api.authz_denied");
    expect(sinks.log.warn.mock.calls[0][1]).toMatchObject({ status: 401 });
  });

  it("does not double-log a denial as api.error", async () => {
    const { app, sinks } = createTestApp();

    await app.handle(new Request("http://localhost/forbidden"));

    expect(sinks.log.error).not.toHaveBeenCalled();
  });

  it("leaves other 4xx on the api.error path", async () => {
    const { app, sinks } = createTestApp();

    await app.handle(new Request("http://localhost/batch/missing"));

    expect(sinks.log.warn).not.toHaveBeenCalled();
    expect(sinks.log.error).toHaveBeenCalledTimes(1);
    expect(sinks.log.error.mock.calls[0][0]).toBe("api.error");
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

  it("resolves Elysia's status names", () => {
    expect(resolveErrorStatus("UNKNOWN", "Forbidden")).toBe(403);
    expect(resolveErrorStatus("UNKNOWN", "Not Found")).toBe(404);
  });

  it("defaults to 500 for an unrecognized status", () => {
    expect(resolveErrorStatus("UNKNOWN", undefined)).toBe(500);
    expect(resolveErrorStatus("UNKNOWN", "Not A Status")).toBe(500);
  });
});
