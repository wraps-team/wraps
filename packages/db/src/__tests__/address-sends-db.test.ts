/**
 * Address drill-down repository reads (Q1a, Q1b, Q2, Q3), against the real
 * test database. Fixtures use the `address-s2-` prefix so this file cannot
 * collide with another file's rows. Two orgs, so every isolation case has a
 * foreign row to leak.
 *
 * NOT YET RUN: apps/web/.env.test (DATABASE_URL) is not available in the
 * worktree this was written in. Run with `pnpm --filter @wraps/db test` once
 * the test database is configured.
 */

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  PROBLEM_SEND_QUERY_LIMIT,
  queryAddressProblemSends,
  queryAddressSendTotals,
  queryProblemAddresses,
  queryProblemAddressTotals,
} from "../repositories/address-sends";
import { queryMessageMetricBuckets } from "../repositories/message-metrics";
import { batchSend, messageSend, organization, template } from "../schema";

const suffix = crypto.randomUUID().slice(0, 8);
const ORG_A = `address-s2-org-a-${suffix}`;
const ORG_B = `address-s2-org-b-${suffix}`;
const TEMPLATE_B = `address-s2-template-b-${suffix}`;
const BATCH_B = `address-s2-batch-b-${suffix}`;

// Window used by the window-based tests.
const START = new Date("2026-10-01T00:00:00.000Z");
const END = new Date("2026-10-10T00:00:00.000Z");
const INSIDE = new Date("2026-10-05T12:00:00.000Z");

let counter = 0;
const seeded: string[] = [];

type SeedInput = {
  organizationId?: string;
  recipient: string;
  sentAt?: Date | null;
  bouncedAt?: Date | null;
  complainedAt?: Date | null;
  suppressedAt?: Date | null;
  bounceType?: string | null;
  bounceSubType?: string | null;
  channel?: "email" | "sms";
  emailTemplateId?: string | null;
  batchSendId?: string | null;
  subject?: string | null;
};

async function seedSend(input: SeedInput): Promise<string> {
  counter += 1;
  const id = `address-s2-send-${suffix}-${counter}`;
  await db.insert(messageSend).values({
    id,
    organizationId: input.organizationId ?? ORG_A,
    channel: input.channel ?? "email",
    sourceType: "transactional",
    status: "sent",
    recipient: input.recipient,
    from: "billing@wraps.dev",
    subject: input.subject ?? null,
    sentAt: input.sentAt === undefined ? INSIDE : input.sentAt,
    bouncedAt: input.bouncedAt ?? null,
    complainedAt: input.complainedAt ?? null,
    suppressedAt: input.suppressedAt ?? null,
    bounceType: input.bounceType ?? null,
    bounceSubType: input.bounceSubType ?? null,
    emailTemplateId: input.emailTemplateId ?? null,
    batchSendId: input.batchSendId ?? null,
    awsAccountId: null,
  });
  seeded.push(id);
  return id;
}

const WINDOW = {
  startTime: START,
  endTime: END,
  timezone: "UTC",
};

beforeAll(async () => {
  await db.insert(organization).values([
    {
      id: ORG_A,
      name: "Address S2 Org A",
      slug: `address-s2-a-${suffix}`,
      createdAt: new Date(),
    },
    {
      id: ORG_B,
      name: "Address S2 Org B",
      slug: `address-s2-b-${suffix}`,
      createdAt: new Date(),
    },
  ]);
  await db.insert(template).values({
    id: TEMPLATE_B,
    organizationId: ORG_B,
    name: "Address S2 Org B template",
    channel: "email",
    content: {},
  });
  await db.insert(batchSend).values({ id: BATCH_B, organizationId: ORG_B });
});

afterAll(async () => {
  if (seeded.length > 0) {
    await db.delete(messageSend).where(inArray(messageSend.id, seeded));
  }
  await db.delete(batchSend).where(eq(batchSend.id, BATCH_B));
  await db.delete(template).where(eq(template.id, TEMPLATE_B));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
});

describe("Q2 address totals", () => {
  it('Q2 matches recipient case-insensitively: "Mixed@Example.com" row matched by "mixed@example.com"', async () => {
    await seedSend({ recipient: "Mixed@Example.com" });
    const totals = await queryAddressSendTotals({
      organizationId: ORG_A,
      address: "mixed@example.com",
    });
    expect(totals.sends).toBe(1);
  });

  it("Q2 matches a lowercase row for a mixed-case query", async () => {
    await seedSend({ recipient: "lower-q2@example.com" });
    const totals = await queryAddressSendTotals({
      organizationId: ORG_A,
      address: "Lower-Q2@Example.COM",
    });
    expect(totals.sends).toBe(1);
  });

  it("Q2 does not match a different address that shares a domain", async () => {
    await seedSend({ recipient: "only-this-one-q2@example.com" });
    const totals = await queryAddressSendTotals({
      organizationId: ORG_A,
      address: "someone-else-q2@example.com",
    });
    expect(totals.sends).toBe(0);
  });

  it("Q2 returns zero rows for an address used only by another organization", async () => {
    await seedSend({
      organizationId: ORG_B,
      recipient: "org-b-only-q2@example.com",
    });
    const totals = await queryAddressSendTotals({
      organizationId: ORG_A,
      address: "org-b-only-q2@example.com",
    });
    expect(totals.sends).toBe(0);
  });
});

describe("Q1a problem addresses", () => {
  it("Q1a excludes sends outside [startTime, endTime] by sent_at", async () => {
    const recipient = "window-q1a@example.com";
    await seedSend({
      recipient,
      sentAt: new Date(START.getTime() - 1),
      bouncedAt: INSIDE,
    });
    await seedSend({
      recipient,
      sentAt: new Date(END.getTime() + 1),
      bouncedAt: INSIDE,
    });
    const rows = await queryProblemAddresses({
      organizationId: ORG_A,
      ...WINDOW,
    });
    expect(rows.find((r) => r.address === recipient)).toBeUndefined();
  });

  it("Q1a excludes sends with sent_at null (they are outside the analytics window, which buckets by sent_at)", async () => {
    const recipient = "null-sent-q1a@example.com";
    await seedSend({ recipient, sentAt: null, bouncedAt: INSIDE });
    const rows = await queryProblemAddresses({
      organizationId: ORG_A,
      ...WINDOW,
    });
    expect(rows.find((r) => r.address === recipient)).toBeUndefined();
  });

  it("Q1a ranks complaints before bounces before last_problem", async () => {
    await seedSend({
      recipient: "rank-bounces-q1a@example.com",
      bouncedAt: INSIDE,
      bounceType: "Permanent",
    });
    await seedSend({
      recipient: "rank-bounces-q1a@example.com",
      bouncedAt: INSIDE,
      bounceType: "Permanent",
    });
    await seedSend({
      recipient: "rank-complaint-q1a@example.com",
      complainedAt: INSIDE,
    });
    const rows = await queryProblemAddresses({
      organizationId: ORG_A,
      ...WINDOW,
    });
    const complaintIndex = rows.findIndex(
      (r) => r.address === "rank-complaint-q1a@example.com"
    );
    const bounceIndex = rows.findIndex(
      (r) => r.address === "rank-bounces-q1a@example.com"
    );
    expect(complaintIndex).toBeGreaterThanOrEqual(0);
    expect(complaintIndex).toBeLessThan(bounceIndex);
  });

  it('Q1a groups "A@x.com" and "a@X.com" into one row', async () => {
    await seedSend({ recipient: "Group@X.com", bouncedAt: INSIDE });
    await seedSend({ recipient: "group@x.COM", bouncedAt: INSIDE });
    const rows = await queryProblemAddresses({
      organizationId: ORG_A,
      ...WINDOW,
    });
    const matches = rows.filter((r) => r.address === "group@x.com");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.bounces).toBe(2);
  });

  it("Q1a and Q1b never return a row from another organization", async () => {
    const before = await queryProblemAddressTotals({
      organizationId: ORG_A,
      ...WINDOW,
    });
    await seedSend({
      organizationId: ORG_B,
      recipient: "isolation-q1-b@example.com",
      complainedAt: INSIDE,
    });
    const rows = await queryProblemAddresses({
      organizationId: ORG_A,
      ...WINDOW,
    });
    expect(
      rows.find((r) => r.address === "isolation-q1-b@example.com")
    ).toBeUndefined();
    const after = await queryProblemAddressTotals({
      organizationId: ORG_A,
      ...WINDOW,
    });
    // The org B complaint must leave ORG_A's totals exactly where they were.
    expect(after).toEqual(before);
  });
});

describe("Q1b window totals", () => {
  it("Q1b bounces equal the bounced total of queryMessageMetricBuckets for the same org and window", async () => {
    await seedSend({
      recipient: "reconcile-q1b@example.com",
      bouncedAt: INSIDE,
      bounceType: "Transient",
    });
    const totals = await queryProblemAddressTotals({
      organizationId: ORG_A,
      ...WINDOW,
    });
    const buckets = await queryMessageMetricBuckets({
      organizationId: ORG_A,
      startTime: START,
      endTime: END,
      timezone: "UTC",
      dimensions: ["period"],
      granularity: "daily",
    });
    const analyticsBounced = buckets.reduce((sum, row) => sum + row.bounced, 0);
    expect(totals.bounces).toBe(analyticsBounced);
  });

  it("Q1b counts a suppressed-only row in suppressed and not in bounces", async () => {
    await seedSend({
      recipient: "suppressed-only-q1b@example.com",
      suppressedAt: INSIDE,
    });
    const rows = await queryProblemAddresses({
      organizationId: ORG_A,
      ...WINDOW,
    });
    const row = rows.find(
      (r) => r.address === "suppressed-only-q1b@example.com"
    );
    expect(row?.suppressed).toBe(1);
    expect(row?.bounces).toBe(0);
  });
});

describe("Q3 problem sends for one address", () => {
  it("Q3 returns sends with null aws_account_id", async () => {
    const recipient = "null-account-q3@example.com";
    await seedSend({ recipient, bouncedAt: INSIDE });
    const rows = await queryAddressProblemSends({
      organizationId: ORG_A,
      address: recipient,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.awsAccountId).toBeNull();
  });

  it("Q3 limits to 26 rows so the caller can detect more", async () => {
    const recipient = "many-q3@example.com";
    for (let i = 0; i < PROBLEM_SEND_QUERY_LIMIT + 2; i += 1) {
      await seedSend({ recipient, bouncedAt: INSIDE });
    }
    const rows = await queryAddressProblemSends({
      organizationId: ORG_A,
      address: recipient,
    });
    expect(rows).toHaveLength(PROBLEM_SEND_QUERY_LIMIT);
  });

  it("Q3 template, broadcast and workflow names are null when the joined row belongs to another organization", async () => {
    const recipient = "foreign-join-q3@example.com";
    await seedSend({
      recipient,
      bouncedAt: INSIDE,
      emailTemplateId: TEMPLATE_B,
      batchSendId: BATCH_B,
    });
    const rows = await queryAddressProblemSends({
      organizationId: ORG_A,
      address: recipient,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.templateName).toBeNull();
    expect(rows[0]?.broadcastName).toBeNull();
    expect(rows[0]?.workflowName).toBeNull();
  });
});
