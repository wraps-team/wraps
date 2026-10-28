// DB-backed. NOT RUN in the timeline worktree: apps/web/.env.test does not exist
// there yet, and no database was contacted when this file was written. It
// covers listChangeMarkerRows: org isolation for each source, the email-only
// and started-only batch filter, the template join, the suppression address
// never leaving the database, the audit floor, inclusive window bounds, and
// the 501-row truncation flag. Fixtures are namespaced by a per-file suffix.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { listChangeMarkerRows } from "../repositories/change-markers";
import {
  auditLog,
  batchSend,
  organization,
  template,
  templateVersion,
  workflow,
} from "../schema";

const suffix = crypto.randomUUID().slice(0, 8);
const ORG = `cm-org-${suffix}`;
const OTHER_ORG = `cm-other-${suffix}`;

const WINDOW_START = new Date("2026-10-20T00:00:00.000Z");
const WINDOW_END = new Date("2026-10-28T00:00:00.000Z");
const FLOOR = new Date("2026-10-01T00:00:00.000Z");

const ids = {
  batchOk: `cm-batch-ok-${suffix}`,
  batchSms: `cm-batch-sms-${suffix}`,
  batchDraft: `cm-batch-draft-${suffix}`,
  batchOther: `cm-batch-other-${suffix}`,
  batchEdgeStart: `cm-batch-start-${suffix}`,
  batchEdgeEnd: `cm-batch-end-${suffix}`,
  workflow: `cm-wf-${suffix}`,
  workflowOther: `cm-wf-other-${suffix}`,
  templateOwn: `cm-tpl-${suffix}`,
  templateOther: `cm-tpl-other-${suffix}`,
  tvOwn: `cm-tv-own-${suffix}`,
  tvOther: `cm-tv-other-${suffix}`,
  auditSuppression: `cm-audit-supp-${suffix}`,
  auditOld: `cm-audit-old-${suffix}`,
  auditOther: `cm-audit-other-${suffix}`,
};

const SUPPRESSED_ADDRESS = `reader-${suffix}@example.com`;

beforeAll(async () => {
  await db
    .insert(organization)
    .values([
      {
        id: ORG,
        name: "Markers Org",
        slug: `cm-${suffix}`,
        createdAt: new Date(),
      },
      {
        id: OTHER_ORG,
        name: "Markers Other",
        slug: `cm-other-${suffix}`,
        createdAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  await db.insert(batchSend).values([
    {
      id: ids.batchOk,
      organizationId: ORG,
      name: "Launch",
      channel: "email",
      totalRecipients: 1200,
      startedAt: new Date("2026-10-25T10:00:00.000Z"),
    },
    {
      id: ids.batchSms,
      organizationId: ORG,
      name: "SMS blast",
      channel: "sms",
      startedAt: new Date("2026-10-25T11:00:00.000Z"),
    },
    {
      id: ids.batchDraft,
      organizationId: ORG,
      name: "Draft",
      channel: "email",
      startedAt: null,
    },
    {
      id: ids.batchOther,
      organizationId: OTHER_ORG,
      name: "Their launch",
      channel: "email",
      startedAt: new Date("2026-10-25T10:00:00.000Z"),
    },
    {
      id: ids.batchEdgeStart,
      organizationId: ORG,
      name: "At start",
      channel: "email",
      startedAt: WINDOW_START,
    },
    {
      id: ids.batchEdgeEnd,
      organizationId: ORG,
      name: "At end",
      channel: "email",
      startedAt: WINDOW_END,
    },
  ]);

  await db.insert(workflow).values([
    { id: ids.workflow, organizationId: ORG, name: "Welcome flow" },
    { id: ids.workflowOther, organizationId: OTHER_ORG, name: "Their flow" },
  ]);

  await db.insert(template).values([
    {
      id: ids.templateOwn,
      organizationId: ORG,
      name: "Own template",
      channel: "email",
      content: {},
    },
    {
      id: ids.templateOther,
      organizationId: OTHER_ORG,
      name: "Their template",
      channel: "email",
      content: {},
    },
  ]);

  await db.insert(templateVersion).values([
    {
      id: ids.tvOwn,
      templateId: ids.templateOwn,
      content: {},
      version: 3,
      createdAt: new Date("2026-10-24T09:00:00.000Z"),
    },
    {
      id: ids.tvOther,
      templateId: ids.templateOther,
      content: {},
      version: 9,
      createdAt: new Date("2026-10-24T09:00:00.000Z"),
    },
  ]);

  await db.insert(auditLog).values([
    {
      id: ids.auditSuppression,
      organizationId: ORG,
      action: "suppression.removed",
      resource: "suppressions",
      resourceId: SUPPRESSED_ADDRESS,
      metadata: { email: SUPPRESSED_ADDRESS },
      createdAt: new Date("2026-10-23T08:00:00.000Z"),
    },
    {
      id: ids.auditOld,
      organizationId: ORG,
      action: "contact.imported",
      resource: "contacts",
      metadata: { count: 5 },
      createdAt: new Date("2026-09-15T08:00:00.000Z"),
    },
    {
      id: ids.auditOther,
      organizationId: OTHER_ORG,
      action: "suppression.removed",
      resource: "suppressions",
      resourceId: `other-${suffix}@example.com`,
      createdAt: new Date("2026-10-23T08:00:00.000Z"),
    },
  ]);
});

afterAll(async () => {
  await db
    .delete(auditLog)
    .where(inArray(auditLog.organizationId, [ORG, OTHER_ORG]));
  await db
    .delete(templateVersion)
    .where(inArray(templateVersion.id, [ids.tvOwn, ids.tvOther]));
  await db
    .delete(template)
    .where(inArray(template.id, [ids.templateOwn, ids.templateOther]));
  await db
    .delete(workflow)
    .where(inArray(workflow.id, [ids.workflow, ids.workflowOther]));
  await db
    .delete(batchSend)
    .where(inArray(batchSend.organizationId, [ORG, OTHER_ORG]));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(organization).where(eq(organization.id, OTHER_ORG));
});

function query(
  overrides: Partial<Parameters<typeof listChangeMarkerRows>[0]> = {}
) {
  return listChangeMarkerRows({
    organizationId: ORG,
    startTime: WINDOW_START,
    endTime: WINDOW_END,
    auditFloor: FLOOR,
    ...overrides,
  });
}

describe("listChangeMarkerRows (DB)", () => {
  it("excludes another organization's batches, audit rows, and template versions", async () => {
    const result = await query();
    const batchIds = result.batches.map((b) => b.id);
    const auditIds = result.auditRows.map((a) => a.id);
    const versionIds = result.templateVersions.map((v) => v.id);

    expect(batchIds).not.toContain(ids.batchOther);
    expect(auditIds).not.toContain(ids.auditOther);
    expect(versionIds).not.toContain(ids.tvOther);
    expect(batchIds).toContain(ids.batchOk);
    expect(versionIds).toContain(ids.tvOwn);
  });

  it("returns only email batches with a non-null started_at", async () => {
    const result = await query();
    const batchIds = result.batches.map((b) => b.id);
    expect(batchIds).toContain(ids.batchOk);
    expect(batchIds).not.toContain(ids.batchSms);
    expect(batchIds).not.toContain(ids.batchDraft);
  });

  it("joins template_version to template by organization_id", async () => {
    const result = await query();
    const versionIds = result.templateVersions.map((v) => v.id);
    expect(versionIds).not.toContain(ids.tvOther);
    expect(
      result.templateVersions.find((v) => v.id === ids.tvOwn)
    ).toMatchObject({
      templateId: ids.templateOwn,
      templateName: "Own template",
      version: 3,
    });
  });

  it("selects no resource_id or metadata for suppression.removed rows", async () => {
    const result = await query();
    const row = result.auditRows.find((a) => a.id === ids.auditSuppression);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("resourceId");
    expect(row).not.toHaveProperty("metadata");
    expect(row?.workflowId).toBeNull();
    expect(row?.importCount).toBeNull();
    expect(JSON.stringify(result)).not.toContain(SUPPRESSED_ADDRESS);
  });

  it("nulls the workflow name when the workflow belongs to another org", async () => {
    await db.insert(auditLog).values({
      id: `${ids.auditOther}-wf`,
      organizationId: ORG,
      action: "workflow.enabled",
      resource: "workflows",
      resourceId: ids.workflowOther,
      createdAt: new Date("2026-10-22T08:00:00.000Z"),
    });
    const result = await query();
    const row = result.auditRows.find((a) => a.id === `${ids.auditOther}-wf`);
    expect(row?.workflowName).toBeNull();
    await db.delete(auditLog).where(eq(auditLog.id, `${ids.auditOther}-wf`));
  });

  it("applies the audit floor: rows before auditFloor are excluded and later rows are kept", async () => {
    // auditOld is dated before FLOOR, so a query whose window reaches back past
    // the floor must still leave it out.
    const result = await query({
      startTime: new Date("2026-09-01T00:00:00.000Z"),
    });
    const auditIds = result.auditRows.map((a) => a.id);
    expect(auditIds).not.toContain(ids.auditOld);
    expect(auditIds).toContain(ids.auditSuppression);
  });

  it("includes rows at exactly startTime and endTime", async () => {
    const result = await query();
    const batchIds = result.batches.map((b) => b.id);
    expect(batchIds).toContain(ids.batchEdgeStart);
    expect(batchIds).toContain(ids.batchEdgeEnd);
  });

  it("reports truncated when a source returns 501 rows", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      id: `cm-bulk-${suffix}-${i}`,
      organizationId: ORG,
      action: "contact.imported",
      resource: "contacts",
      metadata: { count: 1 },
      createdAt: new Date("2026-10-26T08:00:00.000Z"),
    }));
    await db.insert(auditLog).values(rows);
    try {
      const result = await query();
      expect(result.truncated).toBe(true);
      expect(result.auditRows.length).toBeLessThanOrEqual(500);
    } finally {
      await db.delete(auditLog).where(
        inArray(
          auditLog.id,
          rows.map((r) => r.id)
        )
      );
    }
  });
});
