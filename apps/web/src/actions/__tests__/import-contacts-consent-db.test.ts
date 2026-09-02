/**
 * Import Contacts — prior SMS consent carried through the CSV importer
 * (real DB)
 *
 * Plan 229. The importer used to hardcode `smsStatus: "pending_consent"`
 * for every row with a phone number, discarding SMS consent an organisation
 * had already collected before migrating to Wraps. These tests assert the
 * CSV's `smsStatus` / `smsConsentedAt` columns are validated and carried
 * onto the contact, and — the compliance-critical half — that re-importing
 * a list only ever *fills in* an undecided contact's consent, never
 * overrides an existing decision (opt-out or an established opt-in date).
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

const PREFIX = "import-consent";

const testUser = {
  id: `${PREFIX}-user-1`,
  email: `${PREFIX}@example.com`,
  name: "Import Consent User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${PREFIX}-org-1`,
  name: "Import Consent Org",
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

async function readSms(email: string) {
  const [row] = await db
    .select({
      smsStatus: contact.smsStatus,
      smsConsentedAt: contact.smsConsentedAt,
      smsOptedOutAt: contact.smsOptedOutAt,
    })
    .from(contact)
    .where(
      and(eq(contact.organizationId, testOrg.id), eq(contact.email, email))
    )
    .limit(1);
  return row;
}

let phoneCounter = 0;
function nextPhone() {
  phoneCounter++;
  return `+1555${String(phoneCounter).padStart(7, "0")}`;
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

describe("importContacts — SMS consent on insert", () => {
  it("defaults to pending_consent when no SMS columns are present", async () => {
    const email = `${PREFIX}-default@example.com`;

    const result = await importContacts(testOrg.id, {
      contacts: [{ email, phone: nextPhone() }],
      duplicateStrategy: "skip",
    });
    expect(result.success).toBe(true);

    const row = await readSms(email);
    expect(row?.smsStatus).toBe("pending_consent");
    expect(row?.smsConsentedAt).toBeNull();
  });

  it("carries an explicit opted_in status and consent date", async () => {
    const email = `${PREFIX}-explicit@example.com`;

    const result = await importContacts(testOrg.id, {
      contacts: [
        {
          email,
          phone: nextPhone(),
          smsStatus: "opted_in",
          smsConsentedAt: "2024-03-05T10:00:00.000Z",
        },
      ],
      duplicateStrategy: "skip",
    });
    expect(result.success).toBe(true);

    const row = await readSms(email);
    expect(row?.smsStatus).toBe("opted_in");
    expect(row?.smsConsentedAt?.toISOString()).toBe("2024-03-05T10:00:00.000Z");
  });

  it("falls back to import time when opted_in has no consent date", async () => {
    const email = `${PREFIX}-fallback@example.com`;
    const startedAt = new Date();

    const result = await importContacts(testOrg.id, {
      contacts: [{ email, phone: nextPhone(), smsStatus: "opted_in" }],
      duplicateStrategy: "skip",
    });
    expect(result.success).toBe(true);

    const row = await readSms(email);
    expect(row?.smsStatus).toBe("opted_in");
    expect(row?.smsConsentedAt).not.toBeNull();
    expect(row?.smsConsentedAt?.getTime()).toBeGreaterThanOrEqual(
      startedAt.getTime()
    );
  });

  it("tolerates case and surrounding whitespace in the status column", async () => {
    const email = `${PREFIX}-casing@example.com`;

    const result = await importContacts(testOrg.id, {
      contacts: [{ email, phone: nextPhone(), smsStatus: " Opted_In " }],
      duplicateStrategy: "skip",
    });
    expect(result.success).toBe(true);

    const row = await readSms(email);
    expect(row?.smsStatus).toBe("opted_in");
  });

  it("reports an invalid status as a row error and does not create the contact", async () => {
    const email = `${PREFIX}-badstatus@example.com`;

    const result = await importContacts(testOrg.id, {
      contacts: [{ email, phone: nextPhone(), smsStatus: "yes" }],
      duplicateStrategy: "skip",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(0);
      expect(
        result.errors.some((e) => /Invalid SMS status/.test(e.error))
      ).toBe(true);
    }

    expect(await readSms(email)).toBeUndefined();
  });

  it("reports an invalid consent date as a row error and does not create the contact", async () => {
    const email = `${PREFIX}-baddate@example.com`;

    const result = await importContacts(testOrg.id, {
      contacts: [
        {
          email,
          phone: nextPhone(),
          smsStatus: "opted_in",
          smsConsentedAt: "not-a-date",
        },
      ],
      duplicateStrategy: "skip",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        result.errors.some((e) => /Invalid SMS consent date/.test(e.error))
      ).toBe(true);
    }

    expect(await readSms(email)).toBeUndefined();
  });

  it("ignores a status column when there is no phone number", async () => {
    const email = `${PREFIX}-nophone@example.com`;

    const result = await importContacts(testOrg.id, {
      contacts: [{ email, smsStatus: "opted_in" }],
      duplicateStrategy: "skip",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.created).toBe(1);
    }

    const row = await readSms(email);
    expect(row?.smsStatus).toBeNull();
  });

  it("stamps its own timestamp for an opt-out row", async () => {
    const email = `${PREFIX}-optout@example.com`;

    const result = await importContacts(testOrg.id, {
      contacts: [{ email, phone: nextPhone(), smsStatus: "opted_out" }],
      duplicateStrategy: "skip",
    });
    expect(result.success).toBe(true);

    const row = await readSms(email);
    expect(row?.smsStatus).toBe("opted_out");
    expect(row?.smsOptedOutAt).not.toBeNull();
    expect(row?.smsConsentedAt).toBeNull();
  });
});

describe("importContacts — SMS consent on update", () => {
  it("fills in an undecided contact's consent on re-import", async () => {
    const email = `${PREFIX}-fillin@example.com`;
    const phone = nextPhone();

    await importContacts(testOrg.id, {
      contacts: [{ email, phone }],
      duplicateStrategy: "skip",
    });
    expect((await readSms(email))?.smsStatus).toBe("pending_consent");

    const result = await importContacts(testOrg.id, {
      contacts: [
        {
          email,
          phone,
          smsStatus: "opted_in",
          smsConsentedAt: "2023-01-02T00:00:00.000Z",
        },
      ],
      duplicateStrategy: "update",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.updated).toBe(1);
    }

    const row = await readSms(email);
    expect(row?.smsStatus).toBe("opted_in");
    expect(row?.smsConsentedAt?.toISOString()).toBe("2023-01-02T00:00:00.000Z");
  });

  it("never overrides an existing opt-out — the compliance guard", async () => {
    const email = `${PREFIX}-preserve-optout@example.com`;
    const phone = nextPhone();

    await importContacts(testOrg.id, {
      contacts: [{ email, phone }],
      duplicateStrategy: "skip",
    });

    await db
      .update(contact)
      .set({ smsStatus: "opted_out", smsOptedOutAt: new Date() })
      .where(
        and(eq(contact.organizationId, testOrg.id), eq(contact.email, email))
      );

    const result = await importContacts(testOrg.id, {
      contacts: [{ email, phone, smsStatus: "opted_in" }],
      duplicateStrategy: "update",
    });
    expect(result.success).toBe(true);

    const row = await readSms(email);
    expect(row?.smsStatus).toBe("opted_out");
    expect(row?.smsConsentedAt).toBeNull();
  });

  it("never restarts an existing consent clock", async () => {
    const email = `${PREFIX}-preserve-clock@example.com`;
    const phone = nextPhone();

    await importContacts(testOrg.id, {
      contacts: [{ email, phone }],
      duplicateStrategy: "skip",
    });

    const originalConsent = new Date("2020-06-01T00:00:00.000Z");
    await db
      .update(contact)
      .set({ smsStatus: "opted_in", smsConsentedAt: originalConsent })
      .where(
        and(eq(contact.organizationId, testOrg.id), eq(contact.email, email))
      );

    const result = await importContacts(testOrg.id, {
      contacts: [
        {
          email,
          phone,
          smsStatus: "opted_in",
          smsConsentedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      duplicateStrategy: "update",
    });
    expect(result.success).toBe(true);

    const row = await readSms(email);
    expect(row?.smsStatus).toBe("opted_in");
    expect(row?.smsConsentedAt?.toISOString()).toBe(
      originalConsent.toISOString()
    );
  });
});
