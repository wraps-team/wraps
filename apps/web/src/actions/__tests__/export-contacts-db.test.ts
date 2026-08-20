/**
 * Contact export — honest totals (real DB).
 *
 * Audit finding F23: `exportAllContacts` capped its fetch at
 * `MAX_EXPORT_ROWS` and then reported `total: contacts.length` — the
 * truncated fetch's own length presented as if it were the whole match. The
 * fix computes a real `COUNT(*)` over the same filters the row fetch uses, so
 * `total` is the actual matching count and `truncated` says explicitly
 * whether the export left rows out. This is the same "count that lies" class
 * the broadcast wave removed downstream (`exportAllBroadcasts` already did
 * this correctly — `truncated: total > batches.length`).
 */

import {
  contact,
  db,
  member,
  organization,
  subscription,
  user,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { exportAllContacts } from "../export";

const PREFIX = "export-contacts-db";

const testUser = {
  id: `${PREFIX}-user-1`,
  email: `${PREFIX}@example.com`,
  name: "Export User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${PREFIX}-org-1`,
  name: "Export Org",
  slug: `${PREFIX}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const otherOrg = {
  id: `${PREFIX}-org-2`,
  name: "Other Export Org",
  slug: `${PREFIX}-org-2`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: `${PREFIX}-member-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testSubscription = {
  id: `${PREFIX}-sub-1`,
  plan: "scale",
  referenceId: testOrg.id,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const activeContacts = Array.from({ length: 5 }, (_, i) => ({
  id: `${PREFIX}-active-${i}`,
  organizationId: testOrg.id,
  email: `${PREFIX}-active-${i}@example.com`,
  emailHash: `${PREFIX}-active-hash-${i}`,
  emailStatus: "active" as const,
}));

const unsubscribedContacts = Array.from({ length: 3 }, (_, i) => ({
  id: `${PREFIX}-unsub-${i}`,
  organizationId: testOrg.id,
  email: `${PREFIX}-unsub-${i}@example.com`,
  emailHash: `${PREFIX}-unsub-hash-${i}`,
  emailStatus: "unsubscribed" as const,
}));

const foreignContact = {
  id: `${PREFIX}-foreign-1`,
  organizationId: otherOrg.id,
  email: `${PREFIX}-foreign-1@example.com`,
  emailHash: `${PREFIX}-foreign-hash-1`,
  emailStatus: "active" as const,
};

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

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(organization)
    .values([testOrg, otherOrg])
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

  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(contact).where(eq(contact.organizationId, otherOrg.id));

  await db
    .insert(contact)
    .values([...activeContacts, ...unsubscribedContacts, foreignContact]);
});

afterAll(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(contact).where(eq(contact.organizationId, otherOrg.id));
  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(organization).where(eq(organization.id, otherOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("exportAllContacts — honest totals (F23)", () => {
  it("reports the real matching count, not the fetched row count", async () => {
    const result = await exportAllContacts(testOrg.id);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.total).toBe(8); // 5 active + 3 unsubscribed
    expect(result.contacts).toHaveLength(8);
    expect(result.truncated).toBe(false);
  });

  it("scopes the count by organizationId, not just the row fetch", async () => {
    const result = await exportAllContacts(testOrg.id);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    // The foreign org's contact must not inflate either number.
    expect(result.total).toBe(8);
    expect(result.contacts.some((c) => c.id === foreignContact.id)).toBe(false);
  });

  it("scopes the count by the same filters the row fetch uses", async () => {
    const result = await exportAllContacts(testOrg.id, {
      emailStatus: "unsubscribed",
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.total).toBe(3);
    expect(result.contacts).toHaveLength(3);
    expect(result.truncated).toBe(false);
    for (const c of result.contacts) {
      expect(c.emailStatus).toBe("unsubscribed");
    }
  });

  it("scopes the count by search the same way the row fetch does", async () => {
    const result = await exportAllContacts(testOrg.id, {
      search: `${PREFIX}-active-0`,
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.total).toBe(1);
    expect(result.contacts).toHaveLength(1);
  });
});
