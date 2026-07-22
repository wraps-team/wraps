import { Elysia, t } from "elysia";
import { describe, expect, it, vi } from "vitest";

import { resolveErrorStatus } from "../lib/error-response";
import {
  isMalformedRequest,
  malformedRequestFields,
  malformedRequestPart,
} from "../lib/malformed-request";

/**
 * Malformed requests stopped going to Sentry (they are client errors, not
 * incidents), so `api.malformed_request` is the replacement signal for "our
 * docs/SDK/spec told someone the wrong thing".
 *
 * Mirrors the malformed-request branch of the onError handler in index.ts.
 */
function createTestApp(warn: (msg: string, data: unknown) => void) {
  return new Elysia()
    .onError(({ error, code, set, request }) => {
      const url = new URL(request.url);
      const status = resolveErrorStatus(code, set.status);

      if (isMalformedRequest(code)) {
        warn("api.malformed_request", {
          method: request.method,
          path: url.pathname,
          status,
          code,
          part: malformedRequestPart(error),
          fields: malformedRequestFields(error),
          contentType: request.headers.get("content-type"),
          userAgent: request.headers.get("user-agent"),
        });
      }

      return { error: "handled" };
    })
    .post("/v1/contacts", () => ({ ok: true }), {
      body: t.Object({
        email: t.String(),
        age: t.Number(),
      }),
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
    });
}

const jsonPost = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/v1/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });

describe("api.malformed_request signal", () => {
  it("emits the failing field path and expectation for a bad body", async () => {
    const warn = vi.fn();
    await createTestApp(warn).handle(
      jsonPost(JSON.stringify({ email: "dev@example.com", age: "not-a-number" }))
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const [message, data] = warn.mock.calls[0];
    expect(message).toBe("api.malformed_request");
    expect(data).toMatchObject({
      method: "POST",
      path: "/v1/contacts",
      status: 422,
      code: "VALIDATION",
      part: "body",
      fields: [{ path: "/age", expected: "Expected number" }],
    });
  });

  it("identifies which part of the request failed", async () => {
    const warn = vi.fn();
    await createTestApp(warn).handle(
      new Request("http://localhost/v1/contacts?limit=lots")
    );

    expect(warn.mock.calls[0][1]).toMatchObject({ part: "query" });
  });

  it("records the user agent so an SDK version can be blamed", async () => {
    const warn = vi.fn();
    await createTestApp(warn).handle(
      jsonPost(JSON.stringify({ email: "dev@example.com" }), {
        "User-Agent": "@wraps.dev/email/0.12.1",
      })
    );

    expect(warn.mock.calls[0][1]).toMatchObject({
      userAgent: "@wraps.dev/email/0.12.1",
      contentType: "application/json",
    });
  });

  it("emits for unparseable bodies, which carry no field detail", async () => {
    const warn = vi.fn();
    await createTestApp(warn).handle(jsonPost("{not json"));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toMatchObject({
      code: "PARSE",
      path: "/v1/contacts",
      fields: [],
    });
  });

  it("never leaks the caller's payload into the log", async () => {
    const warn = vi.fn();
    await createTestApp(warn).handle(
      jsonPost(
        JSON.stringify({
          email: "private-customer@acme.com",
          age: "555-867-5309",
        })
      )
    );

    const serialized = JSON.stringify(warn.mock.calls[0][1]);
    expect(serialized).not.toContain("private-customer@acme.com");
    expect(serialized).not.toContain("555-867-5309");
  });

  it("stays quiet for business 4xx like a missing batch", async () => {
    const warn = vi.fn();
    await createTestApp(warn).handle(
      new Request("http://localhost/v1/batch/missing")
    );

    expect(warn).not.toHaveBeenCalled();
  });

  it("stays quiet for unmatched routes and server errors", async () => {
    const warn = vi.fn();
    const app = createTestApp(warn);

    await app.handle(new Request("http://localhost/nope"));
    await app.handle(new Request("http://localhost/boom"));

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("malformedRequestFields", () => {
  it("caps the field list so one bad payload can't flood the dataset", () => {
    const error = {
      all: Array.from({ length: 20 }, (_, i) => ({
        path: `/field${i}`,
        message: "Expected string",
      })),
    };

    expect(malformedRequestFields(error)).toHaveLength(5);
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
  it("ignores a type that isn't a request part", () => {
    expect(malformedRequestPart({ type: "something-else" })).toBeUndefined();
    expect(malformedRequestPart(new Error("nope"))).toBeUndefined();
  });
});

describe("isMalformedRequest", () => {
  it("covers every Elysia code that means the request was unintelligible", () => {
    for (const code of [
      "VALIDATION",
      "PARSE",
      "INVALID_FILE_TYPE",
      "INVALID_COOKIE_SIGNATURE",
    ]) {
      expect(isMalformedRequest(code)).toBe(true);
    }
  });

  it("excludes business and server errors", () => {
    for (const code of ["NOT_FOUND", "UNKNOWN", "INTERNAL_SERVER_ERROR", 500]) {
      expect(isMalformedRequest(code)).toBe(false);
    }
  });
});
