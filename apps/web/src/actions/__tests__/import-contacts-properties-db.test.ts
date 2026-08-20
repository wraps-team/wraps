/**
 * Import Contacts — custom properties merge (real DB)
 *
 * Audit finding F11. `importContacts` carried the comment "Merge properties
 * using SQL jsonb concat" above a plain assignment, so every `update`-strategy
 * import replaced the contact's whole `properties` object. Custom properties
 * that were not in the CSV — the ones segments are built on — were destroyed,
 * with no undo.
 *
 * These tests seed a contact with properties, re-import the same address with
 * a different property set, and assert the union survives.
 */

import {
  contact,
  db,
  member,
  organization,
  subscription,
  user,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { importContacts } from "../import-contacts";

const PREFIX = "import-props";

const testUser = {
  id: `${PREFIX}-user-1`,
  email: `${PREFIX}@example.com`,
  name: "Import Properties User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${PREFIX}-org-1`,
  name: "Import Properties Org",
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

async function readProperties(email: string) {
  const [row] = await db
    .select({ properties: contact.properties })
    .from(contact)
    .where(
      and(eq(contact.organizationId, testOrg.id), eq(contact.email, email))
    )
    .limit(1);
  return row?.properties;
}

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

beforeEach(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
});

afterAll(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("importContacts — properties merge on duplicate update", () => {
  it("keeps properties the re-import did not mention", async () => {
    const email = `${PREFIX}-merge@example.com`;

    const first = await importContacts(testOrg.id, {
      contacts: [{ email, properties: { plan: "pro", region: "us-east-1" } }],
      duplicateStrategy: "skip",
    });
    expect(first.success).toBe(true);

    const second = await importContacts(testOrg.id, {
      contacts: [{ email, properties: { seats: "12" } }],
      duplicateStrategy: "update",
    });
    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.updated).toBe(1);
    }

    expect(await readProperties(email)).toEqual({
      plan: "pro",
      region: "us-east-1",
      seats: "12",
    });
  });

  it("lets the incoming file overwrite a key it does supply", async () => {
    const email = `${PREFIX}-overwrite@example.com`;

    await importContacts(testOrg.id, {
      contacts: [{ email, properties: { plan: "free", tier: "1" } }],
      duplicateStrategy: "skip",
    });

    await importContacts(testOrg.id, {
      contacts: [{ email, properties: { plan: "enterprise" } }],
      duplicateStrategy: "update",
    });

    expect(await readProperties(email)).toEqual({
      plan: "enterprise",
      tier: "1",
    });
  });

  it("leaves existing properties alone when the file carries none", async () => {
    const email = `${PREFIX}-empty@example.com`;

    await importContacts(testOrg.id, {
      contacts: [{ email, properties: { plan: "pro" } }],
      duplicateStrategy: "skip",
    });

    await importContacts(testOrg.id, {
      contacts: [{ email, firstName: "Dana", properties: {} }],
      duplicateStrategy: "update",
    });

    expect(await readProperties(email)).toEqual({ plan: "pro" });
  });

  it("does not resurrect a suppressed contact's sendability on re-import", async () => {
    const email = `${PREFIX}-suppressed@example.com`;

    await importContacts(testOrg.id, {
      contacts: [{ email }],
      duplicateStrategy: "skip",
    });

    await db
      .update(contact)
      .set({
        emailStatus: "unsubscribed",
        emailUnsubscribedAt: new Date(),
      })
      .where(
        and(eq(contact.organizationId, testOrg.id), eq(contact.email, email))
      );

    await importContacts(testOrg.id, {
      contacts: [{ email, firstName: "Dana" }],
      duplicateStrategy: "update",
    });

    const [row] = await db
      .select({
        emailStatus: contact.emailStatus,
        firstName: contact.firstName,
      })
      .from(contact)
      .where(
        and(eq(contact.organizationId, testOrg.id), eq(contact.email, email))
      )
      .limit(1);

    expect(row.emailStatus).toBe("unsubscribed");
    expect(row.firstName).toBe("Dana");
  });
});

describe("importContacts — deprecated columns", () => {
  it("no longer writes the deprecated confirmedAt column on insert", async () => {
    const email = `${PREFIX}-deprecated@example.com`;

    await importContacts(testOrg.id, {
      contacts: [{ email }],
      duplicateStrategy: "skip",
    });

    const [row] = await db
      .select({
        status: contact.status,
        confirmedAt: contact.confirmedAt,
        emailStatus: contact.emailStatus,
      })
      .from(contact)
      .where(
        and(eq(contact.organizationId, testOrg.id), eq(contact.email, email))
      )
      .limit(1);

    expect(row.emailStatus).toBe("active");
    expect(row.confirmedAt).toBeNull();
    // The column keeps its schema default — the import no longer sets it.
    expect(row.status).toBe("active");
  });
});
