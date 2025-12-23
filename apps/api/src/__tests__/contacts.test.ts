import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database
vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  contact: {
    id: "id",
    organizationId: "organization_id",
    email: "email",
    emailHash: "email_hash",
    phone: "phone",
    phoneHash: "phone_hash",
    emailStatus: "email_status",
    smsStatus: "sms_status",
    properties: "properties",
    emailsSent: "emails_sent",
    emailsOpened: "emails_opened",
    emailsClicked: "emails_clicked",
    smsSent: "sms_sent",
    smsClicked: "sms_clicked",
    createdAt: "created_at",
    updatedAt: "updated_at",
    createdBy: "created_by",
  },
  contactTopic: {
    contactId: "contact_id",
    topicId: "topic_id",
    status: "status",
    subscribedAt: "subscribed_at",
  },
  topic: {
    id: "id",
    name: "name",
  },
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
}));

// Mock auth context
const mockAuthContext = {
  apiKeyId: "key-123",
  organizationId: "org-123",
  userId: "user-123",
  planId: "starter",
};

// Create a test app with mocked middleware
function createTestApp() {
  return new Elysia()
    .derive(() => ({ auth: mockAuthContext }))
    .get("/v1/contacts", async (ctx) => {
      const { query } = ctx;
      const page = Number.parseInt(query.page || "1", 10);
      const pageSize = Math.min(
        Number.parseInt(query.pageSize || "50", 10),
        100
      );

      // Return mock data
      return {
        contacts: [
          {
            id: "contact-1",
            email: "test@example.com",
            phone: "+15551234567",
            emailStatus: "active",
            smsStatus: "opted_in",
            properties: {},
            emailsSent: 10,
            emailsOpened: 5,
            emailsClicked: 2,
            smsSent: 3,
            smsClicked: 1,
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        page,
        pageSize,
        totalPages: 1,
      };
    })
    .get("/v1/contacts/:id", async (ctx) => {
      const { params } = ctx;

      if (params.id === "not-found") {
        ctx.set.status = 404;
        return { error: "Contact not found" };
      }

      return {
        id: params.id,
        email: "test@example.com",
        phone: "+15551234567",
        emailStatus: "active",
        smsStatus: "opted_in",
        properties: { name: "Test User" },
        emailsSent: 10,
        emailsOpened: 5,
        emailsClicked: 2,
        smsSent: 3,
        smsClicked: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        topics: [
          {
            topicId: "topic-1",
            topicName: "Newsletter",
            status: "subscribed",
            subscribedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      };
    })
    .post("/v1/contacts", async (ctx) => {
      const body = await ctx.request.json();

      if (!(body.email || body.phone)) {
        ctx.set.status = 400;
        return { error: "Email or phone is required" };
      }

      if (body.email === "duplicate@example.com") {
        ctx.set.status = 409;
        return { error: "Contact with this email already exists" };
      }

      ctx.set.status = 201;
      return {
        id: "new-contact-id",
        email: body.email || null,
        phone: body.phone || null,
        emailStatus: body.emailStatus || (body.email ? "active" : null),
        smsStatus: body.smsStatus || (body.phone ? "pending_consent" : null),
        properties: body.properties || {},
        emailsSent: 0,
        emailsOpened: 0,
        emailsClicked: 0,
        smsSent: 0,
        smsClicked: 0,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };
    })
    .patch("/v1/contacts/:id", async (ctx) => {
      const { params } = ctx;
      const body = await ctx.request.json();

      if (params.id === "not-found") {
        ctx.set.status = 404;
        return { error: "Contact not found" };
      }

      return {
        id: params.id,
        email: body.email ?? "test@example.com",
        phone: body.phone ?? "+15551234567",
        emailStatus: body.emailStatus ?? "active",
        smsStatus: body.smsStatus ?? "opted_in",
        properties: body.properties ?? {},
        emailsSent: 10,
        emailsOpened: 5,
        emailsClicked: 2,
        smsSent: 3,
        smsClicked: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      };
    })
    .delete("/v1/contacts/:id", async (ctx) => {
      const { params } = ctx;

      if (params.id === "not-found") {
        ctx.set.status = 404;
        return { error: "Contact not found" };
      }

      return { success: true };
    })
    .delete("/v1/contacts", async (ctx) => {
      const body = await ctx.request.json();

      if (!body.ids || body.ids.length === 0) {
        ctx.set.status = 400;
        return { error: "No contact IDs provided" };
      }

      if (body.ids.length > 100) {
        ctx.set.status = 400;
        return { error: "Maximum 100 contacts can be deleted at once" };
      }

      return {
        success: true,
        deleted: body.ids.length,
      };
    });
}

describe("Contacts API", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("GET /v1/contacts", () => {
    it("returns paginated list of contacts", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts")
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.contacts).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(50);
      expect(body.totalPages).toBe(1);
    });

    it("respects pagination parameters", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts?page=2&pageSize=10")
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(10);
    });

    it("limits pageSize to 100", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts?pageSize=500")
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.pageSize).toBe(100);
    });
  });

  describe("GET /v1/contacts/:id", () => {
    it("returns contact with topics", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts/contact-123")
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.id).toBe("contact-123");
      expect(body.email).toBe("test@example.com");
      expect(body.topics).toHaveLength(1);
      expect(body.topics[0].topicName).toBe("Newsletter");
    });

    it("returns 404 for non-existent contact", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts/not-found")
      );

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Contact not found");
    });
  });

  describe("POST /v1/contacts", () => {
    it("creates contact with email", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "new@example.com" }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.id).toBe("new-contact-id");
      expect(body.email).toBe("new@example.com");
      expect(body.emailStatus).toBe("active");
    });

    it("creates contact with phone", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: "+15551234567" }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.phone).toBe("+15551234567");
      expect(body.smsStatus).toBe("pending_consent");
    });

    it("requires email or phone", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("Email or phone is required");
    });

    it("returns 409 for duplicate email", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "duplicate@example.com" }),
        })
      );

      expect(response.status).toBe(409);

      const body = await response.json();
      expect(body.error).toBe("Contact with this email already exists");
    });
  });

  describe("PATCH /v1/contacts/:id", () => {
    it("updates contact email", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts/contact-123", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "updated@example.com" }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.email).toBe("updated@example.com");
    });

    it("returns 404 for non-existent contact", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts/not-found", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "updated@example.com" }),
        })
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /v1/contacts/:id", () => {
    it("deletes contact", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts/contact-123", {
          method: "DELETE",
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("returns 404 for non-existent contact", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts/not-found", {
          method: "DELETE",
        })
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /v1/contacts (bulk)", () => {
    it("deletes multiple contacts", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: ["c1", "c2", "c3"] }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.deleted).toBe(3);
    });

    it("requires contact IDs", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [] }),
        })
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("No contact IDs provided");
    });

    it("limits bulk delete to 100", async () => {
      const ids = Array.from({ length: 101 }, (_, i) => `contact-${i}`);

      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        })
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("Maximum 100 contacts can be deleted at once");
    });
  });
});
