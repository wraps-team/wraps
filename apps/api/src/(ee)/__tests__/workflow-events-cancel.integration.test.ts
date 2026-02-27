/**
 * Workflow Events - Topic Unsubscribe Cancellation Tests
 *
 * Tests for cancelling active workflow executions when a contact
 * unsubscribes from a topic that triggered the workflow.
 */

import {
  contact,
  contactTopic,
  db,
  member,
  organization,
  topic,
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
vi.mock("../../services/automation-queue", () => ({
  enqueueAutomationStep: vi.fn().mockResolvedValue(undefined),
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

import {
  cancelExecutionsForTopicUnsubscribe,
  emitTopicUnsubscribed,
} from "../../services/workflow-events";
import { deleteScheduledStep } from "../../services/workflow-queue";

// Test data IDs (unique to avoid conflicts with other tests)
const TEST_PREFIX = "api-wf-cancel-test";

const testUser = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}@example.com`,
  name: "Workflow Cancel Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${TEST_PREFIX}-org-1`,
  name: "Workflow Cancel Test Org",
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

const testTopic = {
  id: `${TEST_PREFIX}-topic-1`,
  organizationId: testOrg.id,
  name: "Welcome Series Topic",
  slug: "welcome-series",
  description: "Topic that triggers welcome workflow",
  public: true,
  doubleOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
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

const testOtherContact = {
  id: `${TEST_PREFIX}-other-contact`,
  organizationId: testOrg.id,
  email: `${TEST_PREFIX}-other@example.com`,
  firstName: "Other",
  lastName: "Contact",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Workflow triggered by topic_subscribed (use partial type for test data)
const testWorkflowData = {
  id: `${TEST_PREFIX}-workflow-1`,
  organizationId: testOrg.id,
  name: "Welcome Series",
  status: "enabled",
  triggerType: "topic_subscribed",
  triggerConfig: { topicId: testTopic.id },
  steps: [],
  transitions: [],
  allowReentry: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

// Different workflow (not topic_subscribed) - should NOT be affected
const testEventWorkflowData = {
  id: `${TEST_PREFIX}-workflow-2`,
  organizationId: testOrg.id,
  name: "Event Workflow",
  status: "enabled",
  triggerType: "event",
  triggerConfig: { eventName: "some_event" },
  steps: [],
  transitions: [],
  allowReentry: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

describe("cancelExecutionsForTopicUnsubscribe", () => {
  beforeAll(async () => {
    // Insert test user
    await db
      .insert(user)
      .values(testUser)
      .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

    // Insert test organization
    await db
      .insert(organization)
      .values(testOrg)
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: testOrg.name },
      });

    // Insert test member
    await db
      .insert(member)
      .values(testMember)
      .onConflictDoUpdate({
        target: member.id,
        set: { role: testMember.role },
      });

    // Insert test topic
    await db
      .insert(topic)
      .values(testTopic)
      .onConflictDoUpdate({ target: topic.id, set: { name: testTopic.name } });

    // Insert test contacts
    await db
      .insert(contact)
      .values(testContact)
      .onConflictDoUpdate({
        target: contact.id,
        set: { updatedAt: new Date() },
      });

    await db
      .insert(contact)
      .values(testOtherContact)
      .onConflictDoUpdate({
        target: contact.id,
        set: { updatedAt: new Date() },
      });

    // Insert test workflows (use type assertion for test data)
    await db
      .insert(workflow)
      .values(testWorkflowData as typeof workflow.$inferInsert)
      .onConflictDoUpdate({
        target: workflow.id,
        set: { updatedAt: new Date() },
      });

    await db
      .insert(workflow)
      .values(testEventWorkflowData as typeof workflow.$inferInsert)
      .onConflictDoUpdate({
        target: workflow.id,
        set: { updatedAt: new Date() },
      });
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Clean up executions from previous tests
    await db
      .delete(workflowExecution)
      .where(eq(workflowExecution.organizationId, testOrg.id));

    // Reset workflow stats
    await db
      .update(workflow)
      .set({ activeExecutions: 0 })
      .where(eq(workflow.organizationId, testOrg.id));
  });

  afterAll(async () => {
    // Clean up in reverse order of dependencies
    await db
      .delete(workflowExecution)
      .where(eq(workflowExecution.organizationId, testOrg.id));
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.contactId, testContact.id));
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.contactId, testOtherContact.id));
    await db.delete(contact).where(eq(contact.id, testContact.id));
    await db.delete(contact).where(eq(contact.id, testOtherContact.id));
    await db.delete(workflow).where(eq(workflow.organizationId, testOrg.id));
    await db.delete(topic).where(eq(topic.id, testTopic.id));
    await db.delete(member).where(eq(member.id, testMember.id));
    await db.delete(organization).where(eq(organization.id, testOrg.id));
    await db.delete(user).where(eq(user.id, testUser.id));
  });

  it("should cancel active execution when contact unsubscribes from topic", async () => {
    // Create an active execution
    const [execution] = await db
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

    // Update workflow active count
    await db
      .update(workflow)
      .set({ activeExecutions: 1 })
      .where(eq(workflow.id, testWorkflowData.id));

    // Cancel executions
    const result = await cancelExecutionsForTopicUnsubscribe({
      contactId: testContact.id,
      organizationId: testOrg.id,
      topicId: testTopic.id,
    });

    expect(result.executionsCancelled).toBe(1);

    // Verify execution was cancelled
    const [updatedExecution] = await db
      .select()
      .from(workflowExecution)
      .where(eq(workflowExecution.id, execution.id));

    expect(updatedExecution.status).toBe("cancelled");
    expect(updatedExecution.completedAt).not.toBeNull();

    // Verify workflow active count was decremented
    const [updatedWorkflow] = await db
      .select()
      .from(workflow)
      .where(eq(workflow.id, testWorkflowData.id));

    expect(updatedWorkflow.activeExecutions).toBe(0);
  });

  it("should cancel paused execution with delay scheduler", async () => {
    const schedulerName = `wraps-wf-${TEST_PREFIX}-exec-delay`;

    // Create a paused execution (waiting for delay)
    await db.insert(workflowExecution).values({
      workflowId: testWorkflowData.id,
      contactId: testContact.id,
      organizationId: testOrg.id,
      status: "paused",
      currentStepId: "delay1",
      delaySchedulerName: schedulerName,
      startedAt: new Date(),
    });

    await db
      .update(workflow)
      .set({ activeExecutions: 1 })
      .where(eq(workflow.id, testWorkflowData.id));

    const result = await cancelExecutionsForTopicUnsubscribe({
      contactId: testContact.id,
      organizationId: testOrg.id,
      topicId: testTopic.id,
    });

    expect(result.executionsCancelled).toBe(1);

    // Verify scheduler was deleted
    expect(deleteScheduledStep).toHaveBeenCalledWith(schedulerName);
  });

  it("should cancel waiting execution with timeout scheduler", async () => {
    const schedulerName = `wraps-wf-timeout-${TEST_PREFIX}-exec`;

    // Create a waiting execution (wait_for_event)
    await db.insert(workflowExecution).values({
      workflowId: testWorkflowData.id,
      contactId: testContact.id,
      organizationId: testOrg.id,
      status: "waiting",
      currentStepId: "wait1",
      waitTimeoutSchedulerName: schedulerName,
      startedAt: new Date(),
    });

    await db
      .update(workflow)
      .set({ activeExecutions: 1 })
      .where(eq(workflow.id, testWorkflowData.id));

    const result = await cancelExecutionsForTopicUnsubscribe({
      contactId: testContact.id,
      organizationId: testOrg.id,
      topicId: testTopic.id,
    });

    expect(result.executionsCancelled).toBe(1);

    // Verify timeout scheduler was deleted
    expect(deleteScheduledStep).toHaveBeenCalledWith(schedulerName);
  });

  it("should not cancel completed executions", async () => {
    // Create a completed execution
    await db.insert(workflowExecution).values({
      workflowId: testWorkflowData.id,
      contactId: testContact.id,
      organizationId: testOrg.id,
      status: "completed",
      currentStepId: "email1",
      startedAt: new Date(),
      completedAt: new Date(),
    });

    const result = await cancelExecutionsForTopicUnsubscribe({
      contactId: testContact.id,
      organizationId: testOrg.id,
      topicId: testTopic.id,
    });

    expect(result.executionsCancelled).toBe(0);
  });

  it("should not cancel executions for different contact", async () => {
    // Create execution for different contact
    await db.insert(workflowExecution).values({
      workflowId: testWorkflowData.id,
      contactId: testOtherContact.id,
      organizationId: testOrg.id,
      status: "active",
      currentStepId: "delay1",
      startedAt: new Date(),
    });

    const result = await cancelExecutionsForTopicUnsubscribe({
      contactId: testContact.id, // Different contact
      organizationId: testOrg.id,
      topicId: testTopic.id,
    });

    expect(result.executionsCancelled).toBe(0);
  });

  it("should not cancel executions for event-triggered workflows", async () => {
    // Create execution for event workflow (not topic_subscribed)
    await db.insert(workflowExecution).values({
      workflowId: testEventWorkflowData.id,
      contactId: testContact.id,
      organizationId: testOrg.id,
      status: "active",
      currentStepId: "trigger",
      startedAt: new Date(),
    });

    const result = await cancelExecutionsForTopicUnsubscribe({
      contactId: testContact.id,
      organizationId: testOrg.id,
      topicId: testTopic.id,
    });

    expect(result.executionsCancelled).toBe(0);
  });

  it("should cancel multiple executions for same contact", async () => {
    // Create multiple active executions (allowReentry must be true to bypass unique index)
    await db.insert(workflowExecution).values([
      {
        workflowId: testWorkflowData.id,
        contactId: testContact.id,
        organizationId: testOrg.id,
        allowReentry: true,
        status: "active",
        currentStepId: "delay1",
        startedAt: new Date(),
      },
      {
        workflowId: testWorkflowData.id,
        contactId: testContact.id,
        organizationId: testOrg.id,
        allowReentry: true,
        status: "paused",
        currentStepId: "delay1",
        startedAt: new Date(),
      },
    ]);

    await db
      .update(workflow)
      .set({ activeExecutions: 2 })
      .where(eq(workflow.id, testWorkflowData.id));

    const result = await cancelExecutionsForTopicUnsubscribe({
      contactId: testContact.id,
      organizationId: testOrg.id,
      topicId: testTopic.id,
    });

    expect(result.executionsCancelled).toBe(2);

    // Verify workflow active count was decremented for each
    const [updatedWorkflow] = await db
      .select()
      .from(workflow)
      .where(eq(workflow.id, testWorkflowData.id));

    expect(updatedWorkflow.activeExecutions).toBe(0);
  });

  it("should return 0 when no matching workflows exist", async () => {
    const result = await cancelExecutionsForTopicUnsubscribe({
      contactId: testContact.id,
      organizationId: testOrg.id,
      topicId: "nonexistent-topic-id",
    });

    expect(result.executionsCancelled).toBe(0);
  });
});

describe("emitTopicUnsubscribed with cancellation", () => {
  beforeAll(async () => {
    // Same setup as above
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
      .insert(topic)
      .values(testTopic)
      .onConflictDoUpdate({ target: topic.id, set: { name: testTopic.name } });

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
      .where(eq(workflow.organizationId, testOrg.id));
  });

  afterAll(async () => {
    await db
      .delete(workflowExecution)
      .where(eq(workflowExecution.organizationId, testOrg.id));
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.contactId, testContact.id));
    await db.delete(contact).where(eq(contact.id, testContact.id));
    await db.delete(contact).where(eq(contact.id, testOtherContact.id));
    await db.delete(workflow).where(eq(workflow.organizationId, testOrg.id));
    await db.delete(topic).where(eq(topic.id, testTopic.id));
    await db.delete(member).where(eq(member.id, testMember.id));
    await db.delete(organization).where(eq(organization.id, testOrg.id));
    await db.delete(user).where(eq(user.id, testUser.id));
  });

  it("should cancel active executions and return count", async () => {
    // Create an active execution
    await db.insert(workflowExecution).values({
      workflowId: testWorkflowData.id,
      contactId: testContact.id,
      organizationId: testOrg.id,
      status: "active",
      currentStepId: "delay1",
      startedAt: new Date(),
    });

    await db
      .update(workflow)
      .set({ activeExecutions: 1 })
      .where(eq(workflow.id, testWorkflowData.id));

    const result = await emitTopicUnsubscribed({
      contactId: testContact.id,
      organizationId: testOrg.id,
      topicId: testTopic.id,
      topicName: testTopic.name,
    });

    expect(result.executionsCancelled).toBe(1);
    expect(result.workflowsTriggered).toBeGreaterThanOrEqual(0);
  });

  it("should still emit event when no executions to cancel", async () => {
    const result = await emitTopicUnsubscribed({
      contactId: testContact.id,
      organizationId: testOrg.id,
      topicId: testTopic.id,
      topicName: testTopic.name,
    });

    expect(result.executionsCancelled).toBe(0);
    // Event should still be emitted (recorded to contact_event)
  });
});
