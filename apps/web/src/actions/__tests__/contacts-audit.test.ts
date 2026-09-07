/**
 * Audit Log Instrumentation Tests — Chunk 3 (Contacts)
 *
 * Verifies that createContact, updateContact, deleteContact,
 * bulkCreateContactsFromEmails, bulkDeleteContacts, and importContacts
 * each write a correctly-shaped audit log row after a successful mutation.
 */

import {
  auditLog,
  contact,
  db,
  member,
  organization,
  subscription,
  user,
} from "@wraps/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createContact, deleteContact, updateContact } from "../contacts";
import {
  bulkCreateContactsFromEmails,
  bulkDeleteContacts,
} from "../contacts-bulk";
import { importContacts } from "../import-contacts";

// --- Test fixtures ---

const testUser = {
  id: "audit-v2-contact-user-1",
  email: "audit-v2-contact@example.com",
  name: "Audit V2 Contact User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: "audit-v2-contact-org-1",
  name: "Audit V2 Contact Org",
  slug: "audit-v2-contact-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const otherOrg = {
  id: "audit-v2-contact-org-2",
  name: "Audit V2 Contact Org 2",
  slug: "audit-v2-contact-org-2",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "audit-v2-contact-member-1",
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testSubscription = {
  id: "audit-v2-contact-sub-1",
  plan: "starter",
  referenceId: testOrg.id,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// --- Mocks ---

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: testUser.id, email: testUser.email, name: testUser.name },
        session: {
          id: "audit-v2-contact-session-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "audit-v2-contact-token",
        },
      })),
    },
  },
}));

vi.mock("@/lib/activation-tracking", () => ({
  trackContactCreated: vi.fn(async () => {}),
  trackContactsImported: vi.fn(async () => {}),
}));

// --- DB setup & teardown ---

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(testOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrg.name },
    });

  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });

  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.insert(subscription).values(testSubscription);
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(contact).where(eq(contact.organizationId, otherOrg.id));
  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(organization).where(eq(organization.id, otherOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

afterEach(async () => {
  await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
});

// --- Tests ---

describe("createContact — writes contact.created audit log", () => {
  it("inserts a contact.created audit log row with correct fields", async () => {
    const result = await createContact(testOrg.id, {
      email: "audit-v2-create@example.com",
      emailStatus: "active",
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected success");

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "contact.created")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("contact.created");
    expect(row.resource).toBe("contact");
    expect(row.resourceId).toBe(result.contact.id);
    expect(row.metadata).toMatchObject({
      contactId: result.contact.id,
      email: "audit-v2-create@example.com",
      channel: "email",
    });
  });
});

describe("updateContact — writes contact.updated audit log", () => {
  it("inserts a contact.updated audit log row with correct fields", async () => {
    // Create a contact to update
    const created = await createContact(testOrg.id, {
      email: "audit-v2-update@example.com",
      emailStatus: "active",
    });
    expect(created.success).toBe(true);
    if (!created.success) throw new Error("Expected success");
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));

    const result = await updateContact(created.contact.id, testOrg.id, {
      firstName: "Updated",
      lastName: "Name",
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected success");

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "contact.updated")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("contact.updated");
    expect(row.resource).toBe("contact");
    expect(row.resourceId).toBe(created.contact.id);
    expect(row.metadata).toMatchObject({
      contactId: created.contact.id,
      fields: expect.arrayContaining(["firstName", "lastName"]),
    });
  });
});

describe("deleteContact — writes contact.deleted audit log", () => {
  it("inserts a contact.deleted audit log row with correct fields", async () => {
    const created = await createContact(testOrg.id, {
      email: "audit-v2-delete@example.com",
      emailStatus: "active",
    });
    expect(created.success).toBe(true);
    if (!created.success) throw new Error("Expected success");
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));

    const result = await deleteContact(created.contact.id, testOrg.id);

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "contact.deleted")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("contact.deleted");
    expect(row.resource).toBe("contact");
    expect(row.resourceId).toBe(created.contact.id);
    expect(row.metadata).toMatchObject({ contactId: created.contact.id });
  });
});

describe("bulkCreateContactsFromEmails — writes contact.created_bulk audit log", () => {
  it("inserts a contact.created_bulk audit log row with correct fields", async () => {
    const emails = [
      "audit-v2-bulk-create-1@example.com",
      "audit-v2-bulk-create-2@example.com",
    ];

    const result = await bulkCreateContactsFromEmails(testOrg.id, emails);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected success");

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "contact.created_bulk")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("contact.created_bulk");
    expect(row.resource).toBe("contact");
    expect(row.metadata).toMatchObject({ count: emails.length });
  });
});

describe("bulkDeleteContacts — writes contact.deleted_bulk audit log", () => {
  it("inserts a contact.deleted_bulk audit log row with correct fields", async () => {
    // Create contacts to delete
    const c1 = await createContact(testOrg.id, {
      email: "audit-v2-bulk-del-1@example.com",
      emailStatus: "active",
    });
    const c2 = await createContact(testOrg.id, {
      email: "audit-v2-bulk-del-2@example.com",
      emailStatus: "active",
    });
    expect(c1.success).toBe(true);
    expect(c2.success).toBe(true);
    if (!c1.success || !c2.success) throw new Error("Expected success");
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));

    const contactIds = [c1.contact.id, c2.contact.id];
    const result = await bulkDeleteContacts(testOrg.id, contactIds);

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "contact.deleted_bulk")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("contact.deleted_bulk");
    expect(row.resource).toBe("contact");
    expect(row.metadata).toMatchObject({ count: contactIds.length });

    const remaining = await db
      .select()
      .from(contact)
      .where(inArray(contact.id, contactIds));
    expect(remaining).toHaveLength(0);
  });

  it("does not delete another organization's contact", async () => {
    await db
      .insert(organization)
      .values(otherOrg)
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: otherOrg.name },
      });

    const ownContact = await createContact(testOrg.id, {
      email: "audit-v2-bulk-del-own@example.com",
      emailStatus: "active",
    });
    expect(ownContact.success).toBe(true);
    if (!ownContact.success) {
      throw new Error("Expected success");
    }

    // testUser is not a member of otherOrg, so this contact must be seeded
    // directly rather than through the createContact action.
    const foreignContactId = "audit-v2-bulk-del-foreign-1";
    await db.insert(contact).values({
      id: foreignContactId,
      organizationId: otherOrg.id,
      email: "audit-v2-bulk-del-foreign@example.com",
      emailStatus: "active",
      status: "active",
    });

    const result = await bulkDeleteContacts(testOrg.id, [
      ownContact.contact.id,
      foreignContactId,
    ]);

    expect(result.success).toBe(true);

    const stillThere = await db
      .select()
      .from(contact)
      .where(eq(contact.id, foreignContactId));
    expect(stillThere).toHaveLength(1);

    await db.delete(contact).where(eq(contact.organizationId, otherOrg.id));
    await db.delete(organization).where(eq(organization.id, otherOrg.id));
  });
});

describe("importContacts — writes contact.imported audit log", () => {
  it("inserts a contact.imported audit log row with correct fields", async () => {
    const result = await importContacts(testOrg.id, {
      contacts: [
        { email: "audit-v2-import-1@example.com" },
        { email: "audit-v2-import-2@example.com" },
      ],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected success");

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "contact.imported")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("contact.imported");
    expect(row.resource).toBe("contact");
    expect(row.metadata).toMatchObject({
      count: result.created,
      updated: result.updated,
    });
  });
});
