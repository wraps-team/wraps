/**
 * Audit Log Instrumentation Tests — Chunk 7: Workflows (EE)
 *
 * Verifies that createWorkflow, updateWorkflow, deleteWorkflow, enableWorkflow,
 * disableWorkflow, and duplicateWorkflow each write a correctly-shaped audit
 * log row after a successful mutation.
 */

import type { WorkflowStep } from "@wraps/db";
import {
  auditLog,
  awsAccount,
  db,
  member,
  organization,
  organizationExtension,
  subscription,
  template,
  user,
  workflow,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createWorkflow,
  deleteWorkflow,
  disableWorkflow,
  duplicateWorkflow,
  enableWorkflow,
  updateWorkflow,
} from "../(ee)/workflows";

// --- Test fixtures ---

const testUser = {
  id: "audit-v2-wf-user-1",
  email: "audit-v2-wf-user@example.com",
  name: "Audit WF User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: "audit-v2-wf-org-1",
  name: "Audit WF Org",
  slug: "audit-v2-wf-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "audit-v2-wf-member-1",
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testAwsAccount = {
  id: "audit-v2-wf-aws-1",
  organizationId: testOrg.id,
  accountId: "111122223333",
  region: "us-east-1",
  roleArn: "arn:aws:iam::111122223333:role/audit-wf-role",
  externalId: "audit-v2-wf-ext-id-unique",
  name: "Audit WF AWS Account",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const testTemplate = {
  id: "audit-v2-wf-template-1",
  organizationId: testOrg.id,
  name: "Audit WF Template",
  subject: "Hello",
  content: {},
  status: "PUBLISHED" as const,
  type: "EMAIL" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

// --- Mocks ---

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: testUser.id, email: testUser.email, name: testUser.name },
        session: {
          id: "audit-v2-wf-session-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "audit-v2-wf-token",
        },
      })),
    },
  },
}));

vi.mock("@/lib/plan-limits", () => ({
  checkFeatureAccess: vi.fn(async () => ({ allowed: true })),
  checkWorkflowLimit: vi.fn(async () => ({
    allowed: true,
    current: 0,
    limit: 5,
  })),
}));

vi.mock("@/lib/activation-tracking", () => ({
  trackWorkflowCreated: vi.fn(async () => {}),
}));

// --- DB setup & teardown ---

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(testOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrg.name },
    });

  await db
    .insert(organizationExtension)
    .values({ organizationId: testOrg.id })
    .onConflictDoUpdate({
      target: organizationExtension.organizationId,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(subscription)
    .values({
      id: `sub_audit_v2_wf_${testOrg.id}`,
      plan: "growth",
      referenceId: testOrg.id,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscription.id,
      set: { plan: "growth", status: "active" },
    });

  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });

  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { name: testAwsAccount.name },
    });

  await db
    .insert(template)
    .values(testTemplate)
    .onConflictDoUpdate({
      target: template.id,
      set: { name: testTemplate.name },
    });
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  await db.delete(workflow).where(eq(workflow.organizationId, testOrg.id));
  await db.delete(template).where(eq(template.id, testTemplate.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db
    .delete(subscription)
    .where(eq(subscription.id, `sub_audit_v2_wf_${testOrg.id}`));
  await db
    .delete(organizationExtension)
    .where(eq(organizationExtension.organizationId, testOrg.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

// Clean workflows between tests to avoid interference
afterEach(async () => {
  await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  await db.delete(workflow).where(eq(workflow.organizationId, testOrg.id));
});

// --- Tests ---

describe("createWorkflow — writes workflow.created audit log", () => {
  it("inserts a workflow.created audit log row with correct fields", async () => {
    const result = await createWorkflow(testOrg.id, {
      name: "Audit Create WF",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "workflow.created")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("workflow.created");
    expect(row.resource).toBe("workflow");
    expect(row.resourceId).toBe(result.workflow.id);
    expect(row.metadata).toMatchObject({
      workflowId: result.workflow.id,
      name: "Audit Create WF",
    });
  });
});

describe("updateWorkflow — writes workflow.updated audit log", () => {
  it("inserts a workflow.updated audit log row with correct fields", async () => {
    const createResult = await createWorkflow(testOrg.id, {
      name: "Before Update",
    });
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    // Clear audit log from the create
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));

    const result = await updateWorkflow(createResult.workflow.id, testOrg.id, {
      name: "After Update",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "workflow.updated")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("workflow.updated");
    expect(row.resource).toBe("workflow");
    expect(row.resourceId).toBe(createResult.workflow.id);
    expect(row.metadata).toMatchObject({
      workflowId: createResult.workflow.id,
      name: "After Update",
    });
  });
});

describe("deleteWorkflow — writes workflow.deleted audit log", () => {
  it("inserts a workflow.deleted audit log row with correct fields", async () => {
    const createResult = await createWorkflow(testOrg.id, {
      name: "To Delete",
    });
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    const workflowId = createResult.workflow.id;

    // Clear audit log from the create
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));

    const result = await deleteWorkflow(workflowId, testOrg.id);

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "workflow.deleted")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("workflow.deleted");
    expect(row.resource).toBe("workflow");
    expect(row.resourceId).toBe(workflowId);
    expect(row.metadata).toMatchObject({ workflowId });
  });
});

describe("enableWorkflow — writes workflow.enabled audit log", () => {
  it("inserts a workflow.enabled audit log row with correct fields", async () => {
    const createResult = await createWorkflow(testOrg.id, {
      name: "To Enable",
    });
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    const workflowId = createResult.workflow.id;

    // Set up a valid workflow that can be enabled
    await updateWorkflow(workflowId, testOrg.id, {
      awsAccountId: testAwsAccount.id,
      defaultFrom: "sender@example.com",
      triggerConfig: { eventName: "signup" },
      steps: [
        ...(createResult.workflow.steps as WorkflowStep[]),
        {
          id: "action-audit-1",
          type: "send_email",
          name: "Send Welcome",
          position: { x: 100, y: 200 },
          config: { type: "send_email", templateId: testTemplate.id },
        },
      ],
      transitions: [
        {
          id: "trans-audit-1",
          fromStepId: (createResult.workflow.steps as WorkflowStep[])[0]!.id,
          toStepId: "action-audit-1",
        },
      ],
    });

    // Clear audit log from create + update
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));

    const result = await enableWorkflow(workflowId, testOrg.id);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "workflow.enabled")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("workflow.enabled");
    expect(row.resource).toBe("workflow");
    expect(row.resourceId).toBe(workflowId);
    expect(row.metadata).toMatchObject({ workflowId });
  });
});

describe("disableWorkflow — writes workflow.disabled audit log", () => {
  it("inserts a workflow.disabled audit log row with correct fields", async () => {
    const createResult = await createWorkflow(testOrg.id, {
      name: "To Disable",
    });
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    const workflowId = createResult.workflow.id;

    // Set up and enable first
    await updateWorkflow(workflowId, testOrg.id, {
      awsAccountId: testAwsAccount.id,
      defaultFrom: "sender@example.com",
      triggerConfig: { eventName: "signup" },
      steps: [
        ...(createResult.workflow.steps as WorkflowStep[]),
        {
          id: "action-audit-2",
          type: "send_email",
          name: "Send Email",
          position: { x: 100, y: 200 },
          config: { type: "send_email", templateId: testTemplate.id },
        },
      ],
      transitions: [
        {
          id: "trans-audit-2",
          fromStepId: (createResult.workflow.steps as WorkflowStep[])[0]!.id,
          toStepId: "action-audit-2",
        },
      ],
    });
    await enableWorkflow(workflowId, testOrg.id);

    // Clear audit log from setup operations
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));

    const result = await disableWorkflow(workflowId, testOrg.id);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "workflow.disabled")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("workflow.disabled");
    expect(row.resource).toBe("workflow");
    expect(row.resourceId).toBe(workflowId);
    expect(row.metadata).toMatchObject({ workflowId });
  });
});

describe("duplicateWorkflow — writes workflow.duplicated audit log", () => {
  it("inserts a workflow.duplicated audit log row with correct fields", async () => {
    const createResult = await createWorkflow(testOrg.id, { name: "Original" });
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    const sourceId = createResult.workflow.id;

    // Clear audit log from create
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));

    const result = await duplicateWorkflow(sourceId, testOrg.id);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "workflow.duplicated")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("workflow.duplicated");
    expect(row.resource).toBe("workflow");
    expect(row.resourceId).toBe(result.workflow.id);
    expect(row.metadata).toMatchObject({
      workflowId: result.workflow.id,
      sourceId,
    });
  });
});
