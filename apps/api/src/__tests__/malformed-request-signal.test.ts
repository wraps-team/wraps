import { t } from "elysia";
import { describe, expect, it } from "vitest";

import {
  isMalformedRequest,
  malformedRequestFields,
  malformedRequestPart,
} from "../lib/malformed-request";
import {
  createErrorHarness,
  loggedError,
  warnPayload,
} from "./error-handler-harness";

/**
 * Malformed requests stopped going to Sentry (they are client errors, not
 * incidents), so `api.malformed_request` is the replacement signal for "our
 * docs/SDK/spec told someone the wrong thing".
 *
 * Mounts the real handler via createErrorHarness — no hand-copied mirror.
 */
function createTestApp() {
  const { app, sinks } = createErrorHarness();

  return {
    sinks,
    app: app
      .post("/v1/contacts", () => ({ ok: true }), {
        body: t.Object({ email: t.String(), age: t.Number() }),
      })
      .get("/v1/contacts", () => ({ ok: true }), {
        query: t.Object({ limit: t.Number() }),
      })
      .get("/v1/batch/:id", ({ set }) => {
        set.status = 404;
        throw new Error("Batch not found");
      })
      .get("/boom", () => {
        throw new Error("connection terminated unexpectedly");
      }),
  };
}

const jsonPost = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/v1/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });

describe("api.malformed_request signal", () => {
  it("emits the failing field path and expectation for a bad body", async () => {
    const { app, sinks } = createTestApp();
    await app.handle(
      jsonPost(
        JSON.stringify({ email: "dev@example.com", age: "not-a-number" })
      )
    );

    expect(sinks.log.warn).toHaveBeenCalledTimes(1);
    expect(sinks.log.warn.mock.calls[0][0]).toBe("api.malformed_request");
    expect(warnPayload(sinks)).toMatchObject({
      method: "POST",
      path: "/v1/contacts",
      status: 422,
      code: "VALIDATION",
      part: "body",
      fields: [{ path: "/age", expected: "Expected number" }],
    });
  });

  it("identifies which part of the request failed", async () => {
    const { app, sinks } = createTestApp();
    await app.handle(new Request("http://localhost/v1/contacts?limit=lots"));

    expect(warnPayload(sinks)).toMatchObject({ part: "query" });
  });

  it("records the user agent so an SDK version can be blamed", async () => {
    const { app, sinks } = createTestApp();
    await app.handle(
      jsonPost(JSON.stringify({ email: "dev@example.com" }), {
        "User-Agent": "@wraps.dev/email/0.12.1",
      })
    );

    expect(warnPayload(sinks)).toMatchObject({
      userAgent: "@wraps.dev/email/0.12.1",
      contentType: "application/json",
    });
  });

  it("bounds caller-controlled headers so they can't pad log ingest", async () => {
    const { app, sinks } = createTestApp();
    await app.handle(
      jsonPost(JSON.stringify({ email: "dev@example.com" }), {
        "User-Agent": "x".repeat(5000),
      })
    );

    expect(warnPayload(sinks).userAgent).toHaveLength(200);
  });

  it("emits for unparseable bodies, which carry no field detail", async () => {
    const { app, sinks } = createTestApp();
    await app.handle(jsonPost("{not json"));

    expect(sinks.log.warn).toHaveBeenCalledTimes(1);
    expect(warnPayload(sinks)).toMatchObject({
      code: "PARSE",
      status: 400,
      path: "/v1/contacts",
      fields: [],
    });
  });

  it("never leaks the caller's payload into any log sink", async () => {
    const { app, sinks } = createTestApp();
    await app.handle(
      jsonPost(
        JSON.stringify({
          email: "private-customer@acme.com",
          age: "555-867-5309",
        })
      )
    );

    // The warn event carries schema-derived paths only...
    const warned = JSON.stringify(warnPayload(sinks));
    expect(warned).not.toContain("private-customer@acme.com");
    expect(warned).not.toContain("555-867-5309");

    // ...and api.error must not fire at all for a malformed request, because
    // Elysia's ValidationError message embeds the whole payload under `found`.
    expect(sinks.log.error).not.toHaveBeenCalled();
    expect(loggedError(sinks)).toBeUndefined();
  });

  it("still logs api.error for genuine failures", async () => {
    const { app, sinks } = createTestApp();
    await app.handle(new Request("http://localhost/boom"));

    expect(sinks.log.error).toHaveBeenCalledTimes(1);
    expect(sinks.log.error.mock.calls[0][0]).toBe("api.error");
    expect(sinks.log.warn).not.toHaveBeenCalled();
  });

  it("stays quiet for business 4xx like a missing batch", async () => {
    const { app, sinks } = createTestApp();
    await app.handle(new Request("http://localhost/v1/batch/missing"));

    expect(sinks.log.warn).not.toHaveBeenCalled();
  });

  it("stays quiet for unmatched routes and server errors", async () => {
    const { app, sinks } = createTestApp();

    await app.handle(new Request("http://localhost/nope"));
    await app.handle(new Request("http://localhost/boom"));

    expect(sinks.log.warn).not.toHaveBeenCalled();
  });
});

describe("malformedRequestFields", () => {
  it("keeps the first five fields, not an arbitrary five", () => {
    const error = {
      all: Array.from({ length: 20 }, (_, i) => ({
        path: `/field${i}`,
        message: "Expected string",
      })),
    };

    expect(malformedRequestFields(error)).toEqual(
      [0, 1, 2, 3, 4].map((i) => ({
        path: `/field${i}`,
        expected: "Expected string",
      }))
    );
  });

  it("returns everything at and below the cap", () => {
    const five = {
      all: Array.from({ length: 5 }, (_, i) => ({
        path: `/f${i}`,
        message: "m",
      })),
    };

    expect(malformedRequestFields(five)).toHaveLength(5);
    expect(
      malformedRequestFields({ all: [{ path: "/o", message: "m" }] })
    ).toHaveLength(1);
  });

  it("truncates the expectation so a value-echoing validator can't leak much", () => {
    const error = {
      all: [{ path: "/email", message: `Invalid: ${"x".repeat(500)}` }],
    };

    expect(malformedRequestFields(error)[0].expected).toHaveLength(120);
  });

  it("skips entries that don't carry a path and message", () => {
    const error = { all: [{ path: "/a" }, null, "nope", { message: "x" }] };

    expect(malformedRequestFields(error)).toEqual([]);
  });

  it("returns nothing for errors without validation detail", () => {
    expect(malformedRequestFields(new Error("Bad Request"))).toEqual([]);
    expect(malformedRequestFields(undefined)).toEqual([]);
  });
});

describe("malformedRequestPart", () => {
  it("recognizes every request part it claims to support", () => {
    for (const part of ["body", "query", "params", "headers"] as const) {
      expect(malformedRequestPart({ type: part })).toBe(part);
    }
  });

  it("ignores a type that isn't a request part", () => {
    expect(malformedRequestPart({ type: "something-else" })).toBeUndefined();
    expect(malformedRequestPart(new Error("nope"))).toBeUndefined();
  });
});

describe("isMalformedRequest", () => {
  it("covers the Elysia codes this API can actually raise", () => {
    expect(isMalformedRequest("VALIDATION")).toBe(true);
    expect(isMalformedRequest("PARSE")).toBe(true);
  });

  it("excludes business and server errors", () => {
    for (const code of ["NOT_FOUND", "UNKNOWN", "INTERNAL_SERVER_ERROR", 500]) {
      expect(isMalformedRequest(code)).toBe(false);
    }
  });

  it("excludes codes this API has no route surface for", () => {
    // No upload routes, no cookies — see the note in malformed-request.ts.
    expect(isMalformedRequest("INVALID_FILE_TYPE")).toBe(false);
    expect(isMalformedRequest("INVALID_COOKIE_SIGNATURE")).toBe(false);
  });
});
