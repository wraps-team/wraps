import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  checkSegmentUsable,
  countBroadcastRecipients,
  getSampleRecipientsWithProperties,
  listBroadcastRecipients,
} from "../repositories/broadcasts";
import {
  awsAccount,
  batchSend,
  contact,
  messageSend,
  organization,
  segment,
} from "../schema";

const orgId = `repo-broadcast-test-org-${crypto.randomUUID().slice(0, 8)}`;

const contactA = {
  id: `repo-bc-contact-a-${crypto.randomUUID().slice(0, 8)}`,
  organizationId: orgId,
  email: "a@example.com",
  emailHash: `hash-a-${crypto.randomUUID().slice(0, 8)}`,
  emailStatus: "active" as const,
  jobTitle: "Head of Growth",
  properties: { companyName: "Acme", dashboardUrl: "https://acme.example.com" },
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const contactB = {
  id: `repo-bc-contact-b-${crypto.randomUUID().slice(0, 8)}`,
  organizationId: orgId,
  email: "b@example.com",
  emailHash: `hash-b-${crypto.randomUUID().slice(0, 8)}`,
  emailStatus: "active" as const,
  properties: {},
  createdAt: new Date("2026-01-02"),
  updatedAt: new Date("2026-01-02"),
};

describe("Repository: getSampleRecipientsWithProperties", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values({
        id: orgId,
        name: "Broadcast Repo Test Org",
        slug: `bc-repo-test-${orgId.slice(-8)}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db.insert(contact).values([contactA, contactB]).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(contact).where(eq(contact.organizationId, orgId));
    await db.delete(organization).where(eq(organization.id, orgId));
  });

  it("includes the properties field for each contact", async () => {
    const { contacts } = await getSampleRecipientsWithProperties(
      orgId,
      "email"
    );

    expect(contacts.length).toBeGreaterThanOrEqual(2);

    const contactWithProps = contacts.find((c) => c.id === contactA.id);
    expect(contactWithProps).toBeDefined();
    expect(contactWithProps?.properties).toEqual({
      companyName: "Acme",
      dashboardUrl: "https://acme.example.com",
    });
  });

  it("includes jobTitle, which broadcast variable mappings can target", async () => {
    const { contacts } = await getSampleRecipientsWithProperties(
      orgId,
      "email"
    );

    const contactWithJobTitle = contacts.find((c) => c.id === contactA.id);
    expect(contactWithJobTitle?.jobTitle).toBe("Head of Growth");
    expect(contacts.find((c) => c.id === contactB.id)?.jobTitle).toBeNull();
  });

  it("returns contacts with empty properties as empty object", async () => {
    const { contacts } = await getSampleRecipientsWithProperties(
      orgId,
      "email"
    );

    const contactWithoutProps = contacts.find((c) => c.id === contactB.id);
    expect(contactWithoutProps).toBeDefined();
    expect(contactWithoutProps?.properties).toEqual({});
  });

  it("returns totalCount matching the full audience size", async () => {
    const { totalCount } = await getSampleRecipientsWithProperties(
      orgId,
      "email"
    );

    expect(totalCount).toBe(2);
  });

  it("respects the limit parameter", async () => {
    const { contacts } = await getSampleRecipientsWithProperties(
      orgId,
      "email",
      undefined,
      1
    );

    expect(contacts).toHaveLength(1);
  });
});

/**
 * A segment whose condition compiles to no SQL must target nobody. Before this
 * was enforced, the segment clause was simply omitted and the broadcast widened
 * to every contact in the organization — the failure is silent and the blast
 * radius is a full-list send, so it is pinned against a real query.
 */
describe("Repository: countBroadcastRecipients fails closed on bad segments", () => {
  const badOrgId = `repo-bc-failclosed-org-${crypto.randomUUID().slice(0, 8)}`;
  const unknownFieldSegmentId = `repo-bc-seg-unknown-${crypto.randomUUID().slice(0, 8)}`;
  const badBucketSegmentId = `repo-bc-seg-bucket-${crypto.randomUUID().slice(0, 8)}`;
  const goodSegmentId = `repo-bc-seg-good-${crypto.randomUUID().slice(0, 8)}`;
  const goodSegmentIdB = `repo-bc-seg-good-b-${crypto.randomUUID().slice(0, 8)}`;

  const partitionCondition = (index: number) => ({
    logic: "AND" as const,
    groups: [
      {
        filters: [
          {
            field: "bucket",
            operator: "inBucket" as const,
            value: { buckets: 2, index },
          },
        ],
      },
    ],
  });

  const makeContact = (label: string) => ({
    id: `repo-bc-fc-${label}-${crypto.randomUUID().slice(0, 8)}`,
    organizationId: badOrgId,
    email: `${label}@fail-closed.example.com`,
    emailHash: `fc-hash-${label}-${crypto.randomUUID().slice(0, 8)}`,
    emailStatus: "active" as const,
    properties: {},
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  });

  beforeAll(async () => {
    await db
      .insert(organization)
      .values({
        id: badOrgId,
        name: "Fail Closed Test Org",
        slug: `bc-fc-test-${badOrgId.slice(-8)}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(contact)
      .values([makeContact("x"), makeContact("y"), makeContact("z")])
      .onConflictDoNothing();

    await db
      .insert(segment)
      .values([
        {
          // Models a rollback: a stored operator/field this build cannot compile.
          id: unknownFieldSegmentId,
          organizationId: badOrgId,
          name: "Unknown field",
          condition: {
            logic: "AND",
            groups: [
              {
                filters: [
                  {
                    field: "fieldFromANewerRelease",
                    operator: "equals",
                    value: "x",
                  },
                ],
              },
            ],
          },
        },
        {
          id: badBucketSegmentId,
          organizationId: badOrgId,
          name: "Out of range partition",
          condition: {
            logic: "AND",
            groups: [
              {
                filters: [
                  {
                    field: "bucket",
                    operator: "inBucket",
                    value: { buckets: 6, index: 99 },
                  },
                ],
              },
            ],
          },
        },
        {
          id: goodSegmentId,
          organizationId: badOrgId,
          name: "Valid partition 1 of 2",
          condition: partitionCondition(1),
        },
        {
          id: goodSegmentIdB,
          organizationId: badOrgId,
          name: "Valid partition 2 of 2",
          condition: partitionCondition(2),
        },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(segment).where(eq(segment.organizationId, badOrgId));
    await db.delete(contact).where(eq(contact.organizationId, badOrgId));
    await db.delete(organization).where(eq(organization.id, badOrgId));
  });

  it("counts the whole audience when no segment filter is applied", async () => {
    // Guards the test itself: proves 0 below is the segment clause working,
    // not an empty fixture.
    expect(await countBroadcastRecipients(badOrgId, "email")).toBe(3);
  });

  it("counts nobody when the segment condition uses an unknown field", async () => {
    const count = await countBroadcastRecipients(badOrgId, "email", {
      audienceType: "segment",
      segmentId: unknownFieldSegmentId,
    });

    expect(count).toBe(0);
  });

  it("counts nobody when a partition filter is out of range", async () => {
    const count = await countBroadcastRecipients(badOrgId, "email", {
      audienceType: "segment",
      segmentId: badBucketSegmentId,
    });

    expect(count).toBe(0);
  });

  it("counts nobody when the segment has been deleted", async () => {
    const count = await countBroadcastRecipients(badOrgId, "email", {
      audienceType: "segment",
      segmentId: `repo-bc-seg-missing-${crypto.randomUUID().slice(0, 8)}`,
    });

    expect(count).toBe(0);
  });

  it("still counts valid partition segments, which tile the audience", async () => {
    // Asserting a per-partition size would be flaky — with 3 contacts across 2
    // buckets they can all hash into one. The invariant that holds regardless
    // of distribution is that the partitions sum to the whole audience.
    const [first, second] = await Promise.all([
      countBroadcastRecipients(badOrgId, "email", {
        audienceType: "segment",
        segmentId: goodSegmentId,
      }),
      countBroadcastRecipients(badOrgId, "email", {
        audienceType: "segment",
        segmentId: goodSegmentIdB,
      }),
    ]);

    expect(first + second).toBe(3);
  });

  it("reports why an unusable segment matched nobody", async () => {
    expect(await checkSegmentUsable(badOrgId, unknownFieldSegmentId)).toBe(
      "no-valid-filters"
    );
    expect(await checkSegmentUsable(badOrgId, badBucketSegmentId)).toBe(
      "no-valid-filters"
    );
    expect(await checkSegmentUsable(badOrgId, goodSegmentId)).toBe("ok");
    expect(await checkSegmentUsable(badOrgId, "no-such-segment")).toBe(
      "missing"
    );
  });

  it("does not treat another org's segment as usable", async () => {
    expect(await checkSegmentUsable(orgId, goodSegmentId)).toBe("missing");

    const count = await countBroadcastRecipients(orgId, "email", {
      audienceType: "segment",
      segmentId: goodSegmentId,
    });

    expect(count).toBe(0);
  });
});

describe("Repository: listBroadcastRecipients", () => {
  const recipOrgId = `repo-recip-org-${crypto.randomUUID().slice(0, 8)}`;
  const crossOrgId = `repo-recip-crossorg-${crypto.randomUUID().slice(0, 8)}`;
  const recipAwsAccountId = `repo-recip-aws-${crypto.randomUUID().slice(0, 8)}`;
  const crossAwsAccountId = `repo-recip-cross-aws-${crypto.randomUUID().slice(0, 8)}`;
  const recipBatchId = `repo-recip-batch-${crypto.randomUUID().slice(0, 8)}`;

  const failed1Id = `repo-recip-msg-failed1-${crypto.randomUUID().slice(0, 8)}`;
  const failed2Id = `repo-recip-msg-failed2-${crypto.randomUUID().slice(0, 8)}`;
  const sent1Id = `repo-recip-msg-sent1-${crypto.randomUUID().slice(0, 8)}`;
  const sent2Id = `repo-recip-msg-sent2-${crypto.randomUUID().slice(0, 8)}`;
  const sent3Id = `repo-recip-msg-sent3-${crypto.randomUUID().slice(0, 8)}`;
  const crossOrgRowId = `repo-recip-msg-crossorg-${crypto.randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    await db
      .insert(organization)
      .values([
        {
          id: recipOrgId,
          name: "Recipients Repo Test Org",
          slug: `recip-repo-test-${recipOrgId.slice(-8)}`,
          createdAt: new Date(),
        },
        {
          id: crossOrgId,
          name: "Recipients Repo Cross Org",
          slug: `recip-repo-cross-${crossOrgId.slice(-8)}`,
          createdAt: new Date(),
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(awsAccount)
      .values([
        {
          id: recipAwsAccountId,
          organizationId: recipOrgId,
          name: "Recip Test AWS Account",
          accountId: "111111111111",
          region: "us-east-1",
          roleArn: "arn:aws:iam::111111111111:role/recip-test-role",
          externalId: `recip-ext-id-${recipOrgId.slice(-8)}`,
        },
        {
          id: crossAwsAccountId,
          organizationId: crossOrgId,
          name: "Recip Cross Test AWS Account",
          accountId: "222222222222",
          region: "us-east-1",
          roleArn: "arn:aws:iam::222222222222:role/recip-cross-test-role",
          externalId: `recip-cross-ext-id-${crossOrgId.slice(-8)}`,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(batchSend)
      .values({
        id: recipBatchId,
        organizationId: recipOrgId,
        channel: "email",
        status: "completed",
      })
      .onConflictDoNothing();

    const baseCreatedAt = new Date("2026-02-01T00:00:00Z");
    const at = (offsetSeconds: number) =>
      new Date(baseCreatedAt.getTime() + offsetSeconds * 1000);

    await db
      .insert(messageSend)
      .values([
        {
          id: failed1Id,
          organizationId: recipOrgId,
          awsAccountId: recipAwsAccountId,
          channel: "email",
          sourceType: "batch",
          batchSendId: recipBatchId,
          recipient: "failed1@example.com",
          status: "failed",
          error: "Message rejected by recipient server",
          bounceType: "Permanent",
          bounceSubType: "General",
          createdAt: at(1),
        },
        {
          id: failed2Id,
          organizationId: recipOrgId,
          awsAccountId: recipAwsAccountId,
          channel: "email",
          sourceType: "batch",
          batchSendId: recipBatchId,
          recipient: "failed2@example.com",
          status: "failed",
          error: "Mailbox full",
          bounceType: "Transient",
          bounceSubType: "MailboxFull",
          createdAt: at(2),
        },
        {
          id: sent1Id,
          organizationId: recipOrgId,
          awsAccountId: recipAwsAccountId,
          channel: "email",
          sourceType: "batch",
          batchSendId: recipBatchId,
          recipient: "sent1@example.com",
          status: "sent",
          createdAt: at(3),
        },
        {
          id: sent2Id,
          organizationId: recipOrgId,
          awsAccountId: recipAwsAccountId,
          channel: "email",
          sourceType: "batch",
          batchSendId: recipBatchId,
          recipient: "sent2@example.com",
          status: "sent",
          createdAt: at(4),
        },
        {
          id: sent3Id,
          organizationId: recipOrgId,
          awsAccountId: recipAwsAccountId,
          channel: "email",
          sourceType: "batch",
          batchSendId: recipBatchId,
          recipient: "sent3@example.com",
          status: "sent",
          createdAt: at(5),
        },
        // Same batchSendId, DIFFERENT organizationId — the IDOR guard case.
        {
          id: crossOrgRowId,
          organizationId: crossOrgId,
          awsAccountId: crossAwsAccountId,
          channel: "email",
          sourceType: "batch",
          batchSendId: recipBatchId,
          recipient: "attacker-visible@example.com",
          status: "failed",
          error: "Should never be visible to recipOrgId",
          createdAt: at(6),
        },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db
      .delete(messageSend)
      .where(eq(messageSend.batchSendId, recipBatchId));
    await db.delete(batchSend).where(eq(batchSend.id, recipBatchId));
    await db
      .delete(awsAccount)
      .where(eq(awsAccount.organizationId, recipOrgId));
    await db
      .delete(awsAccount)
      .where(eq(awsAccount.organizationId, crossOrgId));
    await db.delete(organization).where(eq(organization.id, recipOrgId));
    await db.delete(organization).where(eq(organization.id, crossOrgId));
  });

  it("filters to failures", async () => {
    const { rows, total } = await listBroadcastRecipients(
      recipBatchId,
      recipOrgId,
      { status: "failed" }
    );

    expect(total).toBe(2);
    const recipients = rows.map((r) => r.recipient).sort();
    expect(recipients).toEqual(["failed1@example.com", "failed2@example.com"]);
  });

  it("returns the error and bounce fields with their exact seeded values", async () => {
    const { rows } = await listBroadcastRecipients(recipBatchId, recipOrgId, {
      status: "failed",
    });

    const row = rows.find((r) => r.recipient === "failed1@example.com");
    expect(row).toBeDefined();
    expect(row?.error).toBe("Message rejected by recipient server");
    expect(row?.bounceType).toBe("Permanent");
    expect(row?.bounceSubType).toBe("General");
  });

  it("never returns another org's row for the same batchSendId (IDOR guard)", async () => {
    const { rows, total } = await listBroadcastRecipients(
      recipBatchId,
      recipOrgId
    );

    expect(total).toBe(5);
    expect(rows.some((r) => r.id === crossOrgRowId)).toBe(false);
    expect(
      rows.some((r) => r.recipient === "attacker-visible@example.com")
    ).toBe(false);

    // Confirm the cross-org row really was inserted under the other org, so a
    // 0-row result above proves scoping, not a seeding mistake.
    const crossOrgSeeded = await db.query.messageSend.findFirst({
      where: (fields, { eq: eqOp }) => eqOp(fields.id, crossOrgRowId),
    });
    expect(crossOrgSeeded?.organizationId).toBe(crossOrgId);
  });

  it("paginates with limit/offset and a stable total", async () => {
    const firstPage = await listBroadcastRecipients(recipBatchId, recipOrgId, {
      limit: 2,
      offset: 0,
    });
    const secondPage = await listBroadcastRecipients(recipBatchId, recipOrgId, {
      limit: 2,
      offset: 2,
    });

    expect(secondPage.rows).toHaveLength(2);
    expect(secondPage.total).toBe(5);

    const firstPageIds = new Set(firstPage.rows.map((r) => r.id));
    const secondPageIds = secondPage.rows.map((r) => r.id);
    for (const id of secondPageIds) {
      expect(firstPageIds.has(id)).toBe(false);
    }
  });

  it("returns everything for the batch when unfiltered", async () => {
    const { rows, total } = await listBroadcastRecipients(
      recipBatchId,
      recipOrgId
    );

    expect(total).toBe(5);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.recipient).sort()).toEqual(
      [
        "failed1@example.com",
        "failed2@example.com",
        "sent1@example.com",
        "sent2@example.com",
        "sent3@example.com",
      ].sort()
    );
  });
});
