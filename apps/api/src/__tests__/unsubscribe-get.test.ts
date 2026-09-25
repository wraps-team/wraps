import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("jose", async (importOriginal) => ({
  jwtVerify: vi.fn(),
  errors: (await importOriginal<typeof import("jose")>()).errors,
}));

type SelectResult = Record<string, unknown>[];

const selectQueue: SelectResult[] = [];

vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => selectQueue.shift() ?? []),
        })),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => []),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
  contact: "contact",
  contactTopic: "contact_topic",
  topic: "topic",
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
}));

vi.mock("../services/workflow-events", () => ({
  emitTopicUnsubscribed: vi.fn(async () => {}),
}));

import { jwtVerify } from "jose";

const VALID_CONTACT = {
  id: "contact-abc",
  email: "jane@example.com",
  emailStatus: "active",
};

function mockValidToken(topicId?: string) {
  vi.mocked(jwtVerify).mockResolvedValueOnce({
    payload: {
      cid: "contact-abc",
      oid: "org-123",
      tid: topicId,
      type: "unsub",
    },
    protectedHeader: { alg: "HS256" },
  } as unknown as Awaited<ReturnType<typeof jwtVerify>>);
}

beforeEach(() => {
  selectQueue.length = 0;
  vi.clearAllMocks();
});

describe("GET /unsubscribe/:token", () => {
  describe("invalid or expired token", () => {
    it("returns 400 HTML with error page when jwtVerify throws", async () => {
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("invalid token"));

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/bad-token", { method: "GET" })
      );

      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      expect(html).toContain("Invalid or Expired Link");
      expect(html).toContain("no longer valid");
    });

    it("returns 400 HTML when token payload has wrong type", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: { cid: "x", oid: "y", type: "other" },
        protectedHeader: { alg: "HS256" },
      } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/wrong-type", {
          method: "GET",
        })
      );

      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain("text/html");
    });
  });

  describe("contact not found", () => {
    it("returns 404 HTML when contact does not exist in DB", async () => {
      mockValidToken();
      selectQueue.push([]);

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/valid-token", {
          method: "GET",
        })
      );

      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      expect(html).toContain("Contact Not Found");
      expect(html).toContain("already been unsubscribed");
    });
  });

  describe("valid token — global unsubscribe (no tid)", () => {
    it("returns 200 HTML with masked email and all-email-communications copy", async () => {
      mockValidToken();
      selectQueue.push([VALID_CONTACT]);

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/global-token", {
          method: "GET",
        })
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      expect(html).toContain("all email communications");
      expect(html).toContain("j***e@example.com");
    });
  });

  describe("valid token — topic-specific unsubscribe", () => {
    it("returns 200 HTML containing the topic name when tid is present", async () => {
      mockValidToken("topic-456");
      selectQueue.push([VALID_CONTACT]);
      selectQueue.push([{ name: "Product Updates" }]);

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/topic-token", {
          method: "GET",
        })
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      expect(html).toContain("Product Updates");
    });

    it("falls back to 'this topic' when topic record is not found", async () => {
      mockValidToken("topic-missing");
      selectQueue.push([VALID_CONTACT]);
      selectQueue.push([]);

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/fallback-topic-token", {
          method: "GET",
        })
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("this topic");
    });
  });

  describe("XSS prevention", () => {
    it("HTML-escapes topic name containing script tags in the confirmation page", async () => {
      mockValidToken("topic-xss");
      selectQueue.push([
        { id: "contact-abc", email: "user@example.com", emailStatus: "active" },
      ]);
      selectQueue.push([{ name: '<script>alert("XSS")</script>' }]);

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/xss-token", { method: "GET" })
      );

      expect(res.status).toBe(200);
      const html = await res.text();

      expect(html).not.toContain('<script>alert("XSS")</script>');
      expect(html).toContain("&lt;script&gt;");
    });

    it("HTML-escapes topic name containing double-quote injection", async () => {
      mockValidToken("topic-quote");
      selectQueue.push([
        { id: "contact-abc", email: "user@example.com", emailStatus: "active" },
      ]);
      selectQueue.push([{ name: '" onmouseover="evil()"' }]);

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/quote-token", {
          method: "GET",
        })
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).not.toContain('" onmouseover="evil()"');
      expect(html).toContain("&quot;");
    });
  });

  describe("email masking", () => {
    it("masks jane@example.com as j***e@example.com", async () => {
      mockValidToken();
      selectQueue.push([
        {
          id: "contact-jane",
          email: "jane@example.com",
          emailStatus: "active",
        },
      ]);

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/mask-token", {
          method: "GET",
        })
      );

      const html = await res.text();
      expect(html).toContain("j***e@example.com");
      expect(html).not.toContain("jane@example.com");
    });

    it("masks short local-part email (2 chars) with single first char", async () => {
      mockValidToken();
      selectQueue.push([
        { id: "contact-ab", email: "ab@example.com", emailStatus: "active" },
      ]);

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/short-token", {
          method: "GET",
        })
      );

      const html = await res.text();
      expect(html).toContain("a***@example.com");
    });
  });

  describe("response headers", () => {
    it("sets Cache-Control: no-store and Referrer-Policy: no-referrer on error responses", async () => {
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("expired"));

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/any-token", { method: "GET" })
      );

      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    });

    it("sets Cache-Control: no-store on successful responses", async () => {
      mockValidToken();
      selectQueue.push([VALID_CONTACT]);

      const { unsubscribeRoutes } = await import("../routes/unsubscribe");
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(unsubscribeRoutes);
      const res = await app.handle(
        new Request("http://localhost/unsubscribe/ok-token", { method: "GET" })
      );

      expect(res.headers.get("cache-control")).toBe("no-store");
    });
  });
});
