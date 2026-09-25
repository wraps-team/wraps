/**
 * Preference Events Route Tests
 *
 * Tests that the preference-events route correctly emits
 * workflow events when contacts change topic subscriptions
 * via the public preference center.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock jose for token verification
const mockJwtVerify = vi.fn();
vi.mock("jose", async (importOriginal) => ({
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
  errors: (await importOriginal<typeof import("jose")>()).errors,
}));

// Mock workflow events
const mockEmitTopicSubscribed = vi
  .fn()
  .mockResolvedValue({ workflowsTriggered: 0 });
const mockEmitTopicUnsubscribed = vi
  .fn()
  .mockResolvedValue({ workflowsTriggered: 0, executionsCancelled: 0 });

vi.mock("../services/workflow-events", () => ({
  emitTopicSubscribed: (...args: unknown[]) => mockEmitTopicSubscribed(...args),
  emitTopicUnsubscribed: (...args: unknown[]) =>
    mockEmitTopicUnsubscribed(...args),
}));

// Mock database (not used by this route, but imported transitively)
vi.mock("@wraps/db", () => ({
  db: {},
  eq: vi.fn(),
  and: vi.fn(),
}));

describe("Preference Events Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /v1/preference-events", () => {
    it("should reject requests with invalid JWT token", async () => {
      // Token verification fails
      mockJwtVerify.mockRejectedValue(new Error("Invalid token"));

      const { preferenceEventsRoutes } = await import(
        "../routes/preference-events"
      );
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(preferenceEventsRoutes);

      const response = await app.handle(
        new Request("http://localhost/v1/preference-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: "invalid-token",
            contactId: "contact-123",
            organizationId: "org-123",
            changes: [],
          }),
        })
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it("should emit topic_unsubscribed for unsubscribe changes", async () => {
      // Valid token
      mockJwtVerify.mockResolvedValue({
        payload: { cid: "contact-123", oid: "org-123", type: "unsub" },
      });

      const { preferenceEventsRoutes } = await import(
        "../routes/preference-events"
      );
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(preferenceEventsRoutes);

      const response = await app.handle(
        new Request("http://localhost/v1/preference-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: "valid-token",
            contactId: "contact-123",
            organizationId: "org-123",
            changes: [
              {
                topicId: "topic-promo",
                topicName: "Promotions",
                action: "unsubscribed",
              },
            ],
          }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.unsubscribed).toBe(1);

      expect(mockEmitTopicUnsubscribed).toHaveBeenCalledWith({
        contactId: "contact-123",
        organizationId: "org-123",
        topicId: "topic-promo",
        topicName: "Promotions",
      });
    });
    it("should emit topic_subscribed for subscribe changes", async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { cid: "contact-123", oid: "org-123", type: "unsub" },
      });

      const { preferenceEventsRoutes } = await import(
        "../routes/preference-events"
      );
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(preferenceEventsRoutes);

      const response = await app.handle(
        new Request("http://localhost/v1/preference-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: "valid-token",
            contactId: "contact-123",
            organizationId: "org-123",
            changes: [
              {
                topicId: "topic-news",
                topicName: "Newsletter",
                action: "subscribed",
              },
            ],
          }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.subscribed).toBe(1);

      expect(mockEmitTopicSubscribed).toHaveBeenCalledWith({
        contactId: "contact-123",
        organizationId: "org-123",
        topicId: "topic-news",
        topicName: "Newsletter",
      });
      expect(mockEmitTopicUnsubscribed).not.toHaveBeenCalled();
    });

    it("should handle mixed subscribe and unsubscribe in one request", async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { cid: "contact-123", oid: "org-123", type: "unsub" },
      });

      const { preferenceEventsRoutes } = await import(
        "../routes/preference-events"
      );
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(preferenceEventsRoutes);

      const response = await app.handle(
        new Request("http://localhost/v1/preference-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: "valid-token",
            contactId: "contact-123",
            organizationId: "org-123",
            changes: [
              {
                topicId: "topic-news",
                topicName: "Newsletter",
                action: "subscribed",
              },
              {
                topicId: "topic-promo",
                topicName: "Promotions",
                action: "unsubscribed",
              },
              {
                topicId: "topic-updates",
                topicName: "Updates",
                action: "subscribed",
              },
            ],
          }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.subscribed).toBe(2);
      expect(body.unsubscribed).toBe(1);

      expect(mockEmitTopicSubscribed).toHaveBeenCalledTimes(2);
      expect(mockEmitTopicUnsubscribed).toHaveBeenCalledTimes(1);
    });

    it("should return success with empty changes array", async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { cid: "contact-123", oid: "org-123", type: "unsub" },
      });

      const { preferenceEventsRoutes } = await import(
        "../routes/preference-events"
      );
      const { Elysia } = await import("elysia");

      const app = new Elysia().use(preferenceEventsRoutes);

      const response = await app.handle(
        new Request("http://localhost/v1/preference-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: "valid-token",
            contactId: "contact-123",
            organizationId: "org-123",
            changes: [],
          }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.subscribed).toBe(0);
      expect(body.unsubscribed).toBe(0);
      expect(mockEmitTopicSubscribed).not.toHaveBeenCalled();
      expect(mockEmitTopicUnsubscribed).not.toHaveBeenCalled();
    });
  });
});
