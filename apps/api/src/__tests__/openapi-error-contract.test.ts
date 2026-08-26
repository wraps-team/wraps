import { swagger } from "@elysiajs/swagger";
import { Elysia, t } from "elysia";
import { describe, expect, it } from "vitest";

import {
  API_ERROR_CODES,
  errorCodeFor,
  normalizeErrorPayload,
  STATUS_ERROR_CODES,
} from "../lib/error-handler";
import {
  ERROR_RESPONSES,
  ERROR_SCHEMAS,
  injectErrorResponses,
} from "../lib/openapi-errors";
import { errorContract } from "../middleware/error-contract";
import { createErrorHarness } from "./error-handler-harness";

/**
 * Mirrors the swagger wiring in index.ts. Kept small on purpose: this asserts
 * the spec an agent downloads, not the route surface.
 */
function specApp() {
  return new Elysia()
    .onAfterHandle({ as: "global" }, ({ path, response }) => {
      if (
        path === "/swagger/json" &&
        response &&
        typeof response === "object"
      ) {
        injectErrorResponses(response as Record<string, never>);
      }
    })
    .use(
      swagger({
        path: "/swagger",
        documentation: {
          components: {
            schemas: ERROR_SCHEMAS,
            responses: ERROR_RESPONSES,
          },
          security: [{ bearerAuth: [] }],
        } as never,
        exclude: ["/swagger", "/swagger/json"],
      })
    )
    .get("/things", () => ({ ok: true }), {
      response: t.Object({ ok: t.Boolean() }),
    })
    .post("/things", () => ({ ok: true }), {
      response: t.Object({ ok: t.Boolean() }),
      detail: {
        // A route that documents its own 404 must keep it.
        responses: { "404": { description: "This thing specifically" } },
      },
    });
}

async function fetchSpec() {
  const response = await specApp().handle(
    new Request("http://localhost/swagger/json")
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    components: {
      schemas: Record<string, { properties: Record<string, unknown> }>;
      responses: Record<string, { content: Record<string, unknown> }>;
    };
    paths: Record<
      string,
      Record<string, { responses: Record<string, { $ref?: string }> }>
    >;
  };
}

describe("the OpenAPI spec publishes a typed error model", () => {
  it("declares ApiError with a machine-readable code and a human-readable message", async () => {
    const spec = await fetchSpec();
    const schema = spec.components.schemas.ApiError as {
      required: string[];
      properties: {
        code: { enum: string[] };
        error: { type: string };
        requestId: { type: string };
      };
    };

    expect(schema.required).toEqual(["error", "code"]);
    expect(schema.properties.error.type).toBe("string");
    expect(schema.properties.requestId.type).toBe("string");
    expect(schema.properties.code.enum).toEqual([...API_ERROR_CODES]);
  });

  it("enumerates exactly the codes the error handler can emit — no hand-kept copy", async () => {
    const spec = await fetchSpec();
    const declared = new Set(
      (
        spec.components.schemas.ApiError as {
          properties: { code: { enum: string[] } };
        }
      ).properties.code.enum
    );

    for (const status of Object.keys(STATUS_ERROR_CODES).map(Number)) {
      expect(declared.has(errorCodeFor(status, "UNKNOWN"))).toBe(true);
    }
    expect(declared.has(errorCodeFor(500, "UNKNOWN"))).toBe(true);
    expect(declared.has(errorCodeFor(400, "PARSE"))).toBe(true);
  });

  it("points every shared error response at that one schema", async () => {
    const spec = await fetchSpec();

    for (const [name, response] of Object.entries(spec.components.responses)) {
      const json = response.content["application/json"] as {
        schema: { $ref: string };
      };
      expect(json.schema.$ref, name).toBe("#/components/schemas/ApiError");
    }
  });

  it("documents the rate-limit headers on the 429", async () => {
    const spec = await fetchSpec();
    const rateLimited = spec.components.responses.RateLimited as unknown as {
      headers: Record<string, unknown>;
    };

    for (const header of [
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
      "RateLimit-Policy",
      "Retry-After",
    ]) {
      expect(Object.keys(rateLimited.headers)).toContain(header);
    }
  });

  it("attaches the error responses to every operation", async () => {
    const spec = await fetchSpec();
    const operations = Object.values(spec.paths).flatMap((pathItem) =>
      Object.values(pathItem)
    );

    expect(operations.length).toBeGreaterThan(0);
    for (const operation of operations) {
      for (const status of ["400", "401", "403", "422", "429", "500"]) {
        expect(operation.responses[status]?.$ref).toBe(
          `#/components/responses/${
            {
              "400": "BadRequest",
              "401": "Unauthorized",
              "403": "Forbidden",
              "422": "ValidationFailed",
              "429": "RateLimited",
              "500": "InternalError",
            }[status]
          }`
        );
      }
    }
  });

  it("leaves a route's own documented response alone", async () => {
    const spec = await fetchSpec();
    const ownNotFound = spec.paths["/things"].post.responses["404"];

    expect(ownNotFound.$ref).toBeUndefined();
    expect((ownNotFound as { description: string }).description).toBe(
      "This thing specifically"
    );
    // ...while the statuses it did not document still get the shared ones.
    expect(spec.paths["/things"].post.responses["429"]?.$ref).toBe(
      "#/components/responses/RateLimited"
    );
  });

  it("does not mistake a path-level key for an operation", () => {
    const spec = injectErrorResponses({
      paths: {
        "/x": {
          summary: "not an operation",
          parameters: [],
          get: { responses: {} },
        },
      },
    });

    expect(spec.paths["/x"].summary).toBe("not an operation");
    expect(spec.paths["/x"].parameters).toEqual([]);
    expect(
      (spec.paths["/x"].get as { responses: Record<string, unknown> }).responses
    ).toHaveProperty("500");
  });
});

describe("error responses carry the code the spec promises", () => {
  // Structural, because chaining .get() onto the harness changes Elysia's type.
  type Handler = { handle: (request: Request) => Promise<Response> };

  const errorFrom = async (app: Handler, path: string) => {
    const response = await app.handle(new Request(`http://localhost${path}`));
    return {
      status: response.status,
      body: (await response.json()) as {
        error: string;
        code: string;
        requestId?: string;
      },
    };
  };

  it("codes an unmatched route as NOT_FOUND and echoes the request id", async () => {
    const { app } = createErrorHarness();
    const { status, body } = await errorFrom(app, "/no-such-route");

    expect(status).toBe(404);
    expect(body).toEqual({
      error: "Not found",
      code: "NOT_FOUND",
      requestId: "test-request-id",
    });
  });

  it("codes a route-thrown 403 as FORBIDDEN, keeping the route's message", async () => {
    const { app } = createErrorHarness();
    const withRoute = app.get("/denied", ({ set }) => {
      set.status = 403;
      throw new Error("AWS account does not belong to this organization");
    });

    const { status, body } = await errorFrom(withRoute, "/denied");

    expect(status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(body.error).toBe("AWS account does not belong to this organization");
  });

  it("codes an unexpected throw as INTERNAL_ERROR without leaking the message", async () => {
    const { app } = createErrorHarness();
    const withRoute = app.get("/boom", () => {
      throw new Error("connection string postgres://user:pw@host");
    });

    const { status, body } = await errorFrom(withRoute, "/boom");

    expect(status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("postgres://");
  });

  it("keeps every emitted code inside the published enum", () => {
    const declared = new Set(API_ERROR_CODES);

    for (const status of [
      400, 401, 402, 403, 404, 409, 413, 422, 429, 500, 503,
    ]) {
      expect(
        declared.has(errorCodeFor(status, "UNKNOWN")),
        String(status)
      ).toBe(true);
    }
  });
});

describe("a route's own error body gets the same contract", () => {
  const routeApp = () =>
    new Elysia()
      .use(errorContract)
      .get(
        "/denied",
        ({ set }) => {
          set.status = 401;
          return { error: "Unauthorized" };
        },
        {
          // A declared response schema must not reject the added field: the
          // plugin runs after validation, which is the whole point.
          response: {
            200: t.Object({ error: t.String() }),
            401: t.Object({ error: t.String() }),
          },
        }
      )
      .get("/fine", () => ({ ok: true }), {
        response: t.Object({ ok: t.Boolean() }),
      })
      .get(
        "/own-code",
        ({ set }) => {
          set.status = 429;
          return { error: "Slow down", code: "EVENT_LIMIT_EXCEEDED" };
        },
        {
          response: {
            200: t.Object({ error: t.String(), code: t.String() }),
            429: t.Object({ error: t.String(), code: t.String() }),
          },
        }
      );

  it("adds the code to a hand-written 401 that never reaches onError", async () => {
    const response = await routeApp().handle(
      new Request("http://localhost/denied")
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });

  it("leaves a successful response untouched", async () => {
    const response = await routeApp().handle(
      new Request("http://localhost/fine")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("does not overwrite a code the route chose itself", async () => {
    const response = await routeApp().handle(
      new Request("http://localhost/own-code")
    );

    expect(await response.json()).toEqual({
      error: "Slow down",
      code: "EVENT_LIMIT_EXCEEDED",
    });
  });

  it("ignores anything that is not an error-shaped object", () => {
    expect(normalizeErrorPayload({ ok: true }, 400)).toBeUndefined();
    expect(normalizeErrorPayload("plain string", 500)).toBeUndefined();
    expect(normalizeErrorPayload(["a"], 500)).toBeUndefined();
    expect(normalizeErrorPayload(null, 500)).toBeUndefined();
    expect(normalizeErrorPayload({ error: 42 }, 500)).toBeUndefined();
  });

  it("ignores 2xx and 3xx, whatever the body looks like", () => {
    expect(
      normalizeErrorPayload({ error: "odd but fine" }, 200)
    ).toBeUndefined();
    expect(
      normalizeErrorPayload({ error: "odd but fine" }, 302)
    ).toBeUndefined();
  });

  it("reads an Elysia status name, not just a number", () => {
    expect(normalizeErrorPayload({ error: "nope" }, "Forbidden")).toEqual({
      error: "nope",
      code: "FORBIDDEN",
    });
  });

  it("keeps every other field the route returned", () => {
    expect(
      normalizeErrorPayload(
        { error: "event_limit_exceeded", message: "Upgrade", current: 62_500 },
        429
      )
    ).toEqual({
      error: "event_limit_exceeded",
      message: "Upgrade",
      current: 62_500,
      code: "RATE_LIMITED",
    });
  });
});
