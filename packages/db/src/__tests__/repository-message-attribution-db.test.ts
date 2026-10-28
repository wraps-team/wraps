// DB-backed. NOT RUN in the drill-down worktree: apps/web/.env.test does not
// exist there yet. Written to the spec's section 8.1 and the namespaced-fixture
// convention (every id carries a per-file suffix).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  getMessageMetrics,
  MetricsQueryError,
  queryMessageAttributionRows,
  queryMessageMetricBuckets,
} from "../repositories/message-metrics";
import {
  awsAccount,
  batchSend,
  contact,
  messageSend,
  organization,
  template,
  workflow,
  workflowExecution,
} from "../schema";

const suffix = crypto.randomUUID().slice(0, 8);

const ORG = `attr-org-${suffix}`;
const OTHER_ORG = `attr-other-org-${suffix}`;
const ACCOUNT = `attr-acct-${suffix}`;
const OTHER_ACCOUNT = `attr-other-acct-${suffix}`;
const BROADCAST_1 = `attr-batch-1-${suffix}`;
const BROADCAST_2 = `attr-batch-2-${suffix}`;
const FOREIGN_BROADCAST = `attr-foreign-batch-${suffix}`;
const TEMPLATE_1 = `attr-tpl-1-${suffix}`;
const WORKFLOW_1 = `attr-wf-1-${suffix}`;
const EXEC_1 = `attr-exec-1-${suffix}`;
const EXEC_2 = `attr-exec-2-${suffix}`;
const EXEC_GONE = `attr-exec-gone-${suffix}`;
const CONTACT_1 = `attr-contact-1-${suffix}`;
const CONTACT_2 = `attr-contact-2-${suffix}`;
const CONTACT_3 = `attr-contact-3-${suffix}`;

const WINDOW_START = new Date("2026-10-01T00:00:00Z");
const WINDOW_END = new Date("2026-10-31T23:59:59Z");

let rowCounter = 0;
function rowId(): string {
  rowCounter += 1;
  return `attr-row-${suffix}-${rowCounter}`;
}

type SeedRow = {
  batchSendId?: string | null;
  workflowExecutionId?: string | null;
  emailTemplateId?: string | null;
  organizationId?: string;
  sourceType: "transactional" | "batch" | "campaign" | "workflow";
  status:
    | "queued"
    | "sent"
    | "delivered"
    | "bounced"
    | "complained"
    | "suppressed"
    | "failed";
  sentAt: Date | null;
  from?: string | null;
  bouncedAt?: Date;
  bounceType?: string;
  bounceSubType?: string;
  complainedAt?: Date;
  suppressedAt?: Date;
};

const seeded: Array<SeedRow & { id: string }> = [];

function seed(row: SeedRow): string {
  const id = rowId();
  seeded.push({ id, ...row });
  return id;
}

async function insertSeeded() {
  await db.insert(messageSend).values(
    seeded.map((row) => ({
      id: row.id,
      organizationId: row.organizationId ?? ORG,
      awsAccountId: ACCOUNT,
      channel: "email" as const,
      recipient: "reader@example.com",
      sourceType: row.sourceType,
      status: row.status,
      sentAt: row.sentAt,
      from: row.from ?? null,
      batchSendId: row.batchSendId ?? null,
      workflowExecutionId: row.workflowExecutionId ?? null,
      emailTemplateId: row.emailTemplateId ?? null,
      bouncedAt: row.bouncedAt ?? null,
      bounceType: row.bounceType ?? null,
      bounceSubType: row.bounceSubType ?? null,
      complainedAt: row.complainedAt ?? null,
      suppressedAt: row.suppressedAt ?? null,
    }))
  );
}

// Keys in the response are the broadcast ids, or null for "no broadcast".
function byKey<T extends { key: string | null }>(rows: T[]) {
  return new Map(rows.map((r) => [r.key, r]));
}

const base = { organizationId: ORG, sourceType: "batch" as const };

beforeAll(async () => {
  await db
    .insert(organization)
    .values([
      {
        id: ORG,
        name: "Attribution Org",
        slug: `attr-org-${suffix}`,
        createdAt: new Date(),
      },
      {
        id: OTHER_ORG,
        name: "Attribution Other Org",
        slug: `attr-other-org-${suffix}`,
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
        name: "Attribution Acct",
        accountId: "222222222222",
        region: "us-east-1",
        roleArn: "arn:aws:iam::222222222222:role/wraps",
        externalId: `ext-${suffix}`,
      },
      {
        id: OTHER_ACCOUNT,
        organizationId: OTHER_ORG,
        name: "Attribution Other Acct",
        accountId: "333333333333",
        region: "us-east-1",
        roleArn: "arn:aws:iam::333333333333:role/wraps",
        externalId: `ext-other-${suffix}`,
      },
    ])
    .onConflictDoNothing();

  await db.insert(batchSend).values([
    {
      id: BROADCAST_1,
      organizationId: ORG,
      name: "October launch",
      awsAccountId: ACCOUNT,
      from: "news@a.example",
    },
    {
      id: BROADCAST_2,
      organizationId: ORG,
      name: null,
      awsAccountId: ACCOUNT,
      from: "news@a.example",
    },
    {
      id: FOREIGN_BROADCAST,
      organizationId: OTHER_ORG,
      name: "Other org's secret name",
      awsAccountId: OTHER_ACCOUNT,
      from: "news@b.example",
    },
  ]);

  await db.insert(template).values({
    id: TEMPLATE_1,
    organizationId: ORG,
    name: "Welcome",
    channel: "email",
    content: {},
  });

  await db.insert(contact).values([
    { id: CONTACT_1, organizationId: ORG },
    { id: CONTACT_2, organizationId: ORG },
    { id: CONTACT_3, organizationId: ORG },
  ]);

  await db.insert(workflow).values({
    id: WORKFLOW_1,
    organizationId: ORG,
    name: "Onboarding",
  });

  await db.insert(workflowExecution).values([
    {
      id: EXEC_1,
      organizationId: ORG,
      workflowId: WORKFLOW_1,
      contactId: CONTACT_1,
    },
    {
      id: EXEC_2,
      organizationId: ORG,
      workflowId: WORKFLOW_1,
      contactId: CONTACT_2,
    },
    {
      id: EXEC_GONE,
      organizationId: ORG,
      workflowId: WORKFLOW_1,
      contactId: CONTACT_3,
    },
  ]);

  // Broadcast 1: 3 sent, 1 permanent bounce, 1 complaint.
  seed({
    ...base,
    batchSendId: BROADCAST_1,
    status: "sent",
    sentAt: new Date("2026-10-05T10:00:00Z"),
    from: "News <news@a.example>",
  });
  seed({
    ...base,
    batchSendId: BROADCAST_1,
    status: "sent",
    sentAt: new Date("2026-10-05T11:00:00Z"),
    from: "news@a.example",
  });
  seed({
    ...base,
    batchSendId: BROADCAST_1,
    status: "bounced",
    sentAt: new Date("2026-10-05T12:00:00Z"),
    bouncedAt: new Date("2026-10-05T12:05:00Z"),
    bounceType: "Permanent",
    bounceSubType: "General",
    from: "news@a.example",
  });
  seed({
    ...base,
    batchSendId: BROADCAST_1,
    status: "complained",
    sentAt: new Date("2026-10-05T13:00:00Z"),
    complainedAt: new Date("2026-10-05T13:30:00Z"),
    from: "news@a.example",
  });

  // Broadcast 2 has a null name.
  seed({
    ...base,
    batchSendId: BROADCAST_2,
    status: "sent",
    sentAt: new Date("2026-10-06T10:00:00Z"),
    from: "news@a.example",
  });

  // Workflow sends across two executions of one workflow, plus one with its
  // execution later deleted.
  seed({
    ...base,
    sourceType: "workflow",
    workflowExecutionId: EXEC_1,
    emailTemplateId: TEMPLATE_1,
    status: "sent",
    sentAt: new Date("2026-10-07T10:00:00Z"),
    from: "hello@a.example",
  });
  seed({
    ...base,
    sourceType: "workflow",
    workflowExecutionId: EXEC_2,
    emailTemplateId: TEMPLATE_1,
    status: "sent",
    sentAt: new Date("2026-10-07T11:00:00Z"),
    from: "hello@a.example",
  });
  seed({
    ...base,
    sourceType: "workflow",
    workflowExecutionId: EXEC_GONE,
    emailTemplateId: TEMPLATE_1,
    status: "bounced",
    sentAt: new Date("2026-10-07T12:00:00Z"),
    bouncedAt: new Date("2026-10-07T12:05:00Z"),
    bounceType: "Transient",
    from: "hello@a.example",
  });

  // SDK ("transactional") send: no batch, no workflow, no template.
  seed({
    organizationId: ORG,
    sourceType: "transactional",
    status: "sent",
    sentAt: new Date("2026-10-08T10:00:00Z"),
    from: "Wraps <api@a.example>",
  });

  // Suppressed-subtype: stored as a suppression, never a bounce (spec V3).
  seed({
    ...base,
    batchSendId: BROADCAST_2,
    status: "suppressed",
    sentAt: new Date("2026-10-09T10:00:00Z"),
    suppressedAt: new Date("2026-10-09T10:01:00Z"),
    bounceSubType: "Suppressed",
    from: "news@a.example",
  });

  // Failed and unsent rows: neither counts toward sent.
  seed({
    ...base,
    batchSendId: BROADCAST_1,
    status: "failed",
    sentAt: new Date("2026-10-10T10:00:00Z"),
    from: "news@a.example",
  });
  seed({
    ...base,
    batchSendId: BROADCAST_1,
    status: "queued",
    sentAt: null,
    from: "news@a.example",
  });

  // A row in another org that points at this org's broadcast id must never
  // count here. Org scoping is what keeps it out.
  seed({
    organizationId: OTHER_ORG,
    sourceType: "batch",
    status: "sent",
    sentAt: new Date("2026-10-11T10:00:00Z"),
    batchSendId: BROADCAST_1,
  });

  // A row of this org pointing at another org's broadcast. Counts stay, label is null.
  seed({
    ...base,
    batchSendId: FOREIGN_BROADCAST,
    status: "sent",
    sentAt: new Date("2026-10-12T10:00:00Z"),
    from: "news@b.example",
  });

  // Display-form and bare from addresses for the same mailbox.
  seed({
    ...base,
    status: "sent",
    sentAt: new Date("2026-10-13T10:00:00Z"),
    from: "Wraps <Hello@X.com>",
  });
  seed({
    ...base,
    status: "sent",
    sentAt: new Date("2026-10-13T11:00:00Z"),
    from: "hello@x.com",
  });

  // DST-day send: local Nov 1 23:30 in New York (EST) is 2026-11-02T04:30Z.
  seed({
    ...base,
    batchSendId: BROADCAST_2,
    status: "sent",
    sentAt: new Date("2026-11-02T04:30:00Z"),
  });

  await insertSeeded();
});

afterAll(async () => {
  await db.delete(messageSend).where(eq(messageSend.organizationId, ORG));
  await db.delete(messageSend).where(eq(messageSend.organizationId, OTHER_ORG));
  await db
    .delete(workflowExecution)
    .where(eq(workflowExecution.organizationId, ORG));
  await db.delete(workflow).where(eq(workflow.organizationId, ORG));
  await db.delete(contact).where(eq(contact.organizationId, ORG));
  await db.delete(template).where(eq(template.organizationId, ORG));
  await db.delete(batchSend).where(eq(batchSend.organizationId, ORG));
  await db.delete(batchSend).where(eq(batchSend.organizationId, OTHER_ORG));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, ORG));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, OTHER_ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(organization).where(eq(organization.id, OTHER_ORG));
});

const range = {
  organizationId: ORG,
  startTime: WINDOW_START,
  endTime: WINDOW_END,
  timezone: "UTC",
};

describe("queryMessageAttributionRows", () => {
  it("groups broadcast sends by batch_send_id and puts unattributed sends in the null group", async () => {
    const rows = await queryMessageAttributionRows({
      ...range,
      by: "broadcast",
    });
    const groups = byKey(rows);

    // Four non-failed dated sends: two sent, one bounced, one complained.
    expect(groups.get(BROADCAST_1)).toMatchObject({
      sent: 4,
      bounced: 1,
      bouncedPermanent: 1,
      complained: 1,
    });
    expect(groups.get(BROADCAST_2)).toMatchObject({ sent: 2, suppressed: 1 });
    // Null group: 3 workflow sends (incl. the deleted-execution one, which the
    // spec keeps under null too) + 1 SDK send + 2 bare/display-form sends from
    // hello@x.com. The other-org row and the foreign-broadcast row are not here.
    expect(groups.get(null)?.sent).toBe(6);
    expect(groups.get(FOREIGN_BROADCAST)?.label).toBeNull();
  });

  it("groups workflow sends by workflow id, not by execution", async () => {
    const rows = await queryMessageAttributionRows({
      ...range,
      by: "workflow",
    });
    const groups = byKey(rows);
    // Two executions of WORKFLOW_1 (one sent each) plus the bounced send from
    // the third execution, which is still attached at this point in the file.
    expect(groups.get(WORKFLOW_1)).toMatchObject({
      label: "Onboarding",
      sent: 3,
    });
    expect(rows.filter((r) => r.key === WORKFLOW_1)).toHaveLength(1);
  });

  it("keeps a send whose execution was deleted in the null workflow group", async () => {
    await db
      .delete(workflowExecution)
      .where(eq(workflowExecution.id, EXEC_GONE));
    const rows = await queryMessageAttributionRows({
      ...range,
      by: "workflow",
    });
    const nullGroup = rows.find((r) => r.key === null);
    // Null workflow group = broadcast + SDK sends (the broadcast bounce is 1)
    // plus the bounced send whose execution was just deleted (1). Not dropped.
    expect(nullGroup?.bounced).toBe(2);
  });

  it("counts a Suppressed-subtype bounce as suppressed and never as bounced", async () => {
    const rows = await queryMessageAttributionRows({
      ...range,
      by: "broadcast",
    });
    const group = byKey(rows).get(BROADCAST_2);
    expect(group?.suppressed).toBe(1);
    expect(group?.bounced).toBe(0);
  });

  it("excludes failed and unsent rows from sent", async () => {
    const rows = await queryMessageAttributionRows({
      ...range,
      by: "broadcast",
    });
    // BROADCAST_1: 2 sent + 1 bounced + 1 complained = 4. The failed row is
    // excluded by status, and the queued row (no sent_at) by the window WHERE.
    expect(byKey(rows).get(BROADCAST_1)?.sent).toBe(4);
  });

  it("group rows sum to the same counts as the existing aggregate", async () => {
    const [rows, metrics] = await Promise.all([
      queryMessageAttributionRows({ ...range, by: "template" }),
      getMessageMetrics({ ...range }),
    ]);
    const sum = (field: "sent" | "bounced" | "complained" | "suppressed") =>
      rows.reduce((acc, r) => acc + r[field], 0);
    expect(sum("sent")).toBe(metrics.totals.sent);
    expect(sum("bounced")).toBe(metrics.totals.bounced);
    expect(sum("complained")).toBe(metrics.totals.complained);
    expect(sum("suppressed")).toBe(metrics.totals.suppressed);
  });

  it("does not label a group with another organization's broadcast name", async () => {
    const rows = await queryMessageAttributionRows({
      ...range,
      by: "broadcast",
    });
    const group = byKey(rows).get(FOREIGN_BROADCAST);
    expect(group?.label).toBeNull();
    expect(group?.sent).toBe(1);
  });

  it("normalizes a display-form from address to the lowercase bare address", async () => {
    const rows = await queryMessageAttributionRows({ ...range, by: "from" });
    const group = byKey(rows).get("hello@x.com");
    expect(group?.sent).toBe(2);
    expect(group?.label).toBe("hello@x.com");
  });

  it("day filter selects the same rows as the daily period bucket", async () => {
    const day = "2026-10-05";
    const [attributed, buckets] = await Promise.all([
      queryMessageAttributionRows({ ...range, by: "broadcast", day }),
      queryMessageMetricBuckets({ ...range, dimensions: ["period"] }),
    ]);
    const bucket = buckets.find((b) => b.period === day);
    const attributedSent = attributed.reduce((acc, r) => acc + r.sent, 0);
    const attributedBounced = attributed.reduce((acc, r) => acc + r.bounced, 0);
    expect(attributedSent).toBe(bucket?.sent ?? 0);
    expect(attributedBounced).toBe(bucket?.bounced ?? 0);
  });

  it("day filter counts a send at 23:30 local on a DST change day under that local day", async () => {
    const window = {
      ...range,
      startTime: new Date("2026-10-25T00:00:00Z"),
      endTime: new Date("2026-11-05T00:00:00Z"),
      timezone: "America/New_York",
    };
    const onDay = await queryMessageAttributionRows({
      ...window,
      by: "broadcast",
      day: "2026-11-01",
    });
    const nextDay = await queryMessageAttributionRows({
      ...window,
      by: "broadcast",
      day: "2026-11-02",
    });
    expect(byKey(onDay).get(BROADCAST_2)?.sent).toBe(1);
    expect(byKey(nextDay).get(BROADCAST_2)?.sent ?? 0).toBe(0);
  });

  it("groups template sends by template id, with no template in the null group", async () => {
    const rows = await queryMessageAttributionRows({
      ...range,
      by: "template",
    });
    const groups = byKey(rows);
    expect(groups.get(TEMPLATE_1)?.label).toBe("Welcome");
    expect(groups.get(null)).toBeDefined();
  });

  it("throws row_cap_exceeded when groups exceed maxRows", async () => {
    await expect(
      queryMessageAttributionRows({ ...range, by: "broadcast", maxRows: 2 })
    ).rejects.toMatchObject({ code: "row_cap_exceeded" });
    await expect(
      queryMessageAttributionRows({ ...range, by: "broadcast", maxRows: 2 })
    ).rejects.toBeInstanceOf(MetricsQueryError);
  });
});
