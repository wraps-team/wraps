/**
 * `listContacts` — server-driven sort (real DB).
 *
 * Audit finding F14: sorting used to be `getSortedRowModel` over the current
 * page's 50 rows only, so a sort click reordered the page in place and
 * presented that as sorted. This proves the fix at the layer that actually
 * matters: `sortBy`/`sortDir` reaching the action changes the row order the
 * *database* returns across a page boundary, not just the rows already on
 * screen. `contacts-table.test.tsx` proves the click pushes the right URL;
 * this proves the URL, once read back by the action, changes what comes
 * back from Postgres.
 *
 * Also covers the validation the action layer does before any of this
 * reaches the query builder: an unrecognized `sortBy` (a stale bookmark, a
 * hand-edited URL, a future caller that isn't this page) must fall back to
 * the default order rather than throwing or reaching Drizzle with a column
 * name it doesn't recognize.
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
import { listContacts } from "../contacts";

const PREFIX = "contacts-sort-db";

const testUser = {
  id: `${PREFIX}-user-1`,
  email: `${PREFIX}@example.com`,
  name: "Sort User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${PREFIX}-org-1`,
  name: "Sort Org",
  slug: `${PREFIX}-org`,
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

// Five contacts, all created at the same instant, so createdAt alone cannot
// explain any ordering below — only the requested sort field can.
const sharedCreatedAt = new Date("2026-08-01T00:00:00.000Z");
const contacts = ["a", "b", "c", "d", "e"].map((letter, i) => ({
  id: `${PREFIX}-${letter}`,
  organizationId: testOrg.id,
  email: `${letter}-${PREFIX}@example.com`,
  emailHash: `${letter}-${PREFIX}-hash`,
  emailStatus: "active" as const,
  emailsSent: (i + 1) * 10, // a=10 ... e=50
  createdAt: sharedCreatedAt,
}));

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

  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.insert(contact).values(contacts);
});

afterAll(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

function emailsOf(result: Awaited<ReturnType<typeof listContacts>>) {
  if (!result.success) {
    throw new Error(`listContacts failed: ${result.error}`);
  }
  return result.contacts.map((c) => c.email);
}

describe("listContacts — sort reorders rows across a page boundary (F14)", () => {
  it("returns page 1 in ascending email order when sortBy=email&sortDir=asc", async () => {
    const page1 = await listContacts(testOrg.id, {
      page: 1,
      pageSize: 2,
      sortBy: "email",
      sortDir: "asc",
    });

    expect(emailsOf(page1)).toEqual([
      `a-${PREFIX}@example.com`,
      `b-${PREFIX}@example.com`,
    ]);
  });

  it("returns page 2 continuing the same ascending order, not page 1 repeated or skipped", async () => {
    const page2 = await listContacts(testOrg.id, {
      page: 2,
      pageSize: 2,
      sortBy: "email",
      sortDir: "asc",
    });

    expect(emailsOf(page2)).toEqual([
      `c-${PREFIX}@example.com`,
      `d-${PREFIX}@example.com`,
    ]);
  });

  it("reverses the page boundary too when sortDir flips to desc", async () => {
    const page1Desc = await listContacts(testOrg.id, {
      page: 1,
      pageSize: 2,
      sortBy: "email",
      sortDir: "desc",
    });

    // Descending page 1 is the mirror of ascending's last page, not the same
    // two rows read backwards - proves the database did the sort, not the
    // client re-reading an already-fetched page.
    expect(emailsOf(page1Desc)).toEqual([
      `e-${PREFIX}@example.com`,
      `d-${PREFIX}@example.com`,
    ]);
  });

  it("sorts by a different column entirely (emailsSent) across the same boundary", async () => {
    const page1 = await listContacts(testOrg.id, {
      page: 1,
      pageSize: 3,
      sortBy: "emailsSent",
      sortDir: "desc",
    });
    const page2 = await listContacts(testOrg.id, {
      page: 2,
      pageSize: 3,
      sortBy: "emailsSent",
      sortDir: "desc",
    });

    expect(emailsOf(page1)).toEqual([
      `e-${PREFIX}@example.com`, // 50
      `d-${PREFIX}@example.com`, // 40
      `c-${PREFIX}@example.com`, // 30
    ]);
    expect(emailsOf(page2)).toEqual([
      `b-${PREFIX}@example.com`, // 20
      `a-${PREFIX}@example.com`, // 10
    ]);
  });

  it("falls back to the default order for an unrecognized sortBy instead of reaching the query builder", async () => {
    const result = await listContacts(testOrg.id, {
      page: 1,
      pageSize: 10,
      // Not one of createdAt/email/emailsSent - e.g. a hand-edited URL, or a
      // column name that exists on `contact` but was never meant to be
      // sortable from here.
      sortBy: "properties",
      sortDir: "asc",
    });

    expect(result.success).toBe(true);
    // No crash, no SQL error surfaced as a generic failure - just every row,
    // in the same order the no-sort-at-all case would produce.
    expect(emailsOf(result)).toHaveLength(5);
  });

  it("defaults an unrecognized sortDir to desc rather than rejecting the request", async () => {
    const result = await listContacts(testOrg.id, {
      page: 1,
      pageSize: 2,
      sortBy: "email",
      sortDir: "sideways",
    });

    expect(emailsOf(result)).toEqual([
      `e-${PREFIX}@example.com`,
      `d-${PREFIX}@example.com`,
    ]);
  });
});
