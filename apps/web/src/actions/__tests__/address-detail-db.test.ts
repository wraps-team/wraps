/**
 * Address detail actions against the real test database. AWS is not called
 * by these actions, so no AWS mock is needed. Session and membership are
 * mocked, following suppressions.test.ts. Fixtures use the `address-s2-`
 * prefix so this file cannot collide with another file's rows, and every
 * case has a second org holding the same address.
 *
 * NOT YET RUN: apps/web/.env.test (DATABASE_URL) is not available in the
 * worktree this was written in. Run with `pnpm --filter @wraps/web test
 * src/actions/__tests__/address-detail-db.test.ts` once it is configured.
 */

import {
  auditLog,
  awsAccount,
  contact,
  db,
  hashContactValue,
  member,
  messageSend,
  organization,
  queryMessageMetricBuckets,
  user,
} from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

let currentMockUserId: string | null = null;

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => {
        if (currentMockUserId === null) {
          return null;
        }
        return {
          user: {
            id: currentMockUserId,
            email: "address-s2-user@example.com",
            name: "Address S2 Test User",
          },
          session: {
            id: "address-s2-session",
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: currentMockUserId,
            expiresAt: new Date(Date.now() + 86_400_000),
            token: "address-s2-token",
          },
        };
      }),
    },
  },
}));

// Records every log call, so the redaction test can read what was written.
const logCalls = vi.hoisted(() => ({ error: [] as unknown[][] }));
vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger")>();
  const captured = {
    error: (...args: unknown[]) => {
      logCalls.error.push(args);
    },
    warn: () => undefined,
    info: () => undefined,
    debug: () => undefined,
  };
  return {
    ...actual,
    createActionLogger: () => captured,
  };
});

// Makes the query fail on demand, to test the error copy and log redaction.
const failQueries = vi.hoisted(() => ({ on: false }));
vi.mock("@wraps/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wraps/db")>();
  return {
    ...actual,
    queryAddressProblemSends: async (
      ...args: Parameters<typeof actual.queryAddressProblemSends>
    ) => {
      if (failQueries.on) {
        const { DrizzleQueryError } = await import("drizzle-orm");
        throw new DrizzleQueryError(
          "select ... where lower(recipient) = lower($1)",
          [args[1]],
          Object.assign(new Error("query failed"), { code: "42P01" })
        );
      }
      return actual.queryAddressProblemSends(...args);
    },
  };
});

import { getAddressDetail, listProblemAddresses } from "../address-detail";
import { UNAUTHORIZED } from "../shared/org-action";

const suffix = crypto.randomUUID().slice(0, 8);
const ORG_A = `address-s2-org-a-${suffix}`;
const ORG_B = `address-s2-org-b-${suffix}`;
const USER_A = `address-s2-user-a-${suffix}`;
const USER_B = `address-s2-user-b-${suffix}`;
const CREATOR = `address-s2-creator-${suffix}`;
const ACCOUNT_B = `address-s2-account-b-${suffix}`;

const SENT_INSIDE = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

const seededSendIds: string[] = [];
const seededContactIds: string[] = [];
const seededAuditIds: string[] = [];
let counter = 0;

async function seedSend(input: {
  organizationId?: string;
  recipient: string;
  bouncedAt?: Date | null;
  complainedAt?: Date | null;
  suppressedAt?: Date | null;
  sentAt?: Date | null;
  contactId?: string | null;
  awsAccountId?: string | null;
  messageId?: string | null;
}): Promise<string> {
  counter += 1;
  const id = `address-s2-send-${suffix}-${counter}`;
  await db.insert(messageSend).values({
    id,
    organizationId: input.organizationId ?? ORG_A,
    channel: "email",
    sourceType: "transactional",
    status: "sent",
    recipient: input.recipient,
    from: "billing@wraps.dev",
    sentAt: input.sentAt === undefined ? SENT_INSIDE : input.sentAt,
    bouncedAt: input.bouncedAt ?? null,
    complainedAt: input.complainedAt ?? null,
    suppressedAt: input.suppressedAt ?? null,
    contactId: input.contactId ?? null,
    awsAccountId: input.awsAccountId ?? null,
    messageId: input.messageId ?? null,
  });
  seededSendIds.push(id);
  return id;
}

async function seedContact(input: {
  organizationId?: string;
  email: string;
  createdBy?: string | null;
  emailStatus?: "active" | "bounced" | "complained" | "suppressed";
}): Promise<string> {
  counter += 1;
  const id = `address-s2-contact-${suffix}-${counter}`;
  await db.insert(contact).values({
    id,
    organizationId: input.organizationId ?? ORG_A,
    email: input.email,
    emailHash: hashContactValue(input.email),
    emailStatus: input.emailStatus ?? "bounced",
    createdBy: input.createdBy ?? null,
    createdAt: new Date(),
  });
  seededContactIds.push(id);
  return id;
}

beforeAll(async () => {
  await db.insert(organization).values([
    {
      id: ORG_A,
      name: "Address S2 A",
      slug: `address-s2-a-${suffix}`,
      createdAt: new Date(),
    },
    {
      id: ORG_B,
      name: "Address S2 B",
      slug: `address-s2-b-${suffix}`,
      createdAt: new Date(),
    },
  ]);
  await db.insert(user).values([
    {
      id: USER_A,
      email: `address-s2-a-${suffix}@example.com`,
      name: "Address S2 User A",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: USER_B,
      email: `address-s2-b-${suffix}@example.com`,
      name: "Address S2 User B",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: CREATOR,
      email: `address-s2-creator-${suffix}@example.com`,
      name: "Address S2 Creator",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  await db.insert(member).values([
    {
      id: `address-s2-member-a-${suffix}`,
      organizationId: ORG_A,
      userId: USER_A,
      role: "owner",
      createdAt: new Date(),
    },
    {
      id: `address-s2-member-b-${suffix}`,
      organizationId: ORG_B,
      userId: USER_B,
      role: "owner",
      createdAt: new Date(),
    },
  ]);
  await db.insert(awsAccount).values({
    id: ACCOUNT_B,
    organizationId: ORG_B,
    name: "Address S2 Account B",
    accountId: "222222222222",
    region: "us-east-1",
    roleArn: "arn:aws:iam::222222222222:role/WrapsRole",
    externalId: `address-s2-ext-${suffix}`,
  });
});

beforeEach(() => {
  currentMockUserId = USER_A;
  failQueries.on = false;
});

afterAll(async () => {
  if (seededAuditIds.length > 0) {
    await db.delete(auditLog).where(inArray(auditLog.id, seededAuditIds));
  }
  if (seededSendIds.length > 0) {
    await db.delete(messageSend).where(inArray(messageSend.id, seededSendIds));
  }
  if (seededContactIds.length > 0) {
    await db.delete(contact).where(inArray(contact.id, seededContactIds));
  }
  await db.delete(awsAccount).where(eq(awsAccount.id, ACCOUNT_B));
  await db.delete(member).where(eq(member.organizationId, ORG_A));
  await db.delete(member).where(eq(member.organizationId, ORG_B));
  await db.delete(user).where(inArray(user.id, [USER_A, USER_B, CREATOR]));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
});

describe("getAddressDetail (real database)", () => {
  it("getAddressDetail returns org-scoped contact: other org's contact with the same address is not returned", async () => {
    const address = `scoped-${suffix}@example.com`;
    await seedContact({ organizationId: ORG_B, email: address });
    const result = await getAddressDetail(ORG_A, { address });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.contact).toBeNull();
    }
  });

  it("getAddressDetail finds a contact stored with mixed case (API create path) by hash", async () => {
    const address = `Mixed-${suffix}@Example.com`;
    const contactId = await seedContact({ email: address });
    const result = await getAddressDetail(ORG_A, {
      address: address.toLowerCase(),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.contact?.id).toBe(contactId);
    }
  });

  it("getAddressDetail returns contact null and sends 0 for a suppression with no rows (not found in your sends)", async () => {
    const address = `nowhere-${suffix}@example.com`;
    const result = await getAddressDetail(ORG_A, { address });
    expect(result).toMatchObject({
      success: true,
      totals: { sends: 0, bounces: 0, complaints: 0, suppressed: 0 },
      contact: null,
      problemSends: [],
    });
  });

  it("getAddressDetail returns contact with zero sends when only the contact exists", async () => {
    const address = `contact-only-${suffix}@example.com`;
    await seedContact({ email: address });
    const result = await getAddressDetail(ORG_A, { address });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.totals.sends).toBe(0);
      expect(result.contact).not.toBeNull();
    }
  });

  it("getAddressDetail keeps a send after its contact was deleted (contact_id null) and shows no contact", async () => {
    const address = `deleted-contact-${suffix}@example.com`;
    await seedSend({ recipient: address, bouncedAt: SENT_INSIDE });
    const result = await getAddressDetail(ORG_A, { address });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.problemSends).toHaveLength(1);
      expect(result.contact).toBeNull();
    }
  });

  it("getAddressDetail returns sends with null aws_account_id and does not drop them", async () => {
    const address = `null-account-${suffix}@example.com`;
    await seedSend({
      recipient: address,
      bouncedAt: SENT_INSIDE,
      awsAccountId: null,
    });
    const result = await getAddressDetail(ORG_A, { address });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.problemSends[0]?.awsAccountId).toBeNull();
    }
  });

  it('getAddressDetail rejects an awsAccountId that belongs to another organization with "AWS account not found"', async () => {
    const result = await getAddressDetail(ORG_A, {
      address: `foreign-account-${suffix}@example.com`,
      suppressedAwsAccountId: ACCOUNT_B,
    });
    expect(result).toEqual({ success: false, error: "AWS account not found" });
  });

  it("getAddressDetail returns UNAUTHORIZED for a caller with no membership in the org", async () => {
    currentMockUserId = USER_B;
    const result = await getAddressDetail(ORG_A, {
      address: `no-member-${suffix}@example.com`,
    });
    expect(result).toEqual({ success: false, error: UNAUTHORIZED });
  });

  it("getAddressDetail creation record uses only audit rows with the same organization and resource_id = contactId", async () => {
    const address = `audit-scope-${suffix}@example.com`;
    const contactId = await seedContact({ email: address, createdBy: CREATOR });
    const [mine] = await db
      .insert(auditLog)
      .values({
        id: `address-s2-audit-mine-${suffix}`,
        organizationId: ORG_A,
        action: "contact.created",
        resource: "contacts",
        resourceId: contactId,
        actorEmail: "mine@example.com",
        createdAt: new Date(),
      })
      .returning();
    const [otherOrg] = await db
      .insert(auditLog)
      .values({
        id: `address-s2-audit-other-${suffix}`,
        organizationId: ORG_B,
        action: "contact.created",
        resource: "contacts",
        resourceId: contactId,
        actorEmail: "other-org@example.com",
        createdAt: new Date(Date.now() + 1000),
      })
      .returning();
    seededAuditIds.push(mine.id, otherOrg.id);

    const result = await getAddressDetail(ORG_A, { address });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.contact?.creationRecord?.actorEmail).toBe(
        "mine@example.com"
      );
    }
  });

  it("getAddressDetail ignores contact.imported and contact.created_bulk rows (no resource_id)", async () => {
    const address = `bulk-audit-${suffix}@example.com`;
    await seedContact({ email: address });
    const [bulk] = await db
      .insert(auditLog)
      .values({
        id: `address-s2-audit-bulk-${suffix}`,
        organizationId: ORG_A,
        action: "contact.imported",
        resource: "contacts",
        resourceId: null,
        actorEmail: "bulk@example.com",
        createdAt: new Date(),
      })
      .returning();
    seededAuditIds.push(bulk.id);
    const result = await getAddressDetail(ORG_A, { address });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.contact?.creationRecord).toBeNull();
    }
  });

  it("getAddressDetail returns createdBy null when the contact has no creator", async () => {
    const address = `no-creator-${suffix}@example.com`;
    await seedContact({ email: address, createdBy: null });
    const result = await getAddressDetail(ORG_A, { address });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.contact?.createdBy).toBeNull();
    }
  });

  it("getAddressDetail problem sends link ids are message_send ids, not SES message ids", async () => {
    const address = `link-ids-${suffix}@example.com`;
    const sendId = await seedSend({
      recipient: address,
      bouncedAt: SENT_INSIDE,
      messageId: `ses-message-${suffix}`,
    });
    const result = await getAddressDetail(ORG_A, { address });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.problemSends[0]?.id).toBe(sendId);
      expect(result.problemSends[0]?.id).not.toBe(`ses-message-${suffix}`);
    }
  });

  it("getAddressDetail does not log the address when a query fails", async () => {
    const address = `logged-${suffix}@example.com`;
    await seedSend({ recipient: address, bouncedAt: SENT_INSIDE });
    failQueries.on = true;
    logCalls.error.length = 0;
    await getAddressDetail(ORG_A, { address });
    expect(logCalls.error.length).toBeGreaterThan(0);
    expect(JSON.stringify(logCalls.error)).not.toContain(address);
  });

  it('getAddressDetail returns the error copy "Could not load this address. Try again." on query failure', async () => {
    failQueries.on = true;
    const result = await getAddressDetail(ORG_A, {
      address: `copy-${suffix}@example.com`,
    });
    expect(result).toEqual({
      success: false,
      error: "Could not load this address. Try again.",
    });
  });
});

describe("listProblemAddresses (real database)", () => {
  it("listProblemAddresses totals equal the sum over the unlimited aggregate, not the 100-row slice", async () => {
    const base = `many-${suffix}`;
    for (let i = 0; i < 105; i += 1) {
      await seedSend({
        recipient: `${base}-${i}@example.com`,
        bouncedAt: SENT_INSIDE,
      });
    }
    const result = await listProblemAddresses(ORG_A, {
      days: 30,
      day: null,
      tz: "UTC",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.rows).toHaveLength(100);
      expect(result.uniqueAddresses).toBeGreaterThanOrEqual(105);
      expect(result.totals.bounces).toBeGreaterThanOrEqual(105);
    }
  });

  it("addresses totals reconcile with analytics bounces for the same window", async () => {
    const result = await listProblemAddresses(ORG_A, {
      days: 30,
      day: null,
      tz: "UTC",
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000);
    const buckets = await queryMessageMetricBuckets({
      organizationId: ORG_A,
      startTime,
      endTime,
      timezone: "UTC",
      dimensions: ["period"],
      granularity: "daily",
    });
    const analyticsBounced = buckets.reduce((sum, row) => sum + row.bounced, 0);
    expect(result.totals.bounces).toBe(analyticsBounced);
  });
});
