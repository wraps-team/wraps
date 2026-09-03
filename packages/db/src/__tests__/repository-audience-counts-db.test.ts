/**
 * The count a surface shows must be the count that sends.
 *
 * Before this, `/segments` and `/topics` (and the broadcast audience picker
 * they feed) counted rows that `countBroadcastRecipients` would never mail: a
 * six-month-stale `segment.member_count`, and topic subscriptions with no join
 * to `contact` at all — so a bounced, complained, suppressed or globally
 * unsubscribed subscriber was still counted, and a contact with no email
 * address was counted too.
 *
 * Every assertion here is the same shape: the number the picker renders,
 * compared against `countBroadcastRecipients` for that exact audience. Nothing
 * asserted a displayed count against the send path before (audit F20), which is
 * why F3/F4/F5 all survived two waves of broadcast fixes.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  countBroadcastRecipients,
  countRecipientsBySegment,
  countTopicAudience,
  listSegmentsForBroadcast,
  listTopicsWithSubscriberCounts,
  previewConditionAudience,
} from "../repositories/broadcasts";
import { contact, contactTopic, organization, segment, topic } from "../schema";

const TEST_PREFIX = `audience-counts-${crypto.randomUUID().slice(0, 8)}`;
const orgId = `${TEST_PREFIX}-org`;
const topicId = `${TEST_PREFIX}-topic`;
const segmentId = `${TEST_PREFIX}-segment`;
const brokenSegmentId = `${TEST_PREFIX}-segment-broken`;

const makeContact = (
  suffix: string,
  overrides: Partial<typeof contact.$inferInsert>
) => ({
  id: `${TEST_PREFIX}-${suffix}`,
  organizationId: orgId,
  email: `${TEST_PREFIX}-${suffix}@example.com`,
  emailHash: `${TEST_PREFIX}-${suffix}-hash`,
  emailStatus: "active" as const,
  properties: {},
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...overrides,
});

// Two of these can be emailed. The rest are the cohorts every count on the
// dashboard used to include and no send ever has.
const sendableA = makeContact("sendable-a", {});
const sendableB = makeContact("sendable-b", { emailStatus: null });
const unsubscribed = makeContact("unsubscribed", {
  emailStatus: "unsubscribed" as const,
});
const bounced = makeContact("bounced", { emailStatus: "bounced" as const });
// The two statuses this file's own docstring claimed to cover and did not.
// "suppressed" is the one that matters: it is written by processSuppression on
// every hard bounce SES refuses, and it is the value every hand-written list of
// statuses in this repo has managed to lose at least once.
const complained = makeContact("complained", {
  emailStatus: "complained" as const,
});
const suppressed = makeContact("suppressed", {
  emailStatus: "suppressed" as const,
});
const emailless = makeContact("emailless", {
  email: null,
  emailHash: null,
  emailStatus: null,
  phone: "+15550000000",
  smsStatus: "opted_in" as const,
});

// Matches every contact in the org: emails_sent defaults to 0 and is NOT NULL.
const matchAllCondition = {
  logic: "AND" as const,
  groups: [
    {
      filters: [
        {
          field: "emailsSent",
          operator: "greaterThanOrEqual" as const,
          value: 0,
        },
      ],
    },
  ],
};

// One good filter, one that cannot compile. The send path must refuse the whole
// condition rather than dropping the bad filter and widening the audience.
const partiallyBrokenCondition = {
  logic: "AND" as const,
  groups: [
    {
      filters: [
        {
          field: "emailsSent",
          operator: "greaterThanOrEqual" as const,
          value: 0,
        },
        { field: "status", operator: "inList" as const, value: "active" },
      ],
    },
  ],
};

beforeAll(async () => {
  await db
    .insert(organization)
    .values({
      id: orgId,
      name: "Audience Counts Test Org",
      slug: orgId,
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  await db
    .insert(contact)
    .values([
      sendableA,
      sendableB,
      unsubscribed,
      bounced,
      complained,
      suppressed,
      emailless,
    ])
    .onConflictDoNothing();

  await db
    .insert(topic)
    .values({
      id: topicId,
      organizationId: orgId,
      name: "Product Updates",
      slug: `${TEST_PREFIX}-product-updates`,
    })
    .onConflictDoNothing();

  await db
    .insert(contactTopic)
    .values([
      { contactId: sendableA.id, topicId, status: "subscribed" },
      { contactId: unsubscribed.id, topicId, status: "subscribed" },
      { contactId: bounced.id, topicId, status: "subscribed" },
      { contactId: complained.id, topicId, status: "subscribed" },
      { contactId: suppressed.id, topicId, status: "subscribed" },
      { contactId: emailless.id, topicId, status: "subscribed" },
      // Double opt-in leaves people here until they confirm. They are not
      // subscribers and they are not nothing.
      { contactId: sendableB.id, topicId, status: "pending" },
    ])
    .onConflictDoNothing();

  await db
    .insert(segment)
    .values([
      {
        id: segmentId,
        organizationId: orgId,
        name: "Everyone",
        condition: matchAllCondition,
        memberCount: 999, // deliberately stale: nothing may read this
        lastComputedAt: new Date("2026-02-10"),
      },
      {
        id: brokenSegmentId,
        organizationId: orgId,
        name: "Partially broken",
        condition: partiallyBrokenCondition,
        memberCount: 999,
        lastComputedAt: new Date("2026-02-10"),
      },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(contactTopic).where(eq(contactTopic.topicId, topicId));
  await db.delete(segment).where(eq(segment.organizationId, orgId));
  await db.delete(topic).where(eq(topic.organizationId, orgId));
  await db.delete(contact).where(eq(contact.organizationId, orgId));
  await db.delete(organization).where(eq(organization.id, orgId));
});

describe("segment counts equal what a broadcast to that segment would send", () => {
  it("the broadcast picker's number is the send-path number", async () => {
    const sendCount = await countBroadcastRecipients(orgId, "email", {
      audienceType: "segment",
      segmentId,
    });
    const picker = await listSegmentsForBroadcast(orgId);
    const row = picker.find((s) => s.id === segmentId);

    expect(sendCount).toBe(2);
    expect(row?.memberCount).toBe(sendCount);
  });

  it("ignores the stale cached member_count entirely", async () => {
    const picker = await listSegmentsForBroadcast(orgId);

    expect(picker.find((s) => s.id === segmentId)?.memberCount).not.toBe(999);
  });

  it("excludes unsubscribed, bounced, complained, suppressed and email-less contacts", async () => {
    const counts = await countRecipientsBySegment(orgId, "email", [segmentId]);

    // 7 contacts match the condition; 2 of them can be emailed.
    expect(counts.get(segmentId)).toBe(2);
  });

  it("fails closed on a segment whose filters do not all compile", async () => {
    const sendCount = await countBroadcastRecipients(orgId, "email", {
      audienceType: "segment",
      segmentId: brokenSegmentId,
    });
    const picker = await listSegmentsForBroadcast(orgId);

    expect(sendCount).toBe(0);
    expect(picker.find((s) => s.id === brokenSegmentId)?.memberCount).toBe(0);
  });

  it("returns 0 for a segment in another organization", async () => {
    const counts = await countRecipientsBySegment(`${orgId}-other`, "email", [
      segmentId,
    ]);

    expect(counts.get(segmentId)).toBe(0);
  });
});

describe("condition preview equals what a broadcast to the saved segment would send", () => {
  it("reports the sendable count, and the raw match count beside it", async () => {
    const preview = await previewConditionAudience(
      orgId,
      "email",
      matchAllCondition
    );
    const sendCount = await countBroadcastRecipients(orgId, "email", {
      audienceType: "segment",
      segmentId,
    });

    expect(preview?.sendable).toBe(sendCount);
    expect(preview?.matched).toBe(7);
  });

  it("samples only contacts that could actually receive the broadcast", async () => {
    const preview = await previewConditionAudience(
      orgId,
      "email",
      matchAllCondition
    );

    expect(preview?.sampleEmails).toHaveLength(2);
    expect(preview?.sampleEmails).toContain(sendableA.email);
    expect(preview?.sampleEmails).not.toContain(unsubscribed.email);
  });

  it("returns null when the condition does not compile in full", async () => {
    expect(
      await previewConditionAudience(orgId, "email", partiallyBrokenCondition)
    ).toBeNull();
  });
});

describe("topic counts equal what a broadcast to that topic would send", () => {
  it("the broadcast picker's number is the send-path number", async () => {
    const sendCount = await countBroadcastRecipients(orgId, "email", {
      audienceType: "topic",
      topicId,
    });
    const picker = await listTopicsWithSubscriberCounts(orgId);
    const row = picker.find((t) => t.id === topicId);

    // 6 subscribed rows, 1 of which is a sendable contact.
    expect(sendCount).toBe(1);
    expect(row?.subscriberCount).toBe(sendCount);
  });

  it("separates subscribed, pending and sendable", async () => {
    const counts = await countTopicAudience(orgId, [topicId]);
    const row = counts.get(topicId);

    expect(row).toEqual({
      subscribed: 6,
      pending: 1,
      unsubscribed: 0,
      sendable: 1,
    });
  });

  it("counts nothing for topics in another organization", async () => {
    const counts = await countTopicAudience(`${orgId}-other`, [topicId]);

    expect(counts.get(topicId)).toBeUndefined();
  });
});
