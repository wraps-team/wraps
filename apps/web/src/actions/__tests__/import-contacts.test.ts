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

// ─── Duplicate handling (audit F20) ────────────────────────────────────────
// import-contacts.test.ts previously covered only the row cap and the topic
// IDOR case. Nothing pinned what "skip" vs "update" actually do to the
// existing row, or the returned counters a caller renders in the import
// summary toast.

describe("importContacts — duplicate handling", () => {
  it("skip strategy leaves the existing contact untouched and counts it skipped, not created or updated", async () => {
    const email = "dup-skip-1@example.com";

    const first = await importContacts(testOrg.id, {
      contacts: [{ email, firstName: "Original" }],
      duplicateStrategy: "skip",
    });
    expect(first.success).toBe(true);

    const second = await importContacts(testOrg.id, {
      contacts: [{ email, firstName: "Changed" }],
      duplicateStrategy: "skip",
    });

    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.created).toBe(0);
      expect(second.updated).toBe(0);
      expect(second.skipped).toBe(1);
    }

    const rows = await db
      .select({ firstName: contact.firstName })
      .from(contact)
      .where(
        and(eq(contact.organizationId, testOrg.id), eq(contact.email, email))
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe("Original");
  });

  it("update strategy updates the existing contact and counts it updated, not created or skipped", async () => {
    const email = "dup-update-1@example.com";

    await importContacts(testOrg.id, {
      contacts: [{ email, firstName: "Original" }],
      duplicateStrategy: "skip",
    });

    const second = await importContacts(testOrg.id, {
      contacts: [{ email, firstName: "Changed" }],
      duplicateStrategy: "update",
    });

    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.created).toBe(0);
      expect(second.updated).toBe(1);
      expect(second.skipped).toBe(0);
    }

    const rows = await db
      .select({ firstName: contact.firstName })
      .from(contact)
      .where(
        and(eq(contact.organizationId, testOrg.id), eq(contact.email, email))
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe("Changed");
  });

  it("processes a mixed batch of new and duplicate rows with correct counts for each", async () => {
    const existingEmail = "dup-mixed-existing@example.com";

    await importContacts(testOrg.id, {
      contacts: [{ email: existingEmail, firstName: "Before" }],
      duplicateStrategy: "skip",
    });

    const result = await importContacts(testOrg.id, {
      contacts: [
        { email: existingEmail, firstName: "After" },
        { email: "dup-mixed-new-1@example.com" },
        { email: "dup-mixed-new-2@example.com" },
      ],
      duplicateStrategy: "update",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(2);
      expect(result.updated).toBe(1);
      expect(result.skipped).toBe(0);
    }
  });
});

// ─── Per-row error reporting (audit F20) ───────────────────────────────────
// No prior test asserted anything about `result.errors` — the array a bad
// row's index and message land in for the importer's per-row report.

describe("importContacts — per-row error reporting", () => {
  it("reports an invalid-email row by its 1-based row index and skips only that row", async () => {
    const result = await importContacts(testOrg.id, {
      contacts: [
        { email: "err-good-row-1@example.com" },
        { email: "not-an-email" },
        { email: "err-good-row-2@example.com" },
      ],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(2);
      expect(result.errors[0].error).toMatch(/invalid email/i);
    }
  });

  it("reports a row with neither email nor phone as an error and creates nothing for it", async () => {
    const result = await importContacts(testOrg.id, {
      contacts: [{ firstName: "No Contact Info" }],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(1);
      expect(result.errors[0].error).toMatch(/email or phone/i);
    }
  });

  it("keeps row indices aligned to the input array when good and bad rows are interleaved", async () => {
    const result = await importContacts(testOrg.id, {
      contacts: [
        { email: "err-interleave-1@example.com" },
        { email: "bad-1" },
        { email: "err-interleave-2@example.com" },
        { email: "bad-2" },
      ],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(2);
      expect(result.errors.map((e) => e.row)).toEqual([2, 4]);
    }
  });
});

// ─── emailStatus / emailVerifiedAt assignment (audit F11, F20) ─────────────
// The importer hard-codes `emailStatus: "active"` for a brand-new email
// contact — there is nothing to un-suppress since the row doesn't exist yet.
// The resurrection risk is on the *update* path, which
// import-contacts-properties-db.test.ts already pins does not touch
// emailStatus. These tests pin what a fresh insert actually writes.

describe("importContacts — emailStatus and emailVerifiedAt on new contacts", () => {
  it("sets a new email contact to active with a verified timestamp", async () => {
    const email = "status-active@example.com";

    await importContacts(testOrg.id, {
      contacts: [{ email }],
      duplicateStrategy: "skip",
    });

    const [row] = await db
      .select({
        emailStatus: contact.emailStatus,
        emailVerifiedAt: contact.emailVerifiedAt,
      })
      .from(contact)
      .where(
        and(eq(contact.organizationId, testOrg.id), eq(contact.email, email))
      );

    expect(row.emailStatus).toBe("active");
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("leaves emailStatus and emailVerifiedAt null for a phone-only contact", async () => {
    const phone = "+15551239999";

    await importContacts(testOrg.id, {
      contacts: [{ phone }],
      duplicateStrategy: "skip",
    });

    const [row] = await db
      .select({
        emailStatus: contact.emailStatus,
        emailVerifiedAt: contact.emailVerifiedAt,
        smsStatus: contact.smsStatus,
      })
      .from(contact)
      .where(
        and(eq(contact.organizationId, testOrg.id), eq(contact.phone, phone))
      );

    expect(row.emailStatus).toBeNull();
    expect(row.emailVerifiedAt).toBeNull();
    expect(row.smsStatus).toBe("pending_consent");
  });
});

// ─── Duplicates within a single file (WEB-W) ───────────────────────────────
// The duplicate-handling block above only ever compares a row against a
// contact already in the database. A customer's first real import repeated a
// phone number inside one file: both rows reached the INSERT, tripped
// contact_unique_org_phone_idx, aborted the batch transaction and imported
// nothing behind a generic "Failed to import contacts".

describe("importContacts — duplicates within one file", () => {
  it("imports a file that lists the same phone number twice instead of failing the whole batch", async () => {
    const phone = "+15550000101";

    const result = await importContacts(testOrg.id, {
      contacts: [
        { phone, firstName: "First" },
        { phone, firstName: "Repeat" },
      ],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(0);
      // Named, not just counted — the operator has to find it in the file.
      expect(result.duplicates).toEqual([
        { row: 2, firstRow: 1, field: "phone", value: phone },
      ]);
    }

    const rows = await db
      .select({ firstName: contact.firstName })
      .from(contact)
      .where(
        and(eq(contact.organizationId, testOrg.id), eq(contact.phone, phone))
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe("First");
  });

  it("imports a file that lists the same email twice instead of failing the whole batch", async () => {
    const email = "in-file-dup-1@example.com";

    const result = await importContacts(testOrg.id, {
      contacts: [
        { email, firstName: "First" },
        { email, firstName: "Repeat" },
      ],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.duplicates).toEqual([
        { row: 2, firstRow: 1, field: "email", value: email },
      ]);
    }

    const rows = await db
      .select({ id: contact.id })
      .from(contact)
      .where(
        and(eq(contact.organizationId, testOrg.id), eq(contact.email, email))
      );

    expect(rows).toHaveLength(1);
  });

  it("still imports every unique row in a file that also repeats one", async () => {
    const repeated = "in-file-mixed-repeat@example.com";
    const uniqueA = "in-file-mixed-a@example.com";
    const uniqueB = "in-file-mixed-b@example.com";

    const result = await importContacts(testOrg.id, {
      contacts: [
        { email: uniqueA },
        { email: repeated },
        { email: repeated },
        { email: uniqueB },
      ],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(3);
      expect(result.skipped).toBe(1);
      // Row 3 repeats row 2, and the row numbers survive the rows around them.
      expect(result.duplicates).toEqual([
        { row: 3, firstRow: 2, field: "email", value: repeated },
      ]);
    }

    const rows = await db
      .select({ email: contact.email })
      .from(contact)
      .where(
        and(
          eq(contact.organizationId, testOrg.id),
          inArray(contact.email, [uniqueA, uniqueB, repeated])
        )
      );

    expect(rows).toHaveLength(3);
  });

  it("dedupes a repeat that straddles the 100-row batch boundary", async () => {
    // The batch loop commits every 100 rows, so a repeat inside one batch and
    // a repeat spanning two take different paths to the same INSERT.
    const straddler = "in-file-straddle@example.com";
    const contacts = [
      { email: straddler },
      ...Array.from({ length: 120 }, (_, i) => ({
        email: `in-file-filler-${i}@example.com`,
      })),
      { email: straddler },
    ];

    const result = await importContacts(testOrg.id, {
      contacts,
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(121);
      expect(result.skipped).toBe(1);
    }
  });
});

describe("importContacts — reporting repeated rows", () => {
  it("reports nothing as a duplicate when every row is distinct", async () => {
    const result = await importContacts(testOrg.id, {
      contacts: [
        { email: "no-dup-a@example.com" },
        { email: "no-dup-b@example.com" },
      ],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.duplicates).toEqual([]);
      expect(result.skipped).toBe(0);
    }
  });

  it("does not report a duplicate of an existing contact as a repeated row", async () => {
    // A row matching a contact already in the account is the duplicate
    // strategy doing its job — there is nothing to fix in the file.
    const email = "existing-not-repeat@example.com";
    await importContacts(testOrg.id, {
      contacts: [{ email }],
      duplicateStrategy: "skip",
    });

    const second = await importContacts(testOrg.id, {
      contacts: [{ email }],
      duplicateStrategy: "skip",
    });

    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.skipped).toBe(1);
      expect(second.duplicates).toEqual([]);
    }
  });

  it("points a row at the row it repeats, not at the row before it", async () => {
    const repeated = "points-at-first@example.com";

    const result = await importContacts(testOrg.id, {
      contacts: [
        { email: repeated },
        { email: "points-filler-1@example.com" },
        { email: "points-filler-2@example.com" },
        { email: repeated },
      ],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.duplicates).toEqual([
        { row: 4, firstRow: 1, field: "email", value: repeated },
      ]);
    }
  });

  it("reports every repeat of a row that appears three times", async () => {
    const repeated = "thrice@example.com";

    const result = await importContacts(testOrg.id, {
      contacts: [{ email: repeated }, { email: repeated }, { email: repeated }],
      duplicateStrategy: "skip",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(2);
      expect(result.duplicates?.map((d) => d.row)).toEqual([2, 3]);
      // Both point at the original, not at each other.
      expect(result.duplicates?.map((d) => d.firstRow)).toEqual([1, 1]);
    }
  });
});
