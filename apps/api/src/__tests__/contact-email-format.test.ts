/**
 * BUG-012: Contact email format validation
 *
 * Verifies that POST /v1/contacts and PATCH /v1/contacts/:id reject
 * invalid email strings at the schema validation layer (422) before
 * any database access occurs.
 */

import { Elysia } from "elysia";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Mocks must be declared before any imports that use them
vi.mock("@wraps/db", async () => ({
  // Real constant, not a copy: routes/contacts.ts builds its emailStatus
  // validators from it.
  EMAIL_STATUSES: (
    await vi.importActual<typeof import("@wraps/db")>("@wraps/db")
  ).EMAIL_STATUSES,
  contact: {
    id: "id",
    organizationId: "organization_id",
    externalId: "external_id",
    email: "email",
    emailHash: "email_hash",
    phone: "phone",
    phoneHash: "phone_hash",
    emailStatus: "email_status",
    smsStatus: "sms_status",
    preferredChannel: "preferred_channel",
    properties: "properties",
    emailsSent: "emails_sent",
    emailsOpened: "emails_opened",
    emailsClicked: "emails_clicked",
    smsSent: "sms_sent",
    smsClicked: "sms_clicked",
    createdAt: "created_at",
    updatedAt: "updated_at",
    createdBy: "created_by",
    firstName: "first_name",
    lastName: "last_name",
    company: "company",
    jobTitle: "job_title",
  },
  contactTopic: {
    contactId: "contact_id",
    topicId: "topic_id",
    status: "status",
    subscribedAt: "subscribed_at",
    confirmedAt: "confirmed_at",
    unsubscribedAt: "unsubscribed_at",
  },
  topic: {
    id: "id",
    name: "name",
    slug: "slug",
    description: "description",
    organizationId: "organization_id",
    doubleOptIn: "double_opt_in",
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ inArray: [a, b] })),
  desc: vi.fn((a: unknown) => ({ desc: a })),
  sql: vi.fn((strings: unknown, ...values: unknown[]) => ({
    sql: strings,
    values,
  })),
  // repository functions
  hashContactValue: vi.fn((v: string) => `hash-${v}`),
  findContactByExternalId: vi.fn().mockResolvedValue(null),
  findContactByEmailHash: vi.fn().mockResolvedValue(null),
  findContactByPhoneHash: vi.fn().mockResolvedValue(null),
  insertContact: vi.fn().mockResolvedValue({
    id: "new-contact-id",
    organizationId: "org-123",
    externalId: null,
    email: "valid@example.com",
    emailHash: "abc123",
    phone: null,
    phoneHash: null,
    firstName: null,
    lastName: null,
    company: null,
    jobTitle: null,
    emailStatus: "active",
    smsStatus: null,
    preferredChannel: null,
    properties: {},
    emailsSent: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    smsSent: 0,
    smsClicked: 0,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    createdBy: "user-123",
  }),
  resolveTopicSlugs: vi.fn().mockResolvedValue([]),
  fetchTopicsForSubscription: vi.fn().mockResolvedValue([]),
  insertContactTopics: vi.fn().mockResolvedValue(undefined),
  fetchTopicNamesByIds: vi.fn().mockResolvedValue(new Map()),
  resolveContactId: vi.fn().mockResolvedValue("contact-123"),
  fetchContactSubscriptions: vi.fn().mockResolvedValue([]),
  updateContactFields: vi.fn().mockResolvedValue({
    id: "contact-123",
    email: "valid@example.com",
    emailStatus: "active",
    smsStatus: null,
    preferredChannel: null,
    properties: {},
    emailsSent: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    smsSent: 0,
    smsClicked: 0,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  }),
  listContacts: vi.fn().mockResolvedValue({ contacts: [], total: 0 }),
  findContact: vi.fn().mockResolvedValue(null),
  reactivateContactSubscriptions: vi.fn().mockResolvedValue(undefined),
  setPendingContactSubscriptions: vi.fn().mockResolvedValue(undefined),
  deleteContact: vi.fn().mockResolvedValue(undefined),
  bulkDeleteContacts: vi.fn().mockResolvedValue(0),
}));

vi.mock("@wraps/email", () => ({
  sendTopicConfirmationEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("../services/workflow-events", () => ({
  emitContactCreated: vi.fn().mockResolvedValue(undefined),
  emitContactUpdated: vi.fn().mockResolvedValue(undefined),
  emitTopicSubscribed: vi.fn().mockResolvedValue(undefined),
  checkSegmentEntry: vi.fn().mockResolvedValue(undefined),
  checkSegmentExit: vi.fn().mockResolvedValue(undefined),
}));

import { contactsRoutes } from "../routes/contacts";

const mockAuthContext = {
  apiKeyId: "key-123",
  organizationId: "org-123",
  userId: "user-123",
  planId: "starter",
};

function createTestApp() {
  return new Elysia()
    .derive(() => ({ auth: mockAuthContext }))
    .use(contactsRoutes);
}

describe("Contact email format validation (BUG-012)", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("POST /v1/contacts", () => {
    it("rejects invalid email format with 422", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "not-an-email" }),
        })
      );

      expect(response.status).toBe(422);
    });

    it("rejects missing @ symbol with 422", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invalidemail.com" }),
        })
      );

      expect(response.status).toBe(422);
    });

    it("accepts a valid email format", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "valid@example.com" }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.email).toBe("valid@example.com");
    });
  });

  describe("PATCH /v1/contacts/:id", () => {
    it("rejects invalid email format with 422", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/contacts/contact-123", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "not-an-email" }),
        })
      );

      expect(response.status).toBe(422);
    });
  });
});
