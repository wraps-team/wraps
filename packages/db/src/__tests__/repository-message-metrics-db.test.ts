import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  getMessageMetrics,
  MetricsQueryError,
  queryMessageMetricBuckets,
} from "../repositories/message-metrics";
import { awsAccount, batchSend, messageSend, organization } from "../schema";

const suffix = crypto.randomUUID().slice(0, 8);

const ORG_A = `metrics-org-a-${suffix}`;
const ORG_B = `metrics-org-b-${suffix}`;
const ACCOUNT_A = `metrics-acct-a-${suffix}`;
const ACCOUNT_B = `metrics-acct-b-${suffix}`;
const BATCH_A = `metrics-batch-a-${suffix}`;
const BATCH_B = `metrics-batch-b-${suffix}`;

const REAL_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const BOT_UA = "curl/8.4.0";

let rowCounter = 0;
function rowId(): string {
  rowCounter += 1;
  return `metrics-row-${suffix}-${rowCounter}`;
}

type SeedRow = {
  organizationId: string;
  awsAccountId: string;
  batchSendId?: string;
  sourceType: "transactional" | "batch" | "campaign" | "workflow";
  status:
    | "pending"
    | "queued"
    | "sent"
    | "delivered"
    | "opened"
    | "clicked"
    | "bounced"
    | "complained"
    | "suppressed"
    | "failed"
    | "opted_out";
  sentAt: Date | null;
  deliveredAt?: Date;
  openedAt?: Date;
  openUserAgent?: string;
  clickedAt?: Date;
  bouncedAt?: Date;
  bounceType?: string;
  complainedAt?: Date;
  suppressedAt?: Date;
  from?: string | null;
};

const seedRows: (SeedRow & { id: string })[] = [];

function seed(row: SeedRow): string {
  const id = rowId();
  seedRows.push({ id, ...row });
  return id;
}

// ─── Case 1 / 2 / 7: totals + org isolation + injection guard ──────────────
// 10 rows, none failed → sent: 10. 7 delivered, 2 bounced (1 permanent, 1
// transient), 1 complained, 3 opens (1 bot-filtered → opened: 2, openedRaw: 3),
// 2 clicks.
const DAY1_START = new Date("2026-08-01T00:00:00Z");
const DAY1_END = new Date("2026-08-01T23:59:59Z");

function seedDay1Shape(organizationId: string, awsAccountId: string) {
  const base = {
    organizationId,
    awsAccountId,
    sourceType: "transactional" as const,
  };
  seed({
    ...base,
    status: "delivered",
    sentAt: new Date("2026-08-01T01:00:00Z"),
    deliveredAt: new Date("2026-08-01T01:01:00Z"),
  });
  seed({
    ...base,
    status: "delivered",
    sentAt: new Date("2026-08-01T02:00:00Z"),
    deliveredAt: new Date("2026-08-01T02:01:00Z"),
  });
  seed({
    ...base,
    status: "delivered",
    sentAt: new Date("2026-08-01T03:00:00Z"),
    deliveredAt: new Date("2026-08-01T03:01:00Z"),
  });
  seed({
    ...base,
    status: "opened",
    sentAt: new Date("2026-08-01T04:00:00Z"),
    deliveredAt: new Date("2026-08-01T04:01:00Z"),
    openedAt: new Date("2026-08-01T04:05:00Z"),
    openUserAgent: REAL_UA,
  });
  seed({
    ...base,
    status: "opened",
    sentAt: new Date("2026-08-01T05:00:00Z"),
    deliveredAt: new Date("2026-08-01T05:01:00Z"),
    openedAt: new Date("2026-08-01T05:05:00Z"),
    openUserAgent: REAL_UA,
  });
  seed({
    ...base,
    status: "opened",
    sentAt: new Date("2026-08-01T06:00:00Z"),
    deliveredAt: new Date("2026-08-01T06:01:00Z"),
    openedAt: new Date("2026-08-01T06:05:00Z"),
    openUserAgent: BOT_UA,
  });
  seed({
    ...base,
    status: "clicked",
    sentAt: new Date("2026-08-01T07:00:00Z"),
    deliveredAt: new Date("2026-08-01T07:01:00Z"),
    clickedAt: new Date("2026-08-01T07:05:00Z"),
  });
  seed({
    ...base,
    status: "bounced",
    sentAt: new Date("2026-08-01T08:00:00Z"),
    bouncedAt: new Date("2026-08-01T08:01:00Z"),
    bounceType: "Permanent",
  });
  seed({
    ...base,
    status: "bounced",
    sentAt: new Date("2026-08-01T09:00:00Z"),
    bouncedAt: new Date("2026-08-01T09:01:00Z"),
    bounceType: "Transient",
    clickedAt: new Date("2026-08-01T09:05:00Z"),
  });
  seed({
    ...base,
    status: "complained",
    sentAt: new Date("2026-08-01T10:00:00Z"),
    complainedAt: new Date("2026-08-01T10:01:00Z"),
  });
}

// ─── Case 3 / 11: period dimension (daily) + row cap ────────────────────────
const DAY357_START = new Date("2026-08-05T00:00:00Z");
const DAY357_END = new Date("2026-08-07T23:59:59Z");

function seedThreeDayShape(organizationId: string, awsAccountId: string) {
  const base = {
    organizationId,
    awsAccountId,
    sourceType: "transactional" as const,
  };
  seed({
    ...base,
    status: "delivered",
    sentAt: new Date("2026-08-05T01:00:00Z"),
    deliveredAt: new Date("2026-08-05T01:01:00Z"),
  });
  seed({
    ...base,
    status: "delivered",
    sentAt: new Date("2026-08-05T02:00:00Z"),
    deliveredAt: new Date("2026-08-05T02:01:00Z"),
  });
  seed({
    ...base,
    status: "sent",
    sentAt: new Date("2026-08-06T01:00:00Z"),
  });
  seed({
    ...base,
    status: "delivered",
    sentAt: new Date("2026-08-07T01:00:00Z"),
    deliveredAt: new Date("2026-08-07T01:01:00Z"),
  });
  seed({
    ...base,
    status: "delivered",
    sentAt: new Date("2026-08-07T02:00:00Z"),
    deliveredAt: new Date("2026-08-07T02:01:00Z"),
  });
  seed({
    ...base,
    status: "bounced",
    sentAt: new Date("2026-08-07T03:00:00Z"),
    bouncedAt: new Date("2026-08-07T03:01:00Z"),
    bounceType: "Permanent",
  });
}

// ─── Case 4: period dimension (hourly) ──────────────────────────────────────
const DAY10_START = new Date("2026-08-10T00:00:00Z");
const DAY10_END = new Date("2026-08-10T23:59:59Z");

function seedHourlyShape(organizationId: string, awsAccountId: string) {
  const base = {
    organizationId,
    awsAccountId,
    sourceType: "transactional" as const,
  };
  seed({ ...base, status: "sent", sentAt: new Date("2026-08-10T02:15:00Z") });
  seed({ ...base, status: "sent", sentAt: new Date("2026-08-10T14:45:00Z") });
}

// ─── Case 5: timezone shifts the bucket ─────────────────────────────────────
const DAY20_START = new Date("2026-08-19T00:00:00Z");
const DAY20_END = new Date("2026-08-20T23:59:59Z");

// ─── Case 8: domain dimension ────────────────────────────────────────────────
const DAY27_START = new Date("2026-08-27T00:00:00Z");
const DAY27_END = new Date("2026-08-27T23:59:59Z");

function seedDomainShape(organizationId: string, awsAccountId: string) {
  const base = {
    organizationId,
    awsAccountId,
    sourceType: "transactional" as const,
  };
  seed({
    ...base,
    status: "sent",
    sentAt: new Date("2026-08-27T01:00:00Z"),
    from: "a@One.example",
  });
  seed({
    ...base,
    status: "sent",
    sentAt: new Date("2026-08-27T02:00:00Z"),
    from: "b@two.example",
  });
  seed({
    ...base,
    status: "sent",
    sentAt: new Date("2026-08-27T03:00:00Z"),
    from: null,
  });
}

// ─── Case 9: broadcast dimension + filter ───────────────────────────────────
const DAY28_START = new Date("2026-08-28T00:00:00Z");
const DAY28_END = new Date("2026-08-28T23:59:59Z");

function seedBroadcastShape(organizationId: string, awsAccountId: string) {
  const base = { organizationId, awsAccountId, sourceType: "batch" as const };
  seed({
    ...base,
    batchSendId: BATCH_A,
    status: "sent",
    sentAt: new Date("2026-08-28T01:00:00Z"),
  });
  seed({
    ...base,
    batchSendId: BATCH_A,
    status: "sent",
    sentAt: new Date("2026-08-28T02:00:00Z"),
  });
  seed({
    ...base,
    batchSendId: BATCH_B,
    status: "sent",
    sentAt: new Date("2026-08-28T03:00:00Z"),
  });
}

// ─── Case 10: sentAt IS NULL rows are excluded ──────────────────────────────
const DAY29_START = new Date("2026-08-29T00:00:00Z");
const DAY29_END = new Date("2026-08-29T23:59:59Z");

function seedPendingShape(organizationId: string, awsAccountId: string) {
  const base = {
    organizationId,
    awsAccountId,
    sourceType: "transactional" as const,
  };
  seed({
    ...base,
    status: "delivered",
    sentAt: new Date("2026-08-29T01:00:00Z"),
    deliveredAt: new Date("2026-08-29T01:01:00Z"),
  });
  seed({
    ...base,
    status: "pending",
    sentAt: null,
  });
}

beforeAll(async () => {
  await db
    .insert(organization)
    .values([
      {
        id: ORG_A,
        name: "Metrics Repo Test Org A",
        slug: `metrics-repo-a-${suffix}`,
        createdAt: new Date(),
      },
      {
        id: ORG_B,
        name: "Metrics Repo Test Org B",
        slug: `metrics-repo-b-${suffix}`,
        createdAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(awsAccount)
    .values([
      {
        id: ACCOUNT_A,
        organizationId: ORG_A,
        name: "Metrics A",
        accountId: "111111111111",
        region: "us-east-1",
        roleArn: "arn:aws:iam::111111111111:role/wraps",
        externalId: `${suffix}-ext-a`,
      },
      {
        id: ACCOUNT_B,
        organizationId: ORG_B,
        name: "Metrics B",
        accountId: "222222222222",
        region: "eu-west-1",
        roleArn: "arn:aws:iam::222222222222:role/wraps",
        externalId: `${suffix}-ext-b`,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(batchSend)
    .values([
      { id: BATCH_A, organizationId: ORG_A },
      { id: BATCH_B, organizationId: ORG_A },
    ])
    .onConflictDoNothing();

  seedDay1Shape(ORG_A, ACCOUNT_A);
  seedDay1Shape(ORG_B, ACCOUNT_B); // mirrored under org B for the isolation test
  seedThreeDayShape(ORG_A, ACCOUNT_A);
  seedHourlyShape(ORG_A, ACCOUNT_A);
  seed({
    organizationId: ORG_A,
    awsAccountId: ACCOUNT_A,
    sourceType: "transactional",
    status: "sent",
    sentAt: new Date("2026-08-20T02:00:00Z"),
  });
  seedDomainShape(ORG_A, ACCOUNT_A);
  seedBroadcastShape(ORG_A, ACCOUNT_A);
  seedPendingShape(ORG_A, ACCOUNT_A);

  await db
    .insert(messageSend)
    .values(
      seedRows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        awsAccountId: row.awsAccountId,
        batchSendId: row.batchSendId ?? null,
        channel: "email" as const,
        sourceType: row.sourceType,
        recipient: "recipient@example.com",
        from: row.from === undefined ? "billing@wraps.dev" : row.from,
        messageId: row.id,
        status: row.status,
        sentAt: row.sentAt,
        deliveredAt: row.deliveredAt ?? null,
        openedAt: row.openedAt ?? null,
        openUserAgent: row.openUserAgent ?? null,
        clickedAt: row.clickedAt ?? null,
        bouncedAt: row.bouncedAt ?? null,
        bounceType: row.bounceType ?? null,
        complainedAt: row.complainedAt ?? null,
        suppressedAt: row.suppressedAt ?? null,
      }))
    )
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(messageSend).where(eq(messageSend.organizationId, ORG_A));
  await db.delete(messageSend).where(eq(messageSend.organizationId, ORG_B));
  await db.delete(batchSend).where(eq(batchSend.organizationId, ORG_A));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, ORG_A));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, ORG_B));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
});

describe("Repository: message metrics", () => {
  it("totals with no dimensions", async () => {
    const result = await getMessageMetrics({
      organizationId: ORG_A,
      startTime: DAY1_START,
      endTime: DAY1_END,
    });

    expect(result.data).toEqual([]);
    expect(result.totals.sent).toBe(10);
    expect(result.totals.delivered).toBe(7);
    expect(result.totals.bounced).toBe(2);
    expect(result.totals.bouncedPermanent).toBe(1);
    expect(result.totals.bouncedTransient).toBe(1);
    expect(result.totals.opened).toBe(2);
    expect(result.totals.openedRaw).toBe(3);
    expect(result.totals.clicked).toBe(2);
    expect(result.totals.complained).toBe(1);
  });

  it("org isolation — a query for org A does not pick up org B's mirrored rows", async () => {
    const resultA = await getMessageMetrics({
      organizationId: ORG_A,
      startTime: DAY1_START,
      endTime: DAY1_END,
    });
    const resultB = await getMessageMetrics({
      organizationId: ORG_B,
      startTime: DAY1_START,
      endTime: DAY1_END,
    });

    expect(resultA.totals.sent).toBe(10);
    expect(resultB.totals.sent).toBe(10);
  });

  it("period dimension, daily — three chronological buckets whose sum equals totals", async () => {
    const result = await getMessageMetrics({
      organizationId: ORG_A,
      startTime: DAY357_START,
      endTime: DAY357_END,
      dimensions: ["period"],
      granularity: "daily",
    });

    expect(result.data).toHaveLength(3);
    expect(result.data.map((r) => r.period)).toEqual([
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ]);

    const summed = result.data.reduce(
      (acc, row) => ({
        sent: acc.sent + row.sent,
        delivered: acc.delivered + row.delivered,
        bouncedPermanent: acc.bouncedPermanent + row.bouncedPermanent,
      }),
      { sent: 0, delivered: 0, bouncedPermanent: 0 }
    );

    expect(summed.sent).toBe(result.totals.sent);
    expect(summed.delivered).toBe(result.totals.delivered);
    expect(summed.bouncedPermanent).toBe(result.totals.bouncedPermanent);
    expect(result.totals.sent).toBe(6);
    expect(result.totals.delivered).toBe(4);
    expect(result.totals.bouncedPermanent).toBe(1);
  });

  it("period dimension, hourly — two buckets in the same day", async () => {
    const rows = await queryMessageMetricBuckets({
      organizationId: ORG_A,
      startTime: DAY10_START,
      endTime: DAY10_END,
      dimensions: ["period"],
      granularity: "hourly",
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.period)).toEqual([
      "2026-08-10T02:00:00",
      "2026-08-10T14:00:00",
    ]);
  });

  it("timezone shifts the bucket", async () => {
    const utcRows = await queryMessageMetricBuckets({
      organizationId: ORG_A,
      startTime: DAY20_START,
      endTime: DAY20_END,
      dimensions: ["period"],
      timezone: "UTC",
    });
    const nyRows = await queryMessageMetricBuckets({
      organizationId: ORG_A,
      startTime: DAY20_START,
      endTime: DAY20_END,
      dimensions: ["period"],
      timezone: "America/New_York",
    });

    expect(utcRows.map((r) => r.period)).toContain("2026-08-20");
    expect(nyRows.map((r) => r.period)).toContain("2026-08-19");
  });

  it("default timezone is accepted, same as explicit UTC", async () => {
    const withDefault = await getMessageMetrics({
      organizationId: ORG_A,
      startTime: DAY357_START,
      endTime: DAY357_END,
      dimensions: ["period"],
    });
    const withUtc = await getMessageMetrics({
      organizationId: ORG_A,
      startTime: DAY357_START,
      endTime: DAY357_END,
      dimensions: ["period"],
      timezone: "UTC",
    });

    expect(withDefault.totals.sent).toBe(withUtc.totals.sent);
    expect(withDefault.data).toHaveLength(withUtc.data.length);
  });

  it("invalid timezone throws before any query, and the table stays intact", async () => {
    await expect(
      getMessageMetrics({
        organizationId: ORG_A,
        startTime: DAY1_START,
        endTime: DAY1_END,
        timezone: "'; DROP TABLE message_send; --",
      })
    ).rejects.toThrow(MetricsQueryError);

    await expect(
      getMessageMetrics({
        organizationId: ORG_A,
        startTime: DAY1_START,
        endTime: DAY1_END,
        timezone: "Nope/Zone",
      })
    ).rejects.toThrow(MetricsQueryError);

    const result = await getMessageMetrics({
      organizationId: ORG_A,
      startTime: DAY1_START,
      endTime: DAY1_END,
    });
    expect(result.totals.sent).toBe(10);
  });

  it("domain dimension — lowercased, with null from grouped as null", async () => {
    const rows = await queryMessageMetricBuckets({
      organizationId: ORG_A,
      startTime: DAY27_START,
      endTime: DAY27_END,
      dimensions: ["domain"],
    });

    const domains = rows.map((r) => r.domain);
    expect(domains).toContain("one.example");
    expect(domains).toContain("two.example");
    expect(domains).toContain(null);
    expect(rows).toHaveLength(3);
  });

  it("broadcast dimension + broadcastId filter", async () => {
    const unfiltered = await queryMessageMetricBuckets({
      organizationId: ORG_A,
      startTime: DAY28_START,
      endTime: DAY28_END,
      dimensions: ["broadcast"],
    });
    expect(unfiltered).toHaveLength(2);

    const filtered = await queryMessageMetricBuckets({
      organizationId: ORG_A,
      startTime: DAY28_START,
      endTime: DAY28_END,
      dimensions: ["broadcast"],
      broadcastId: [BATCH_A],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.broadcastId).toBe(BATCH_A);
    expect(filtered[0]?.sent).toBe(2);
  });

  it("sentAt IS NULL rows are excluded from every bucket and total", async () => {
    const result = await getMessageMetrics({
      organizationId: ORG_A,
      startTime: DAY29_START,
      endTime: DAY29_END,
    });

    // One delivered row plus one pending (sentAt: null) row were seeded for
    // this day; only the delivered row should be counted.
    expect(result.totals.sent).toBe(1);
  });

  it("row cap — maxRows below the bucket count throws, at or above it succeeds", async () => {
    await expect(
      queryMessageMetricBuckets({
        organizationId: ORG_A,
        startTime: DAY357_START,
        endTime: DAY357_END,
        dimensions: ["period"],
        maxRows: 2,
      })
    ).rejects.toThrow(MetricsQueryError);

    const rows = await queryMessageMetricBuckets({
      organizationId: ORG_A,
      startTime: DAY357_START,
      endTime: DAY357_END,
      dimensions: ["period"],
      maxRows: 3,
    });
    expect(rows).toHaveLength(3);
  });
});
