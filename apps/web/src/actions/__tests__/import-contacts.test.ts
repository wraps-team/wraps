/**
 * Import Contacts Security Tests
 *
 * Verifies that:
 * - importContacts rejects payloads exceeding MAX_IMPORT_SIZE (10,000)
 * - topicIds supplied by the caller are validated against the requesting org
 *   (cross-org IDOR: a topic owned by another org must be silently dropped)
 */

import {
  contact,
  contactTopic,
  db,
  member,
  organization,
  subscription,
  topic,
  user,
} from "@wraps/db";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { importContacts } from "../import-contacts";

// ─── Test fixtures ─────────────────────────────────────────────────────────

const testUser = {
  id: "import-sec-user-1",
  email: "import-sec@example.com",
  name: "Import Security User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: "import-sec-org-1",
  name: "Import Security Org",
  slug: "import-sec-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const foreignOrg = {
  id: "import-sec-foreign-org-1",
  name: "Foreign Org",
  slug: "import-sec-foreign-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "import-sec-member-1",
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testSubscription = {
  id: "import-sec-sub-1",
  plan: "scale",
  referenceId: testOrg.id,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ownTopic = {
  id: "import-sec-own-topic-1",
  organizationId: testOrg.id,
  name: "Own Topic",
  slug: "import-sec-own-topic",
  description: null,
  public: true,
  doubleOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
};

const foreignTopic = {
  id: "import-sec-foreign-topic-1",
  organizationId: foreignOrg.id,
  name: "Foreign Topic",
  slug: "import-sec-foreign-topic",
  description: null,
  public: true,
  doubleOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
};

// ─── Mocks ─────────────────────────────────────────────────────────────────

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
      })),
    },
  },
}));

vi.mock("@/lib/activation-tracking", () => ({
  trackContactsImported: vi.fn(),
}));

// ─── DB setup & teardown ────────────────────────────────────────────────────

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
    .insert(organization)
    .values(foreignOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: foreignOrg.name },
    });

  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });

  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.insert(subscription).values(testSubscription);

  await db
    .insert(topic)
    .values(ownTopic)
    .onConflictDoUpdate({ target: topic.id, set: { name: ownTopic.name } });
  await db
    .insert(topic)
    .values(foreignTopic)
    .onConflictDoUpdate({ target: topic.id, set: { name: foreignTopic.name } });
});

afterAll(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(topic).where(eq(topic.id, ownTopic.id));
  await db.delete(topic).where(eq(topic.id, foreignTopic.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(organization).where(eq(organization.id, foreignOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("importContacts — MAX_IMPORT_SIZE guard", () => {
  it("rejects a batch larger than 10,000 contacts", async () => {
    const oversizedBatch = Array.from({ length: 10_001 }, (_, i) => ({
      email: `overflow-${i}@example.com`,
    }));

    const result = await importContacts(testOrg.id, {
      contacts: oversizedBatch,
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/10[,.]?000/);
    }
  });

  it("does not return a size error for a batch of 1 contact", async () => {
    const result = await importContacts(testOrg.id, {
      contacts: [{ email: "maxbatch-boundary@example.com" }],
      duplicateStrategy: "skip",
    });

    // Should not error on size — any failure must be for a different reason
    if (!result.success) {
      expect((result as { success: false; error: string }).error).not.toMatch(
        /10[,.]?000|maximum/i
      );
    }
  });
});

describe("importContacts — topicId cross-org IDOR", () => {
  it("does not subscribe imported contacts to a foreign-org topic", async () => {
    const result = await importContacts(testOrg.id, {
      contacts: [{ email: "import-idor-1@example.com" }],
      topicIds: [foreignTopic.id],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);

    if (result.success && result.created > 0) {
      // Find the created contact
      const [created] = await db
        .select({ id: contact.id })
        .from(contact)
        .where(
          and(
            eq(contact.organizationId, testOrg.id),
            eq(contact.email, "import-idor-1@example.com")
          )
        )
        .limit(1);

      expect(created).toBeDefined();

      // Verify no contactTopic row was created for the foreign topic
      const subs = await db
        .select()
        .from(contactTopic)
        .where(
          and(
            eq(contactTopic.contactId, created.id),
            eq(contactTopic.topicId, foreignTopic.id)
          )
        );

      expect(subs).toHaveLength(0);
    }
  });

  it("subscribes imported contacts to own-org topics and drops foreign topics", async () => {
    const result = await importContacts(testOrg.id, {
      contacts: [{ email: "import-mixed-topics@example.com" }],
      topicIds: [ownTopic.id, foreignTopic.id],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);

    if (result.success && result.created > 0) {
      const [created] = await db
        .select({ id: contact.id })
        .from(contact)
        .where(
          and(
            eq(contact.organizationId, testOrg.id),
            eq(contact.email, "import-mixed-topics@example.com")
          )
        )
        .limit(1);

      expect(created).toBeDefined();

      const subs = await db
        .select()
        .from(contactTopic)
        .where(
          and(
            eq(contactTopic.contactId, created.id),
            inArray(contactTopic.topicId, [ownTopic.id, foreignTopic.id])
          )
        );

      const subscribedTopicIds = subs.map((s) => s.topicId);
      // Own topic is subscribed
      expect(subscribedTopicIds).toContain(ownTopic.id);
      // Foreign topic is silently dropped
      expect(subscribedTopicIds).not.toContain(foreignTopic.id);
    }
  });
});
