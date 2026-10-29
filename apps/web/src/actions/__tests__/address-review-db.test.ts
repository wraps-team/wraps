/**
 * listAddressesToReview against the real test database, with AWS mocked.
 * Session and membership are mocked, following address-detail-db.test.ts.
 * SES is mocked at the client, so the real checkSuppressedAddresses runs.
 * Fixtures use the `address-review-` prefix. ORG_C holds bulk fixtures (more
 * than 25 and more than 100 candidates), so they cannot shift the assertions
 * made against ORG_A.
 */

import {
  awsAccount,
  db,
  member,
  messageSend,
  organization,
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
            email: "address-review-user@example.com",
            name: "Address Review Test User",
          },
          session: {
            id: "address-review-session",
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: currentMockUserId,
            expiresAt: new Date(Date.now() + 86_400_000),
            token: "address-review-token",
          },
        };
      }),
    },
  },
}));

vi.mock("@/lib/aws/credential-cache", () => ({
  getOrAssumeRole: vi.fn(async () => ({
    accessKeyId: "AKIA_TEST",
    secretAccessKey: "secret-test",
    sessionToken: "session-test",
  })),
}));

// SES state, reset before each test. `listed` holds the addresses SES
// reports as suppressed; `denyRegions` makes every call in those regions
// fail with AccessDenied; `calls` records every GetSuppressedDestination.
const sesState = vi.hoisted(() => ({
  listed: new Set<string>(),
  listAll: false,
  denyRegions: new Set<string>(),
  calls: [] as { region: string; email: string }[],
}));

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    region: string;
    constructor(config: { region: string }) {
      this.region = config.region;
    }
    async send(command: { input: { EmailAddress: string } }) {
      const email = command.input.EmailAddress;
      sesState.calls.push({ region: this.region, email });
      if (sesState.denyRegions.has(this.region)) {
        throw Object.assign(new Error("AccessDeniedException"), {
          name: "AccessDeniedException",
        });
      }
      if (sesState.listAll || sesState.listed.has(email)) {
        return {
          SuppressedDestination: {
            EmailAddress: email,
            Reason: "BOUNCE",
            LastUpdateTime: new Date("2026-01-01T00:00:00Z"),
          },
        };
      }
      throw Object.assign(new Error("NotFoundException"), {
        name: "NotFoundException",
      });
    }
  },
  GetSuppressedDestinationCommand: class {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

import { listAddressesToReview } from "../address-review";

const suffix = crypto.randomUUID().slice(0, 8);
const ORG_A = `address-review-org-a-${suffix}`;
const ORG_B = `address-review-org-b-${suffix}`;
const ORG_C = `address-review-org-c-${suffix}`;
const USER_A = `address-review-user-a-${suffix}`;
const USER_B = `address-review-user-b-${suffix}`;
const ACCOUNT_A1 = `address-review-acct-a1-${suffix}`; // us-east-1
const ACCOUNT_A2 = `address-review-acct-a2-${suffix}`; // eu-west-1
const ACCOUNT_B = `address-review-acct-b-${suffix}`; // ap-southeast-2, foreign to ORG_A
const ACCOUNT_C = `address-review-acct-c-${suffix}`; // us-west-2
const REGION_A1 = "us-east-1";
const REGION_A2 = "eu-west-1";
const REGION_B = "ap-southeast-2";
const ALL_ORG_A_REGIONS = [REGION_A1, REGION_A2];

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const SENT = new Date(NOW - 5 * DAY); // inside a 30-day window
const ago = (days: number) => new Date(NOW - days * DAY);

type SendSeed = {
  organizationId: string;
  recipient: string;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  bouncedAt?: Date | null;
  complainedAt?: Date | null;
  bounceType?: string | null;
  bounceSubType?: string | null;
  awsAccountId?: string | null;
};

const seededSendIds: string[] = [];

async function seedSends(rows: SendSeed[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const values: (typeof messageSend.$inferInsert)[] = rows.map((row) => {
    const id = crypto.randomUUID();
    seededSendIds.push(id);
    return {
      id,
      organizationId: row.organizationId,
      channel: "email",
      sourceType: "transactional",
      status: "sent",
      recipient: row.recipient,
      from: "billing@wraps.dev",
      sentAt: row.sentAt === undefined ? SENT : row.sentAt,
      deliveredAt: row.deliveredAt ?? null,
      bouncedAt: row.bouncedAt ?? null,
      complainedAt: row.complainedAt ?? null,
      bounceType: row.bounceType ?? null,
      bounceSubType: row.bounceSubType ?? null,
      awsAccountId: row.awsAccountId ?? null,
    };
  });
  await db.insert(messageSend).values(values);
}

/** Three soft bounces on three different UTC days, none delivered after. */
function threeSoftDays(organizationId: string, recipient: string): SendSeed[] {
  return [2, 3, 4].map((days) => ({
    organizationId,
    recipient,
    bouncedAt: ago(days),
    bounceType: "Transient",
    bounceSubType: "General",
  }));
}

beforeAll(async () => {
  await db.insert(organization).values([
    {
      id: ORG_A,
      name: "Address Review A",
      slug: `address-review-a-${suffix}`,
      createdAt: new Date(),
    },
    {
      id: ORG_B,
      name: "Address Review B",
      slug: `address-review-b-${suffix}`,
      createdAt: new Date(),
    },
    {
      id: ORG_C,
      name: "Address Review C",
      slug: `address-review-c-${suffix}`,
      createdAt: new Date(),
    },
  ]);
  await db.insert(user).values([
    {
      id: USER_A,
      email: `address-review-a-${suffix}@example.com`,
      name: "Address Review User A",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: USER_B,
      email: `address-review-b-${suffix}@example.com`,
      name: "Address Review User B",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  await db.insert(member).values([
    {
      id: `address-review-member-a-${suffix}`,
      organizationId: ORG_A,
      userId: USER_A,
      role: "owner",
      createdAt: new Date(),
    },
    {
      id: `address-review-member-c-${suffix}`,
      organizationId: ORG_C,
      userId: USER_A,
      role: "owner",
      createdAt: new Date(),
    },
    {
      id: `address-review-member-b-${suffix}`,
      organizationId: ORG_B,
      userId: USER_B,
      role: "owner",
      createdAt: new Date(),
    },
  ]);
  await db.insert(awsAccount).values([
    {
      id: ACCOUNT_A1,
      organizationId: ORG_A,
      name: "Address Review A1",
      accountId: "111111111111",
      region: REGION_A1,
      roleArn: "arn:aws:iam::111111111111:role/WrapsRole",
      externalId: `address-review-ext-a1-${suffix}`,
    },
    {
      id: ACCOUNT_A2,
      organizationId: ORG_A,
      name: "Address Review A2",
      accountId: "222222222222",
      region: REGION_A2,
      roleArn: "arn:aws:iam::222222222222:role/WrapsRole",
      externalId: `address-review-ext-a2-${suffix}`,
    },
    {
      id: ACCOUNT_B,
      organizationId: ORG_B,
      name: "Address Review B",
      accountId: "333333333333",
      region: REGION_B,
      roleArn: "arn:aws:iam::333333333333:role/WrapsRole",
      externalId: `address-review-ext-b-${suffix}`,
    },
    {
      id: ACCOUNT_C,
      organizationId: ORG_C,
      name: "Address Review C",
      accountId: "444444444444",
      region: "us-west-2",
      roleArn: "arn:aws:iam::444444444444:role/WrapsRole",
      externalId: `address-review-ext-c-${suffix}`,
    },
  ]);
});

beforeEach(() => {
  currentMockUserId = USER_A;
  sesState.listed = new Set();
  sesState.listAll = false;
  sesState.denyRegions = new Set();
  sesState.calls = [];
});

afterAll(async () => {
  if (seededSendIds.length > 0) {
    await db.delete(messageSend).where(inArray(messageSend.id, seededSendIds));
  }
  await db
    .delete(awsAccount)
    .where(
      inArray(awsAccount.id, [ACCOUNT_A1, ACCOUNT_A2, ACCOUNT_B, ACCOUNT_C])
    );
  await db
    .delete(member)
    .where(inArray(member.organizationId, [ORG_A, ORG_B, ORG_C]));
  await db.delete(user).where(inArray(user.id, [USER_A, USER_B]));
  await db
    .delete(organization)
    .where(inArray(organization.id, [ORG_A, ORG_B, ORG_C]));
});

const DAYS_30 = { days: 30, tz: "UTC" };

describe("recommended list", () => {
  it("omits an address SES reports as listed and keeps one it reports not found", async () => {
    const listed = "ses-listed-review@example.com";
    const free = "ses-free-review@example.com";
    await seedSends([
      ...threeSoftDays(ORG_A, listed),
      ...threeSoftDays(ORG_A, free),
    ]);
    sesState.listed.add(listed);

    const result = await listAddressesToReview(ORG_A, {
      list: "recommended",
      ...DAYS_30,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.rows.find((row) => row.address === listed)).toBeUndefined();
    const freeRow = result.rows.find((row) => row.address === free);
    expect(freeRow?.status).toBe("not_listed");
    expect(freeRow?.why).toBe("3 soft bounces on 3 days, not on the SES list");
    expect(freeRow?.recommended).toBe(true);
  });

  it("keeps rows as unknown when SES denies the check", async () => {
    const address = "ses-denied-review@example.com";
    await seedSends(threeSoftDays(ORG_A, address));
    sesState.denyRegions = new Set(ALL_ORG_A_REGIONS);

    const result = await listAddressesToReview(ORG_A, {
      list: "recommended",
      ...DAYS_30,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const row = result.rows.find((candidate) => candidate.address === address);
    expect(row?.status).toBe("unknown");
    expect(row?.why).toBe("Could not check the SES list");
  });

  it("never sends an address to an account outside the org", async () => {
    const address = "foreign-account-review@example.com";
    await seedSends([
      {
        organizationId: ORG_A,
        recipient: address,
        complainedAt: ago(2),
        awsAccountId: ACCOUNT_B,
      },
    ]);

    const result = await listAddressesToReview(ORG_A, {
      list: "recommended",
      ...DAYS_30,
    });

    expect(result.success).toBe(true);
    expect(sesState.calls.some((call) => call.email === address)).toBe(true);
    expect(sesState.calls.some((call) => call.region === REGION_B)).toBe(false);
  });

  it("stops at 25 unlisted rows and reports more", async () => {
    const complaints = Array.from({ length: 30 }, (_, i) => ({
      organizationId: ORG_C,
      recipient: `kept-${i}-review@example.com`,
      complainedAt: ago(2),
    }));
    await seedSends(complaints);

    const result = await listAddressesToReview(ORG_C, {
      list: "recommended",
      ...DAYS_30,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.rows).toHaveLength(25);
    expect(result.hasMore).toBe(true);
    expect(result.rows.every((row) => row.status === "not_listed")).toBe(true);
  });

  it("stops after 100 candidates checked and reports more", async () => {
    await seedSends(
      Array.from({ length: 101 }, (_, i) => ({
        organizationId: ORG_C,
        recipient: `candidate-cap-${i}-review@example.com`,
        complainedAt: ago(2),
      }))
    );
    sesState.listAll = true;

    const result = await listAddressesToReview(ORG_C, {
      list: "recommended",
      ...DAYS_30,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.rows).toHaveLength(0);
    expect(result.hasMore).toBe(true);
    const checkedAddresses = new Set(sesState.calls.map((call) => call.email));
    expect(checkedAddresses.size).toBe(100);
  });
});

describe("single-kind lists", () => {
  it("pages the soft list at 25 with offset and reports hasMore", async () => {
    const soft = Array.from({ length: 27 }, (_, i) => ({
      organizationId: ORG_C,
      recipient: `soft-page-${String(i).padStart(2, "0")}-review@example.com`,
      bouncedAt: ago(2),
      bounceType: "Transient",
      bounceSubType: "General",
    }));
    await seedSends(soft);

    const first = await listAddressesToReview(ORG_C, {
      list: "soft",
      ...DAYS_30,
      offset: 0,
    });
    const second = await listAddressesToReview(ORG_C, {
      list: "soft",
      ...DAYS_30,
      offset: 25,
    });
    if (!first.success || !second.success) {
      throw new Error("expected both pages to load");
    }

    expect(first.rows).toHaveLength(25);
    expect(first.hasMore).toBe(true);
    expect(second.rows).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    const paged = [...first.rows, ...second.rows].map((row) => row.address);
    expect(new Set(paged).size).toBe(27);
  });

  it("returns counts with every list", async () => {
    const result = await listAddressesToReview(ORG_A, {
      list: "complaint",
      ...DAYS_30,
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(typeof result.counts.soft).toBe("number");
    expect(typeof result.counts.hard).toBe("number");
    expect(typeof result.counts.complaint).toBe("number");
  });

  it("does not show an organization's rows to another organization", async () => {
    const address = "org-b-only-review@example.com";
    await seedSends([
      { organizationId: ORG_B, recipient: address, complainedAt: ago(2) },
    ]);

    const result = await listAddressesToReview(ORG_A, {
      list: "complaint",
      ...DAYS_30,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        result.rows.find((row) => row.address === address)
      ).toBeUndefined();
    }
  });
});

describe("window", () => {
  it("rejects a window wider than 90 days", async () => {
    const result = await listAddressesToReview(ORG_A, {
      list: "soft",
      days: 91,
      tz: "UTC",
    });
    expect(result).toEqual({
      success: false,
      error: "days must be between 1 and 90",
    });
  });
});
