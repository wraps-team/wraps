/**
 * Contacts IDOR Security Tests
 *
 * Tests that all contacts route handlers scope DB calls to the authenticated
 * organization, preventing cross-org data access or mutation.
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListContacts,
  mockFindContact,
  mockFindContactByEmailHash,
  mockFindContactByExternalId,
  mockFindContactByPhoneHash,
  mockInsertContact,
  mockInsertContactTopics,
  mockResolveContactId,
  mockUpdateContactFields,
  mockDeleteContact,
  mockBulkDeleteContacts,
  mockFetchContactSubscriptions,
  mockFetchTopicsForSubscription,
  mockFetchTopicNamesByIds,
  mockResolveTopicSlugs,
  mockReactivateContactSubscriptions,
  mockSetPendingContactSubscriptions,
} = vi.hoisted(() => ({
  mockListContacts: vi.fn(),
  mockFindContact: vi.fn(),
  mockFindContactByEmailHash: vi.fn(),
  mockFindContactByExternalId: vi.fn(),
  mockFindContactByPhoneHash: vi.fn(),
  mockInsertContact: vi.fn(),
  mockInsertContactTopics: vi.fn(async () => {}),
  mockResolveContactId: vi.fn(),
  mockUpdateContactFields: vi.fn(),
  mockDeleteContact: vi.fn(async () => {}),
  mockBulkDeleteContacts: vi.fn(),
  mockFetchContactSubscriptions: vi.fn(),
  mockFetchTopicsForSubscription: vi.fn(),
  mockFetchTopicNamesByIds: vi.fn(),
  mockResolveTopicSlugs: vi.fn(),
  mockReactivateContactSubscriptions: vi.fn(async () => {}),
  mockSetPendingContactSubscriptions: vi.fn(async () => {}),
}));

vi.mock("@wraps/db", async () => ({
  // Pulled from the real module, never re-listed: the route derives its
  // emailStatus validators from this constant, and a hand-written copy here
  // would be the drift the constant exists to stop.
  EMAIL_STATUSES: (
    await vi.importActual<typeof import("@wraps/db")>("@wraps/db")
  ).EMAIL_STATUSES,
  listContacts: mockListContacts,
  findContact: mockFindContact,
  findContactByEmailHash: mockFindContactByEmailHash,
  findContactByExternalId: mockFindContactByExternalId,
  findContactByPhoneHash: mockFindContactByPhoneHash,
  hashContactValue: (v: string) => `hash-${v}`,
  insertContact: mockInsertContact,
  insertContactTopics: mockInsertContactTopics,
  resolveContactId: mockResolveContactId,
  updateContactFields: mockUpdateContactFields,
  deleteContact: mockDeleteContact,
  bulkDeleteContacts: mockBulkDeleteContacts,
  fetchContactSubscriptions: mockFetchContactSubscriptions,
  fetchTopicsForSubscription: mockFetchTopicsForSubscription,
  fetchTopicNamesByIds: mockFetchTopicNamesByIds,
  resolveTopicSlugs: mockResolveTopicSlugs,
  reactivateContactSubscriptions: mockReactivateContactSubscriptions,
  setPendingContactSubscriptions: mockSetPendingContactSubscriptions,
  // contact Drizzle table object — only used in sql`` template on properties PATCH path
  contact: { properties: {} },
}));

vi.mock("@wraps/email", () => ({
  sendTopicConfirmationEmail: vi.fn(async () => {}),
}));

vi.mock("../middleware/auth", () => ({
  getAuth: (ctx: { auth: unknown }) => ctx.auth,
  getAuthOptional: (ctx: { auth: unknown }) => ctx.auth ?? null,
  createAuthenticatedRoutes: vi.fn((prefix: string) =>
    new Elysia({ prefix }).derive(() => ({
      auth: {
        apiKeyId: "key-123",
        organizationId: "org-123",
        userId: "user-123",
        planId: "pro",
      },
      authError: null,
    }))
  ),
}));

vi.mock("../services/workflow-events", () => ({
  checkSegmentEntry: vi.fn(async () => {}),
  checkSegmentExit: vi.fn(async () => {}),
  emitContactCreated: vi.fn(async () => {}),
  emitContactUpdated: vi.fn(async () => {}),
  emitTopicSubscribed: vi.fn(async () => {}),
}));

// Import after mocks are set up
const { contactsRoutes } = await import("../routes/contacts");

function createApp() {
  return new Elysia().use(contactsRoutes);
}

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-1",
    externalId: null,
    email: "a@example.com",
    phone: null,
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
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("Contacts IDOR Prevention", () => {
  beforeEach(() => {
    mockListContacts.mockReset();
    mockFindContact.mockReset();
    mockFindContactByEmailHash.mockReset();
    mockFindContactByExternalId.mockReset();
    mockFindContactByPhoneHash.mockReset();
    mockInsertContact.mockReset();
    mockInsertContactTopics.mockReset();
    mockResolveContactId.mockReset();
    mockUpdateContactFields.mockReset();
    mockDeleteContact.mockReset();
    mockBulkDeleteContacts.mockReset();
    mockFetchContactSubscriptions.mockReset();
    mockFetchTopicsForSubscription.mockReset();
    mockFetchTopicNamesByIds.mockReset();
    mockResolveTopicSlugs.mockReset();
    mockReactivateContactSubscriptions.mockReset();
    mockSetPendingContactSubscriptions.mockReset();
  });

  // 1. Cross-org GET /:id — findContact returns null → 404
  it("returns 404 when GET contact belongs to a different org", async () => {
    mockFindContact.mockResolvedValueOnce(null);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/contacts/contact-other-org")
    );

    expect(response.status).toBe(404);
    expect(mockFindContact).toHaveBeenCalledWith(
      "contact-other-org",
      "org-123"
    );
  });

  // 2. Happy GET /:id control — returns 200 with the contact
  it("returns 200 for GET single contact that belongs to the authenticated org", async () => {
    mockFindContact.mockResolvedValueOnce({
      ...makeContact(),
      topics: [],
    });

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/contacts/contact-1")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe("contact-1");
  });

  // 3. Cross-org PATCH — resolveContactId returns null → 404, no mutation
  it("returns 404 when PATCH target contact belongs to a different org", async () => {
    mockResolveContactId.mockResolvedValueOnce(null);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/contacts/contact-other-org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "Attacker" }),
      })
    );

    expect(response.status).toBe(404);
    expect(mockUpdateContactFields).not.toHaveBeenCalled();
    expect(mockInsertContactTopics).not.toHaveBeenCalled();
    expect(mockFetchContactSubscriptions).not.toHaveBeenCalled();
  });

  // 4. Happy PATCH control — resolveContactId resolves, update is scoped to org
  it("calls updateContactFields with org-123 on successful PATCH", async () => {
    mockResolveContactId.mockResolvedValueOnce("contact-1");
    mockUpdateContactFields.mockResolvedValueOnce(makeContact());

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/contacts/contact-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "Jane" }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockUpdateContactFields).toHaveBeenCalledWith(
      "contact-1",
      "org-123",
      expect.anything()
    );
  });

  // 5. Cross-org DELETE /:id — resolveContactId returns null → 404, no delete
  it("returns 404 when DELETE target contact belongs to a different org", async () => {
    mockResolveContactId.mockResolvedValueOnce(null);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/contacts/contact-other-org", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(404);
    expect(mockDeleteContact).not.toHaveBeenCalled();
  });

  // 6. Happy DELETE control — deleteContact called with org-123
  it("calls deleteContact with org-123 on successful DELETE /:id", async () => {
    mockResolveContactId.mockResolvedValueOnce("contact-1");

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/contacts/contact-1", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(mockDeleteContact).toHaveBeenCalledWith("contact-1", "org-123");
  });

  // 7. Bulk delete — bulkDeleteContacts receives the org-123 scope
  it("passes org-123 to bulkDeleteContacts regardless of supplied IDs", async () => {
    mockBulkDeleteContacts.mockResolvedValueOnce(1);

    const ids = ["contact-own", "contact-foreign"];
    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockBulkDeleteContacts).toHaveBeenCalledWith(ids, "org-123");
  });

  // 8. Topic resolution is org-scoped (POST)
  it("passes org-123 to resolveTopicSlugs and fetchTopicsForSubscription on POST", async () => {
    mockFindContactByEmailHash.mockResolvedValueOnce(null);
    mockInsertContact.mockResolvedValueOnce(makeContact());
    mockResolveTopicSlugs.mockResolvedValueOnce(["topic-1"]);
    mockFetchTopicsForSubscription.mockResolvedValueOnce([
      { id: "topic-1", name: "News", description: null, doubleOptIn: false },
    ]);
    mockFetchTopicNamesByIds.mockResolvedValueOnce(
      new Map([["topic-1", "News"]])
    );

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          topicSlugs: ["news"],
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(mockResolveTopicSlugs).toHaveBeenCalledWith(["news"], "org-123");
    expect(mockFetchTopicsForSubscription).toHaveBeenCalledWith(
      ["topic-1"],
      "org-123"
    );
  });

  // 9. List is org-scoped
  it("passes org-123 as first argument to listContacts", async () => {
    mockListContacts.mockResolvedValueOnce({ contacts: [], total: 0 });

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/contacts")
    );

    expect(response.status).toBe(200);
    expect(mockListContacts).toHaveBeenCalledWith(
      "org-123",
      expect.anything(),
      expect.anything()
    );
  });
});
