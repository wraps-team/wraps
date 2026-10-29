/**
 * Address review reads (queryReviewAddresses, queryReviewAddressCounts)
 * against the real test database. Fixtures use the `address-review-` prefix
 * so this file cannot collide with another file's rows. Two orgs, so every
 * isolation case has a foreign row to leak.
 */

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  isRecommended,
  queryReviewAddressCounts,
  queryReviewAddresses,
  type ReviewAddressRow,
  type ReviewClassification,
} from "../repositories/address-review";
import { awsAccount, messageSend, organization } from "../schema";

const suffix = crypto.randomUUID().slice(0, 8);
const ORG_A = `address-review-org-a-${suffix}`;
const ORG_B = `address-review-org-b-${suffix}`;
const ACCOUNT_A1 = `address-review-acct-a1-${suffix}`;
const ACCOUNT_A2 = `address-review-acct-a2-${suffix}`;

// Mirrors CONTENT_BOUNCE_SUBTYPES and SOFT_BOUNCE_ESCALATION_THRESHOLD from
// the core package. packages/db does not import it.
const CLASSIFICATION: ReviewClassification = {
  contentSubTypes: ["MessageTooLarge", "ContentRejected", "AttachmentRejected"],
  softThreshold: 3,
};

// The window: Oct 1 to Oct 10, end inclusive.
const START = new Date("2026-10-01T00:00:00.000Z");
const END = new Date("2026-10-10T00:00:00.000Z");
const INSIDE = new Date("2026-10-05T12:00:00.000Z");
const WINDOW = { startTime: START, endTime: END, timezone: "UTC" };

let counter = 0;
const seededSendIds: string[] = [];

type SeedInput = {
  organizationId?: string;
  recipient: string;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  bouncedAt?: Date | null;
  complainedAt?: Date | null;
  bounceType?: string | null;
  bounceSubType?: string | null;
  channel?: "email" | "sms";
  awsAccountId?: string | null;
};

async function seedSend(input: SeedInput): Promise<string> {
  counter += 1;
  const id = `address-review-send-${suffix}-${counter}`;
  await db.insert(messageSend).values({
    id,
    organizationId: input.organizationId ?? ORG_A,
    channel: input.channel ?? "email",
    sourceType: "transactional",
    status: "sent",
    recipient: input.recipient,
    from: "billing@wraps.dev",
    sentAt: input.sentAt === undefined ? INSIDE : input.sentAt,
    deliveredAt: input.deliveredAt ?? null,
    bouncedAt: input.bouncedAt ?? null,
    complainedAt: input.complainedAt ?? null,
    bounceType: input.bounceType ?? null,
    bounceSubType: input.bounceSubType ?? null,
    awsAccountId: input.awsAccountId ?? null,
  });
  seededSendIds.push(id);
  return id;
}

function queryA(
  overrides: Partial<Parameters<typeof queryReviewAddresses>[0]> = {}
) {
  return queryReviewAddresses({
    organizationId: ORG_A,
    ...WINDOW,
    classification: CLASSIFICATION,
    limit: 1000,
    offset: 0,
    ...overrides,
  });
}

async function rowFor(
  address: string,
  kind?: "soft" | "hard" | "complaint" | "recommended"
): Promise<ReviewAddressRow | undefined> {
  const { rows } = await queryA({ kind });
  return rows.find((row) => row.address === address);
}

beforeAll(async () => {
  await db.insert(organization).values([
    {
      id: ORG_A,
      name: "Address Review Org A",
      slug: `address-review-a-${suffix}`,
      createdAt: new Date(),
    },
    {
      id: ORG_B,
      name: "Address Review Org B",
      slug: `address-review-b-${suffix}`,
      createdAt: new Date(),
    },
  ]);
  await db.insert(awsAccount).values([
    {
      id: ACCOUNT_A1,
      organizationId: ORG_A,
      name: "Address Review Account A1",
      accountId: "111111111111",
      region: "us-east-1",
      roleArn: "arn:aws:iam::111111111111:role/WrapsRole",
      externalId: `address-review-ext-a1-${suffix}`,
    },
    {
      id: ACCOUNT_A2,
      organizationId: ORG_A,
      name: "Address Review Account A2",
      accountId: "333333333333",
      region: "us-east-1",
      roleArn: "arn:aws:iam::333333333333:role/WrapsRole",
      externalId: `address-review-ext-a2-${suffix}`,
    },
  ]);
});

afterAll(async () => {
  if (seededSendIds.length > 0) {
    await db.delete(messageSend).where(inArray(messageSend.id, seededSendIds));
  }
  await db
    .delete(awsAccount)
    .where(inArray(awsAccount.id, [ACCOUNT_A1, ACCOUNT_A2]));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
});

describe("classification", () => {
  it("a hard-only address is in hard and not in soft", async () => {
    const address = "hard-only-review@example.com";
    await seedSend({
      recipient: address,
      bouncedAt: INSIDE,
      bounceType: "Permanent",
      bounceSubType: "General",
    });
    const row = await rowFor(address);
    expect(row?.hard).toBe(1);
    expect(row?.soft).toBe(0);
    expect(await rowFor(address, "soft")).toBeUndefined();
    expect((await rowFor(address, "hard"))?.hard).toBe(1);
  });

  it("an Undetermined bounce counts as soft", async () => {
    const address = "undetermined-review@example.com";
    await seedSend({
      recipient: address,
      bouncedAt: INSIDE,
      bounceType: "Undetermined",
      bounceSubType: "Undetermined",
    });
    expect((await rowFor(address))?.soft).toBe(1);
  });

  it("a Transient bounce with a non-content sub-type counts as soft", async () => {
    const address = "mailbox-full-review@example.com";
    await seedSend({
      recipient: address,
      bouncedAt: INSIDE,
      bounceType: "Transient",
      bounceSubType: "MailboxFull",
    });
    expect((await rowFor(address))?.soft).toBe(1);
  });

  it.each(["MessageTooLarge", "ContentRejected", "AttachmentRejected"])(
    "a Transient %s bounce is excluded from every list",
    async (subType) => {
      const address = `content-${subType.toLowerCase()}-review@example.com`;
      await seedSend({
        recipient: address,
        bouncedAt: INSIDE,
        bounceType: "Transient",
        bounceSubType: subType,
      });
      expect(await rowFor(address)).toBeUndefined();
      expect(await rowFor(address, "soft")).toBeUndefined();
      expect(await rowFor(address, "recommended")).toBeUndefined();
    }
  );

  it("a bounce with a null bounce_type is not an address problem", async () => {
    const address = "null-type-review@example.com";
    await seedSend({ recipient: address, bouncedAt: INSIDE, bounceType: null });
    expect(await rowFor(address)).toBeUndefined();
  });

  it("a complaint counts as a complaint, not as a bounce", async () => {
    const address = "complaint-review@example.com";
    await seedSend({ recipient: address, complainedAt: INSIDE });
    const row = await rowFor(address);
    expect(row?.complaints).toBe(1);
    expect(row?.soft).toBe(0);
    expect(row?.hard).toBe(0);
  });
});

describe("recommendation rule", () => {
  it("three soft bounces on three UTC days are recommended", async () => {
    const address = "three-days-review@example.com";
    for (const day of ["2026-10-02", "2026-10-03", "2026-10-04"]) {
      await seedSend({
        recipient: address,
        bouncedAt: new Date(`${day}T12:00:00.000Z`),
        bounceType: "Transient",
        bounceSubType: "General",
      });
    }
    const row = await rowFor(address);
    expect(row?.softDays).toBe(3);
    expect(row && isRecommended(row, CLASSIFICATION.softThreshold)).toBe(true);
    expect((await rowFor(address, "recommended"))?.address).toBe(address);
  });

  it("three soft bounces on one UTC day give softDays 1 and are not recommended", async () => {
    const address = "one-day-review@example.com";
    for (const hour of [8, 12, 18]) {
      await seedSend({
        recipient: address,
        bouncedAt: new Date(
          `2026-10-03T${String(hour).padStart(2, "0")}:00:00.000Z`
        ),
        bounceType: "Transient",
        bounceSubType: "General",
      });
    }
    const row = await rowFor(address);
    expect(row?.soft).toBe(3);
    expect(row?.softDays).toBe(1);
    expect(row && isRecommended(row, CLASSIFICATION.softThreshold)).toBe(false);
    expect(await rowFor(address, "recommended")).toBeUndefined();
  });

  it("a delivery after the bounces resets the soft-day count and the hard-open count", async () => {
    const address = "delivered-after-review@example.com";
    for (const day of ["2026-10-02", "2026-10-03", "2026-10-04"]) {
      await seedSend({
        recipient: address,
        bouncedAt: new Date(`${day}T12:00:00.000Z`),
        bounceType: "Transient",
        bounceSubType: "General",
      });
    }
    await seedSend({
      recipient: address,
      sentAt: new Date("2026-10-06T09:00:00.000Z"),
      deliveredAt: new Date("2026-10-06T09:01:00.000Z"),
    });
    const row = await rowFor(address);
    expect(row?.softDays).toBe(0);
    expect(row?.hardOpen).toBe(0);
    expect(await rowFor(address, "recommended")).toBeUndefined();
    // Still in the soft tab: a delivery removes it from Recommendations only.
    expect((await rowFor(address, "soft"))?.soft).toBe(3);
  });

  it("a hard bounce before a delivery is not open", async () => {
    const address = "hard-then-delivered-review@example.com";
    await seedSend({
      recipient: address,
      sentAt: new Date("2026-10-02T08:00:00.000Z"),
      bouncedAt: new Date("2026-10-02T08:05:00.000Z"),
      bounceType: "Permanent",
    });
    await seedSend({
      recipient: address,
      sentAt: new Date("2026-10-06T08:00:00.000Z"),
      deliveredAt: new Date("2026-10-06T08:01:00.000Z"),
    });
    const row = await rowFor(address);
    expect(row?.hard).toBe(1);
    expect(row?.hardOpen).toBe(0);
    expect(await rowFor(address, "recommended")).toBeUndefined();
  });

  it("a delivery before the bounces does not reset them", async () => {
    const address = "delivered-before-review@example.com";
    await seedSend({
      recipient: address,
      sentAt: new Date("2026-10-01T06:00:00.000Z"),
      deliveredAt: new Date("2026-10-01T06:01:00.000Z"),
    });
    for (const day of ["2026-10-02", "2026-10-03", "2026-10-04"]) {
      await seedSend({
        recipient: address,
        bouncedAt: new Date(`${day}T12:00:00.000Z`),
        bounceType: "Transient",
        bounceSubType: "General",
      });
    }
    const row = await rowFor(address);
    expect(row?.softDays).toBe(3);
    expect((await rowFor(address, "recommended"))?.address).toBe(address);
  });

  it("a complaint is recommended even after a later delivery", async () => {
    const address = "complaint-delivered-review@example.com";
    await seedSend({ recipient: address, complainedAt: INSIDE });
    await seedSend({
      recipient: address,
      sentAt: new Date("2026-10-07T10:00:00.000Z"),
      deliveredAt: new Date("2026-10-07T10:01:00.000Z"),
    });
    expect((await rowFor(address, "recommended"))?.address).toBe(address);
  });
});

describe("grouping, scope and window", () => {
  it("groups addresses case-insensitively", async () => {
    const address = "case-group-review@x.com";
    await seedSend({
      recipient: "Case-Group-Review@X.com",
      bouncedAt: INSIDE,
      bounceType: "Permanent",
    });
    await seedSend({
      recipient: "case-GROUP-review@x.COM",
      bouncedAt: INSIDE,
      bounceType: "Permanent",
    });
    const matches = (await queryA()).rows.filter(
      (row) => row.address === address
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.hard).toBe(2);
  });

  it("ignores sms-channel rows", async () => {
    const address = "sms-ignored-review@example.com";
    await seedSend({
      recipient: address,
      channel: "sms",
      bouncedAt: INSIDE,
      bounceType: "Permanent",
    });
    expect(await rowFor(address)).toBeUndefined();
  });

  it("excludes sends sent before the window and after it, and includes the end", async () => {
    const before = "before-window-review@example.com";
    const after = "after-window-review@example.com";
    const atEnd = "at-end-review@example.com";
    await seedSend({
      recipient: before,
      sentAt: new Date(START.getTime() - 1),
      bouncedAt: INSIDE,
      bounceType: "Permanent",
    });
    await seedSend({
      recipient: after,
      sentAt: new Date(END.getTime() + 1),
      bouncedAt: INSIDE,
      bounceType: "Permanent",
    });
    await seedSend({
      recipient: atEnd,
      sentAt: END,
      bouncedAt: INSIDE,
      bounceType: "Permanent",
    });
    expect(await rowFor(before)).toBeUndefined();
    expect(await rowFor(after)).toBeUndefined();
    expect((await rowFor(atEnd))?.hard).toBe(1);
  });

  it("never returns a row from another organization", async () => {
    const address = "isolation-review@example.com";
    const beforeCounts = await queryReviewAddressCounts({
      organizationId: ORG_A,
      ...WINDOW,
      classification: CLASSIFICATION,
    });
    await seedSend({
      organizationId: ORG_B,
      recipient: address,
      complainedAt: INSIDE,
    });
    await seedSend({
      organizationId: ORG_B,
      recipient: address,
      sentAt: new Date("2026-10-06T10:00:00.000Z"),
      deliveredAt: new Date("2026-10-06T10:01:00.000Z"),
    });
    expect(await rowFor(address)).toBeUndefined();
    expect(await rowFor(address, "complaint")).toBeUndefined();
    // A foreign complaint leaves org A's counts where they were.
    expect(
      await queryReviewAddressCounts({
        organizationId: ORG_A,
        ...WINDOW,
        classification: CLASSIFICATION,
      })
    ).toEqual(beforeCounts);
  });

  it("does not let a foreign delivery clear a local bounce", async () => {
    const address = "foreign-delivery-review@example.com";
    for (const day of ["2026-10-02", "2026-10-03", "2026-10-04"]) {
      await seedSend({
        recipient: address,
        bouncedAt: new Date(`${day}T12:00:00.000Z`),
        bounceType: "Transient",
        bounceSubType: "General",
      });
    }
    await seedSend({
      organizationId: ORG_B,
      recipient: address,
      sentAt: new Date("2026-10-06T10:00:00.000Z"),
      deliveredAt: new Date("2026-10-06T10:01:00.000Z"),
    });
    const row = await rowFor(address);
    expect(row?.softDays).toBe(3);
    expect((await rowFor(address, "recommended"))?.address).toBe(address);
  });
});

describe("paging, ordering and counts", () => {
  it("returns the latest event's AWS account", async () => {
    const address = "account-review@example.com";
    await seedSend({
      recipient: address,
      bouncedAt: new Date("2026-10-02T09:00:00.000Z"),
      bounceType: "Permanent",
      awsAccountId: ACCOUNT_A1,
    });
    await seedSend({
      recipient: address,
      bouncedAt: new Date("2026-10-08T09:00:00.000Z"),
      bounceType: "Permanent",
      awsAccountId: ACCOUNT_A2,
    });
    const row = await rowFor(address);
    expect(row?.awsAccountId).toBe(ACCOUNT_A2);
    expect(row?.lastEventAt?.toISOString()).toBe("2026-10-08T09:00:00.000Z");
  });

  it("orders by the latest event, newest first", async () => {
    const older = "order-older-review@example.com";
    const newer = "order-newer-review@example.com";
    await seedSend({
      recipient: older,
      bouncedAt: new Date("2026-10-02T09:00:00.000Z"),
      bounceType: "Permanent",
    });
    await seedSend({
      recipient: newer,
      bouncedAt: new Date("2026-10-09T09:00:00.000Z"),
      bounceType: "Permanent",
    });
    const addresses = (await queryA({ kind: "hard" })).rows.map(
      (row) => row.address
    );
    expect(addresses.indexOf(newer)).toBeLessThan(addresses.indexOf(older));
  });

  it("pages with limit, offset and hasMore to the same list as one full page", async () => {
    const full = (await queryA({ kind: "soft" })).rows.map(
      (row) => row.address
    );
    expect(full.length).toBeGreaterThanOrEqual(3);

    const collected: string[] = [];
    let offset = 0;
    for (;;) {
      const page = await queryA({ kind: "soft", limit: 2, offset });
      expect(page.rows.length).toBeLessThanOrEqual(2);
      collected.push(...page.rows.map((row) => row.address));
      if (!page.hasMore) {
        break;
      }
      offset += 2;
    }
    expect(collected).toEqual(full);
  });

  it("reports hasMore false on the last full page", async () => {
    const full = (await queryA({ kind: "soft" })).rows.length;
    const page = await queryA({ kind: "soft", limit: full, offset: 0 });
    expect(page.rows).toHaveLength(full);
    expect(page.hasMore).toBe(false);
  });

  it("counts addresses per list, and an address can be in more than one", async () => {
    const counts = await queryReviewAddressCounts({
      organizationId: ORG_A,
      ...WINDOW,
      classification: CLASSIFICATION,
    });
    const all = (await queryA()).rows;
    expect(counts.soft).toBe(all.filter((row) => row.soft > 0).length);
    expect(counts.hard).toBe(all.filter((row) => row.hard > 0).length);
    expect(counts.complaint).toBe(
      all.filter((row) => row.complaints > 0).length
    );
  });
});
