/**
 * Workflow Execution Cancel Tests
 *
 * Tests for POST /v1/workflows/executions/:executionId/cancel
 * Cancels active workflow executions, cleans up schedulers, adjusts stats.
 */

import {
  contact,
  db,
  member,
  organization,
  user,
  workflow,
  workflowExecution,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock the workflow-queue module to avoid actual AWS calls
vi.mock("../../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  enqueueWorkflowStepBatch: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

import { cancelWorkflowExecution } from "../../services/workflow-cancel";
import { deleteScheduledStep } from "../../services/workflow-queue";

const TEST_PREFIX = "api-wf-exec-cancel";

const testUser = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}@example.com`,
  name: "Cancel Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${TEST_PREFIX}-org-1`,
  name: "Cancel Test Org",
  slug: `${TEST_PREFIX}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: `${TEST_PREFIX}-member-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testContact = {
  id: `${TEST_PREFIX}-contact-1`,
  organizationId: testOrg.id,
  email: `${TEST_PREFIX}-contact@example.com`,
  firstName: "Test",
  lastName: "Contact",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testWorkflowData = {
  id: `${TEST_PREFIX}-workflow-1`,
  organizationId: testOrg.id,
  name: "Cancellable Workflow",
  status: "enabled",
  triggerType: "event",
  triggerConfig: { eventName: "test_event" },
  steps: [],
  transitions: [],
  allowReentry: false,
  activeExecutions: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

describe("cancelWorkflowExecution", () => {
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
      .insert(member)
      .values(testMember)
      .onConflictDoUpdate({
        target: member.id,
        set: { role: testMember.role },
      });

    await db
      .insert(contact)
      .values(testContact)
      .onConflictDoUpdate({
        target: contact.id,
        set: { updatedAt: new Date() },
      });

    await db
      .insert(workflow)
      .values(testWorkflowData as typeof workflow.$inferInsert)
      .onConflictDoUpdate({
        target: workflow.id,
        set: { updatedAt: new Date() },
      });
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    await db
      .delete(workflowExecution)
      .where(eq(workflowExecution.organizationId, testOrg.id));

    await db
      .update(workflow)
      .set({ activeExecutions: 0 })
      .where(eq(workflow.id, testWorkflowData.id));
  });

  afterAll(async () => {
    await db
      .delete(workflowExecution)
      .where(eq(workflowExecution.organizationId, testOrg.id));
    await db.delete(contact).where(eq(contact.id, testContact.id));
    await db.delete(workflow).where(eq(workflow.organizationId, testOrg.id));
    await db.delete(member).where(eq(member.id, testMember.id));
    await db.delete(organization).where(eq(organization.id, testOrg.id));
    await db.delete(user).where(eq(user.id, testUser.id));
  });

  // --- Unit 1: Rejects non-cancellable statuses ---

  it("should reject cancelling a completed execution", async () => {
    const [exec] = await db
      .insert(workflowExecution)
      .values({
        workflowId: testWorkflowData.id,
        contactId: testContact.id,
        organizationId: testOrg.id,
        status: "completed",
        currentStepId: "exit",
        startedAt: new Date(),
        completedAt: new Date(),
      })
      .returning();

    const result = await cancelWorkflowExecution({
      executionId: exec.id,
      organizationId: testOrg.id,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("cannot be cancelled");
  });

  it("should reject cancelling a failed execution", async () => {
    const [exec] = await db
      .insert(workflowExecution)
      .values({
        workflowId: testWorkflowData.id,
        contactId: testContact.id,
        organizationId: testOrg.id,
        status: "failed",
        currentStepId: "send-email",
        error: "Template not found",
        errorStepId: "send-email",
        startedAt: new Date(),
        completedAt: new Date(),
      })
      .returning();

    const result = await cancelWorkflowExecution({
      executionId: exec.id,
      organizationId: testOrg.id,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("cannot be cancelled");
  });

  it("should reject cancelling an already cancelled execution", async () => {
    const [exec] = await db
      .insert(workflowExecution)
      .values({
        workflowId: testWorkflowData.id,
        contactId: testContact.id,
        organizationId: testOrg.id,
        status: "cancelled",
        currentStepId: "delay1",
        startedAt: new Date(),
        completedAt: new Date(),
      })
      .returning();

    const result = await cancelWorkflowExecution({
      executionId: exec.id,
      organizationId: testOrg.id,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("cannot be cancelled");
  });

  it("should return error for non-existent execution", async () => {
    const result = await cancelWorkflowExecution({
      executionId: "nonexistent-id",
      organizationId: testOrg.id,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("should not find execution from different organization", async () => {
    const [exec] = await db
      .insert(workflowExecution)
      .values({
        workflowId: testWorkflowData.id,
        contactId: testContact.id,
        organizationId: testOrg.id,
        status: "active",
        currentStepId: "delay1",
        startedAt: new Date(),
      })
      .returning();

    const result = await cancelWorkflowExecution({
      executionId: exec.id,
      organizationId: "different-org-id",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  // --- Unit 2: Successfully cancels and cleans up ---

  it("should cancel an active execution", async () => {
    const [exec] = await db
      .insert(workflowExecution)
      .values({
        workflowId: testWorkflowData.id,
        contactId: testContact.id,
        organizationId: testOrg.id,
        status: "active",
        currentStepId: "send-email",
        startedAt: new Date(),
      })
      .returning();

    await db
      .update(workflow)
      .set({ activeExecutions: 1 })
      .where(eq(workflow.id, testWorkflowData.id));

    const result = await cancelWorkflowExecution({
      executionId: exec.id,
      organizationId: testOrg.id,
    });

    expect(result.success).toBe(true);

    // Verify execution status
    const [updated] = await db
      .select()
      .from(workflowExecution)
      .where(eq(workflowExecution.id, exec.id));

    expect(updated.status).toBe("cancelled");
    expect(updated.completedAt).not.toBeNull();

    // Verify workflow active count decremented
    const [wf] = await db
      .select()
      .from(workflow)
      .where(eq(workflow.id, testWorkflowData.id));

    expect(wf.activeExecutions).toBe(0);
  });

  it("should cancel a paused execution and clean up delay scheduler", async () => {
    const schedulerName = `wraps-wf-${TEST_PREFIX}-delay`;

    const [exec] = await db
      .insert(workflowExecution)
      .values({
        workflowId: testWorkflowData.id,
        contactId: testContact.id,
        organizationId: testOrg.id,
        status: "paused",
        currentStepId: "delay1",
        delaySchedulerName: schedulerName,
        startedAt: new Date(),
      })
      .returning();

    await db
      .update(workflow)
      .set({ activeExecutions: 1 })
      .where(eq(workflow.id, testWorkflowData.id));

    const result = await cancelWorkflowExecution({
      executionId: exec.id,
      organizationId: testOrg.id,
    });

    expect(result.success).toBe(true);
    expect(deleteScheduledStep).toHaveBeenCalledWith(schedulerName);
  });

  it("should cancel a waiting execution and clean up timeout scheduler", async () => {
    const schedulerName = `wraps-wf-timeout-${TEST_PREFIX}`;

    const [exec] = await db
      .insert(workflowExecution)
      .values({
        workflowId: testWorkflowData.id,
        contactId: testContact.id,
        organizationId: testOrg.id,
        status: "waiting",
        currentStepId: "wait1",
        waitTimeoutSchedulerName: schedulerName,
        startedAt: new Date(),
      })
      .returning();

    await db
      .update(workflow)
      .set({ activeExecutions: 1 })
      .where(eq(workflow.id, testWorkflowData.id));

    const result = await cancelWorkflowExecution({
      executionId: exec.id,
      organizationId: testOrg.id,
    });

    expect(result.success).toBe(true);
    expect(deleteScheduledStep).toHaveBeenCalledWith(schedulerName);
  });

  it("should cancel a pending execution", async () => {
    const [exec] = await db
      .insert(workflowExecution)
      .values({
        workflowId: testWorkflowData.id,
        contactId: testContact.id,
        organizationId: testOrg.id,
        status: "pending",
        currentStepId: "trigger",
        startedAt: new Date(),
      })
      .returning();

    await db
      .update(workflow)
      .set({ activeExecutions: 1 })
      .where(eq(workflow.id, testWorkflowData.id));

    const result = await cancelWorkflowExecution({
      executionId: exec.id,
      organizationId: testOrg.id,
    });

    expect(result.success).toBe(true);

    const [updated] = await db
      .select()
      .from(workflowExecution)
      .where(eq(workflowExecution.id, exec.id));

    expect(updated.status).toBe("cancelled");
  });

  it("should handle race condition — only one cancel wins", async () => {
    const [exec] = await db
      .insert(workflowExecution)
      .values({
        workflowId: testWorkflowData.id,
        contactId: testContact.id,
        organizationId: testOrg.id,
        status: "active",
        currentStepId: "send-email",
        startedAt: new Date(),
      })
      .returning();

    await db
      .update(workflow)
      .set({ activeExecutions: 1 })
      .where(eq(workflow.id, testWorkflowData.id));

    // Race two cancels
    const [r1, r2] = await Promise.all([
      cancelWorkflowExecution({
        executionId: exec.id,
        organizationId: testOrg.id,
      }),
      cancelWorkflowExecution({
        executionId: exec.id,
        organizationId: testOrg.id,
      }),
    ]);

    // Exactly one should succeed
    const successes = [r1, r2].filter((r) => r.success);
    const failures = [r1, r2].filter((r) => !r.success);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });
});
