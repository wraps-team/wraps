/**
 * Unsubscribe Body Coercion Tests
 *
 * Ensures POST /unsubscribe/:token handles various body types
 * without throwing "Cannot convert object to primitive value".
 *
 * Regression: API-4 — Elysia parses form-urlencoded bodies into
 * null-prototype objects which lack toString(), causing String() to throw.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("jose", () => ({
  jwtVerify: vi.fn(async () => ({
    payload: {
      cid: "contact-123",
      oid: "org-123",
      tid: undefined,
      type: "unsub",
    },
  })),
  errors: {
    JWTExpired: class JWTExpired extends Error {},
    JWTInvalid: class JWTInvalid extends Error {},
  },
}));

const mockContact = {
  id: "contact-123",
  email: "user@example.com",
  emailStatus: "active",
};

vi.mock("@wraps/db", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [mockContact]),
          })),
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => []),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          // The global contact write is guarded and reads back the row it
          // changed (.returning()); the topic write awaits .where() directly.
          where: vi.fn(() => ({
            returning: vi.fn(() => [{ id: "contact-123" }]),
          })),
        })),
      })),
    },
    contact: "contact",
    contactTopic: "contact_topic",
    topic: "topic",
    eq: vi.fn(),
    and: vi.fn(),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("../services/workflow-events", () => ({
  emitContactsUpdated: vi.fn(async () => ({ workflowsTriggered: 0 })),
  emitTopicUnsubscribed: vi.fn(async () => {}),
}));

describe("Unsubscribe body coercion (API-4)", () => {
  it("handles null-prototype object body without throwing", async () => {
    const { unsubscribeRoutes } = await import("../routes/unsubscribe");
    const { Elysia } = await import("elysia");

    const app = new Elysia().use(unsubscribeRoutes);

    // Simulate what Elysia does: parse form-urlencoded into a null-prototype object
    const response = await app.handle(
      new Request("http://localhost/unsubscribe/valid-token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  it("handles empty form body from confirmation page", async () => {
    const { unsubscribeRoutes } = await import("../routes/unsubscribe");
    const { Elysia } = await import("elysia");

    const app = new Elysia().use(unsubscribeRoutes);

    // Empty form POST from the HTML confirmation page
    const response = await app.handle(
      new Request("http://localhost/unsubscribe/valid-token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "",
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  it("handles JSON body without throwing", async () => {
    const { unsubscribeRoutes } = await import("../routes/unsubscribe");
    const { Elysia } = await import("elysia");

    const app = new Elysia().use(unsubscribeRoutes);

    const response = await app.handle(
      new Request("http://localhost/unsubscribe/valid-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "unsubscribe" }),
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });
});
