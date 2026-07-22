import { t } from "elysia";
import { describe, expect, it } from "vitest";

import { createErrorHarness } from "./error-handler-harness";

/**
 * Tests the error sanitization behavior of the real onError handler, mounted
 * via createErrorHarness so it cannot drift from index.ts.
 */
function createTestApp() {
  const { app } = createErrorHarness();

  return app
    .get("/throw-500", () => {
      throw new Error("SELECT * FROM secret_table WHERE password = 'leaked'");
    })
    .get("/throw-4xx", ({ set }) => {
      set.status = 403;
      throw new Error("Forbidden: insufficient permissions");
    })
    .post("/validated", () => ({ ok: true }), {
      body: t.Object({ name: t.String() }),
    });
}

describe("API error sanitization", () => {
  it("returns generic message for unhandled 5xx errors", async () => {
    const app = createTestApp();
    const res = await app.handle(new Request("http://localhost/throw-500"));
    const body = await res.json();

    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("secret_table");
    expect(JSON.stringify(body)).not.toContain("leaked");
  });

  it("returns 'Not found' for unknown routes", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/nonexistent-route")
    );
    const body = await res.json();

    expect(body.error).toBe("Not found");
  });

  it("passes through 4xx error messages from routes", async () => {
    const app = createTestApp();
    const res = await app.handle(new Request("http://localhost/throw-4xx"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden: insufficient permissions");
  });
});

describe("API validation error — BUG-015: no details leaked to client", () => {
  const invalidBody = () =>
    new Request("http://localhost/validated", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notName: 123 }),
    });

  it("returns 422 status for validation failures", async () => {
    const res = await createTestApp().handle(invalidBody());

    // Elysia returns 422 for schema validation errors
    expect(res.status).toBe(422);
  });

  it("returns generic { error: 'Validation failed' } with no details field", async () => {
    const res = await createTestApp().handle(invalidBody());
    const body = await res.json();

    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeUndefined();
  });

  it("does not expose schema internals in the response body", async () => {
    const res = await createTestApp().handle(invalidBody());
    const raw = await res.text();

    // Schema internals must not leak to the client
    expect(raw).not.toContain('"details"');
  });
});
