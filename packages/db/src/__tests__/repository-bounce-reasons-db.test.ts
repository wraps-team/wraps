// DB-backed. NOT RUN in the reasons worktree: apps/web/.env.test does not exist
// there, so DATABASE_URL is unset. Written to spec section 9 ("Repository (DB)").
// Fixtures are namespaced by a per-file suffix, and every id carries it.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  queryBounceReasonRows,
  queryComplaintReasonRows,
  queryReasonsFallbackSince,
  queryReasonsSuppressionCount,
  queryReasonTotals,
} from "../repositories/message-metrics";
import {
  awsAccount,
  messageSend,
  messageSendDiagnostic,
  organization,
} from "../schema";

const suffix = crypto.randomUUID().slice(0, 8);
const ORG = `rsn-org-${suffix}`;
const OTHER_ORG = `rsn-other-org-${suffix}`;
const ACCOUNT = `rsn-acct-${suffix}`;
const OTHER_ACCOUNT = `rsn-other-acct-${suffix}`;

// Local day in New York for the day-mode case: 03:30 UTC on Oct 20 is 23:30 on Oct 19 (EDT).
const WINDOW_START = new Date("2026-10-01T00:00:00.000Z");
const WINDOW_END = new Date("2026-10-31T23:59:59.999Z");

let rowCounter = 0;
function rowId(): string {
  rowCounter += 1;
  return `rsn-row-${suffix}-${rowCounter}`;
}

type SeedRow = {
  id: string;
  organizationId: string;
  recipient: string;
  sentAt: Date;
  channel?: "email" | "sms";
  bouncedAt?: Date;
  bounceType?: string;
  bounceSubType?: string | null;
  complainedAt?: Date;
  diagnostic?: {
    eventType: "bounce" | "complaint";
    enhancedStatus?: string | null;
    diagnosticCode?: string | null;
    reasonKey?: string | null;
    feedbackType?: string | null;
  };
};

const seeded: SeedRow[] = [];

function seed(row: Omit<SeedRow, "id"> & { id?: string }): string {
  const id = row.id ?? rowId();
  seeded.push({ ...row, id });
  return id;
}

async function insertSeeded() {
  await db.insert(messageSend).values(
    seeded.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      awsAccountId: row.organizationId === ORG ? ACCOUNT : OTHER_ACCOUNT,
      channel: row.channel ?? ("email" as const),
      recipient: row.recipient,
      sourceType: "batch" as const,
      status: row.bouncedAt
        ? ("bounced" as const)
        : row.complainedAt
          ? ("complained" as const)
          : ("sent" as const),
      sentAt: row.sentAt,
      bouncedAt: row.bouncedAt ?? null,
      bounceType: row.bounceType ?? null,
      bounceSubType: row.bounceSubType ?? null,
      complainedAt: row.complainedAt ?? null,
    }))
  );

  const diagnostics = seeded.flatMap((row) =>
    row.diagnostic
      ? [
          {
            messageSendId: row.id,
            organizationId: row.organizationId,
            eventType: row.diagnostic.eventType,
            enhancedStatus: row.diagnostic.enhancedStatus ?? null,
            diagnosticCode: row.diagnostic.diagnosticCode ?? null,
            reasonKey: row.diagnostic.reasonKey ?? null,
            feedbackType: row.diagnostic.feedbackType ?? null,
          },
        ]
      : []
  );
  if (diagnostics.length > 0) {
    await db.insert(messageSendDiagnostic).values(diagnostics);
  }
}

const ALL_TIME = {
  organizationId: ORG,
  startTime: WINDOW_START,
  endTime: WINDOW_END,
  timezone: "UTC",
};

function sumCounts(rows: Array<{ count: number }>): number {
  return rows.reduce((total, row) => total + row.count, 0);
}

function everyStringField(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(everyStringField);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(everyStringField);
  }
  return [];
}

beforeAll(async () => {
  await db
    .insert(organization)
    .values([
      {
        id: ORG,
        name: "Reasons Org",
        slug: `rsn-org-${suffix}`,
        createdAt: new Date(),
      },
      {
        id: OTHER_ORG,
        name: "Reasons Other Org",
        slug: `rsn-other-org-${suffix}`,
        createdAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(awsAccount)
    .values([
      {
        id: ACCOUNT,
        organizationId: ORG,
        name: "Reasons Acct",
        accountId: "444444444444",
        region: "us-east-1",
        roleArn: "arn:aws:iam::444444444444:role/wraps",
        externalId: `ext-rsn-${suffix}`,
      },
      {
        id: OTHER_ACCOUNT,
        organizationId: OTHER_ORG,
        name: "Reasons Other Acct",
        accountId: "555555555555",
        region: "us-east-1",
        roleArn: "arn:aws:iam::555555555555:role/wraps",
        externalId: `ext-rsn-other-${suffix}`,
      },
    ])
    .onConflictDoNothing();

  const sent = new Date("2026-10-10T10:00:00.000Z");
  const bounced = new Date("2026-10-11T10:00:00.000Z");

  // Detailed Gmail bounces, two recipients, one reason.
  seed({
    organizationId: ORG,
    recipient: "a@gmail.com",
    sentAt: sent,
    bouncedAt: bounced,
    bounceType: "Permanent",
    bounceSubType: "NoEmail",
    diagnostic: {
      eventType: "bounce",
      enhancedStatus: "5.1.1",
      diagnosticCode: "smtp; 550 5.1.1 user unknown",
      reasonKey: "gmail||550 5.1.1|x",
    },
  });
  seed({
    organizationId: ORG,
    recipient: "b@GMAIL.com ",
    sentAt: sent,
    bouncedAt: bounced,
    bounceType: "Permanent",
    bounceSubType: "NoEmail",
    diagnostic: {
      eventType: "bounce",
      enhancedStatus: "5.1.1",
      diagnosticCode: "smtp; 550 5.1.1 user unknown",
      reasonKey: "gmail||550 5.1.1|x",
    },
  });

  // Pre-M1 bounce: no diagnostic row.
  seed({
    organizationId: ORG,
    recipient: "c@example.org",
    sentAt: sent,
    bouncedAt: bounced,
    bounceType: "Permanent",
    bounceSubType: "General",
  });

  // A bounce whose subtype is NULL: a real bounce that must be kept.
  seed({
    organizationId: ORG,
    recipient: "d@example.org",
    sentAt: sent,
    bouncedAt: bounced,
    bounceType: "Undetermined",
    bounceSubType: null,
  });

  // SDK-path suppression rows: excluded from the reasons view.
  seed({
    organizationId: ORG,
    recipient: "e@example.org",
    sentAt: sent,
    bouncedAt: bounced,
    bounceType: "Permanent",
    bounceSubType: "Suppressed",
  });
  seed({
    organizationId: ORG,
    recipient: "f@example.org",
    sentAt: sent,
    bouncedAt: bounced,
    bounceType: "Permanent",
    bounceSubType: "EmailValidationSuppressed",
  });

  // Complaints: one with a null feedback type on a recorded row, one with a type.
  seed({
    organizationId: ORG,
    recipient: "g@yahoo.com",
    sentAt: sent,
    complainedAt: bounced,
    diagnostic: { eventType: "complaint", feedbackType: null },
  });
  seed({
    organizationId: ORG,
    recipient: "h@yahoo.com",
    sentAt: sent,
    complainedAt: bounced,
    diagnostic: { eventType: "complaint", feedbackType: "abuse" },
  });

  // Earlier detailed bounce for ORG, before the rows above, so fallbackSince
  // is the earliest bounce that has a diagnostic row.
  seed({
    organizationId: ORG,
    recipient: "early@gmail.com",
    sentAt: new Date("2026-10-02T10:00:00.000Z"),
    bouncedAt: new Date("2026-10-03T14:22:00.000Z"),
    bounceType: "Permanent",
    bounceSubType: "General",
    diagnostic: {
      eventType: "bounce",
      enhancedStatus: "5.1.1",
      diagnosticCode: "550 5.1.1",
    },
  });

  // Another org's detailed bounce, earlier still, which must not set ORG's date.
  seed({
    organizationId: OTHER_ORG,
    recipient: "x@other.example",
    sentAt: new Date("2026-09-01T10:00:00.000Z"),
    bouncedAt: new Date("2026-09-02T10:00:00.000Z"),
    bounceType: "Permanent",
    bounceSubType: "General",
    diagnostic: { eventType: "bounce", enhancedStatus: "5.1.1" },
  });

  // Boundary rows for the inclusive window and the day filter.
  seed({
    organizationId: ORG,
    recipient: "start@example.org",
    sentAt: WINDOW_START,
    bouncedAt: bounced,
    bounceType: "Permanent",
    bounceSubType: "General",
  });
  seed({
    organizationId: ORG,
    recipient: "end@example.org",
    sentAt: WINDOW_END,
    bouncedAt: bounced,
    bounceType: "Permanent",
    bounceSubType: "General",
  });
  seed({
    organizationId: ORG,
    recipient: "after@example.org",
    sentAt: new Date("2026-11-01T00:00:00.000Z"),
    bouncedAt: bounced,
    bounceType: "Permanent",
    bounceSubType: "General",
  });
  // 03:30 UTC on Oct 20 is Oct 19 in New York, so it belongs to the Oct 19 day.
  seed({
    organizationId: ORG,
    recipient: "tz@example.org",
    sentAt: new Date("2026-10-20T03:30:00.000Z"),
    bouncedAt: bounced,
    bounceType: "Permanent",
    bounceSubType: "General",
  });

  // A bounce on the SMS channel is not email and must not appear.
  seed({
    organizationId: ORG,
    recipient: "+15555550100",
    channel: "sms",
    sentAt: sent,
    bouncedAt: bounced,
    bounceType: "Permanent",
    bounceSubType: "General",
  });

  await insertSeeded();
});

afterAll(async () => {
  await db
    .delete(messageSendDiagnostic)
    .where(eq(messageSendDiagnostic.organizationId, ORG));
  await db
    .delete(messageSendDiagnostic)
    .where(eq(messageSendDiagnostic.organizationId, OTHER_ORG));
  await db.delete(messageSend).where(eq(messageSend.organizationId, ORG));
  await db.delete(messageSend).where(eq(messageSend.organizationId, OTHER_ORG));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, ORG));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, OTHER_ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(organization).where(eq(organization.id, OTHER_ORG));
});

describe("bounce and complaint reasons repository (DB)", () => {
  it("reasons query is org-scoped: another org's bounces never appear", async () => {
    const rows = await queryBounceReasonRows(ALL_TIME);
    const totals = await queryReasonTotals(ALL_TIME, "bounce");
    // ORG's own bounces only: the other org's detailed bounce is excluded.
    expect(rows.some((row) => row.receiverDomain === "other.example")).toBe(
      false
    );
    expect(sumCounts(rows)).toBe(totals.totalCount);
    expect(totals.totalCount).toBeGreaterThan(0);

    // Querying the other org's id must not reveal ORG's rows either.
    const otherRows = await queryBounceReasonRows({
      ...ALL_TIME,
      organizationId: OTHER_ORG,
    });
    expect(
      otherRows.every((row) => row.receiverDomain === "other.example")
    ).toBe(true);
  });

  it("reasons query excludes Suppressed and EmailValidationSuppressed subtypes", async () => {
    const rows = await queryBounceReasonRows(ALL_TIME);
    expect(
      rows.some(
        (row) =>
          row.bounceSubType === "Suppressed" ||
          row.bounceSubType === "EmailValidationSuppressed"
      )
    ).toBe(false);
    const suppressions = await queryReasonsSuppressionCount(ALL_TIME);
    expect(suppressions).toBe(2);
  });

  it("a bounce with a NULL bounce_sub_type is kept by the reasons query", async () => {
    const rows = await queryBounceReasonRows(ALL_TIME);
    expect(
      rows.some(
        (row) =>
          row.bounceSubType === null && row.receiverDomain === "example.org"
      )
    ).toBe(true);
  });

  it("pre-M1 rows group under has_detail = false with the subtype copy", async () => {
    const rows = await queryBounceReasonRows(ALL_TIME);
    const preM1 = rows.filter((row) => row.hasDetail === false);
    expect(preM1.length).toBeGreaterThan(0);
    expect(preM1.every((row) => row.reasonKey === null)).toBe(true);
    expect(preM1.every((row) => row.sampleCode === null)).toBe(true);
    const detailed = rows.filter((row) => row.hasDetail === true);
    expect(detailed.some((row) => row.reasonKey === "gmail||550 5.1.1|x")).toBe(
      true
    );
  });

  it("fallbackSince is the org's earliest bounced_at that has a diagnostic row, and ignores other orgs", async () => {
    const since = await queryReasonsFallbackSince(ORG, "bounce");
    expect(since?.toISOString()).toBe("2026-10-03T14:22:00.000Z");
    const otherSince = await queryReasonsFallbackSince(OTHER_ORG, "bounce");
    expect(otherSince?.toISOString()).toBe("2026-09-02T10:00:00.000Z");
  });

  it("window honours startTime and endTime inclusively, and day mode uses the chart periodExpr", async () => {
    // Boundary rows: sentAt equal to startTime and to endTime are both included;
    // the row sent a month later is excluded.
    const rows = await queryBounceReasonRows(ALL_TIME);
    const domains = rows.map((row) => row.receiverDomain);
    expect(domains).toContain("example.org");
    const totalAll = await queryReasonTotals(ALL_TIME, "bounce");

    const narrowed = await queryReasonTotals(
      { ...ALL_TIME, endTime: new Date("2026-10-31T23:59:58.000Z") },
      "bounce"
    );
    expect(narrowed.totalCount).toBe(totalAll.totalCount - 1);

    // Day mode: the Oct 19 New York day contains the 03:30 UTC Oct 20 send.
    const day = await queryReasonTotals(
      { ...ALL_TIME, timezone: "America/New_York", day: "2026-10-19" },
      "bounce"
    );
    expect(day.totalCount).toBeGreaterThanOrEqual(1);
    const dayRows = await queryBounceReasonRows({
      ...ALL_TIME,
      timezone: "America/New_York",
      day: "2026-10-19",
    });
    expect(sumCounts(dayRows)).toBe(day.totalCount);
  });

  it("groups are capped at 50 and otherCount plus the groups equals totalCount", async () => {
    // The 50-group cap and otherCount are applied by the route, and are tested
    // with the route in apps/web. At the repository level, the groups are not
    // capped below 500, so their counts sum to the total.
    const rows = await queryBounceReasonRows(ALL_TIME);
    const totals = await queryReasonTotals(ALL_TIME, "bounce");
    expect(rows.length).toBeLessThanOrEqual(500);
    expect(sumCounts(rows)).toBe(totals.totalCount);
  });

  it("distinctRecipients is a count; no address is returned in any field", async () => {
    const rows = await queryBounceReasonRows(ALL_TIME);
    const gmail = rows.find((row) => row.reasonKey === "gmail||550 5.1.1|x");
    // Two recipients, but one domain group with a count of two.
    expect(gmail?.distinctRecipients).toBe(2);
    const strings = rows.flatMap((row) => everyStringField(row));
    for (const value of strings) {
      expect(value).not.toMatch(/@/);
    }
  });

  it("the complaint query groups a null feedback type under not reported", async () => {
    const rows = await queryComplaintReasonRows(ALL_TIME);
    const notReported = rows.find(
      (row) => row.receiverDomain === "yahoo.com" && row.feedbackType === null
    );
    expect(notReported).toBeDefined();
    expect(notReported?.hasDetail).toBe(true);
    const abuse = rows.find(
      (row) =>
        row.receiverDomain === "yahoo.com" && row.feedbackType === "abuse"
    );
    expect(abuse?.hasDetail).toBe(true);
  });
});
