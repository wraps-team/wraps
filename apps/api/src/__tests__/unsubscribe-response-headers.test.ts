/**
 * Unsubscribe GET response-header tests.
 *
 * Regression coverage for a prod incident where the confirmation page was
 * served as `Content-Type: text/plain`, causing browsers to show raw HTML.
 * Also asserts Cache-Control / Referrer-Policy / x-request-id propagation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Dynamic mock for jose so each test can choose verify success/failure.
const jwtVerifyMock = vi.fn();
vi.mock("jose", async (importOriginal) => ({
  jwtVerify: (...args: unknown[]) => jwtVerifyMock(...args),
  errors: (await importOriginal<typeof import("jose")>()).errors,
}));

// Dynamic mock for the contact lookup — tests flip this between found/empty.
const contactRow = {
  id: "contact-123",
  email: "person@example.com",
  emailStatus: "active",
};
const selectFromMock = vi.fn();
vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: selectFromMock,
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn() })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(() => []) })),
    })),
  },
  contact: "contact",
  contactTopic: "contact_topic",
  topic: "topic",
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({ and: vi.fn() }));
vi.mock("../services/workflow-events", () => ({
  emitTopicUnsubscribed: vi.fn(async () => {}),
}));

const loadRoutes = async () => {
  const { unsubscribeRoutes } = await import("../routes/unsubscribe");
  const { Elysia } = await import("elysia");
  return new Elysia().use(unsubscribeRoutes);
};

const setContactQuery = (rows: unknown[]) => {
  selectFromMock.mockImplementation(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(() => rows),
    })),
    innerJoin: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(() => []) })),
    })),
  }));
};

describe("Unsubscribe GET response headers", () => {
  beforeEach(() => {
    jwtVerifyMock.mockReset();
    selectFromMock.mockReset();
  });

  it("serves the 200 confirmation page as text/html with security headers", async () => {
    jwtVerifyMock.mockResolvedValueOnce({
      payload: { cid: "contact-123", oid: "org-123", type: "unsub" },
    });
    setContactQuery([contactRow]);

    const app = await loadRoutes();
    const response = await app.handle(
      new Request("http://localhost/unsubscribe/valid-token", {
        method: "GET",
        headers: { "x-request-id": "req-abc" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-request-id")).toBe("req-abc");
  });

  it("serves the 400 invalid-token page as text/html", async () => {
    jwtVerifyMock.mockRejectedValueOnce(new Error("bad signature"));

    const app = await loadRoutes();
    const response = await app.handle(
      new Request("http://localhost/unsubscribe/bogus-token", { method: "GET" })
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain("Invalid or Expired Link");
  });

  it("serves the 404 contact-not-found page as text/html", async () => {
    jwtVerifyMock.mockResolvedValueOnce({
      payload: { cid: "missing-contact", oid: "org-123", type: "unsub" },
    });
    setContactQuery([]); // contact lookup returns nothing

    const app = await loadRoutes();
    const response = await app.handle(
      new Request("http://localhost/unsubscribe/valid-token", { method: "GET" })
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain("Contact Not Found");
  });

  it("omits x-request-id when the incoming request does not send one", async () => {
    jwtVerifyMock.mockRejectedValueOnce(new Error("bad signature"));

    const app = await loadRoutes();
    const response = await app.handle(
      new Request("http://localhost/unsubscribe/bogus-token", { method: "GET" })
    );

    expect(response.headers.get("x-request-id")).toBeNull();
  });
});
