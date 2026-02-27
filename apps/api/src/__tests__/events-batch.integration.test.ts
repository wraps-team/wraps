/**
 * Batch Events Endpoint Tests
 *
 * Integration tests for POST /v1/events/batch
 * Tests the batched contact resolution, event insertion,
 * workflow matching, and waiting execution resumption.
 */

import {
  contact,
  contactEvent,
  db,
  eq,
  member,
  organization,
  user,
  workflow,
  workflowExecution,
} from "@wraps/db";
import { and, inArray } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock SQS/scheduler to avoid AWS calls
vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  enqueueWorkflowStepBatch: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

import { Elysia } from "elysia";

// Mock event-limit middleware to pass through (must use Elysia instance)
vi.mock("../middleware/event-limit", () => ({
  eventLimitMiddleware: new Elysia({ name: "event-limit" }),
  getEventTTLExpiration: () => {
    const ttl = new Date();
    ttl.setFullYear(ttl.getFullYear() + 2);
    return ttl;
  },
  incrementEventUsage: vi.fn().mockResolvedValue(1),
}));

import { incrementEventUsage } from "../middleware/event-limit";
import { eventsRoutes } from "../routes/events";
import {
  deleteScheduledStep,
  enqueueWorkflowStepBatch,
} from "../services/workflow-queue";

const TEST_PREFIX = "events-batch-test";

const testUser = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}@example.com`,
  name: "Events Batch Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${TEST_PREFIX}-org-1`,
  name: "Events Batch Test Org",
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

const testContact1 = {
  id: `${TEST_PREFIX}-contact-1`,
  organizationId: testOrg.id,
  email: `${TEST_PREFIX}-c1@example.com`,
  firstName: "Alice",
  lastName: "Test",
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testContact2 = {
  id: `${TEST_PREFIX}-contact-2`,
  organizationId: testOrg.id,
  email: `${TEST_PREFIX}-c2@example.com`,
  firstName: "Bob",
  lastName: "Test",
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testWorkflow = {
  id: `${TEST_PREFIX}-workflow-1`,
  organizationId: testOrg.id,
  name: "Purchase Flow",
  status: "enabled",
  triggerType: "event",
  triggerConfig: { eventName: "purchase.completed" },
  steps: [],
  transitions: [],
  allowReentry: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const mockAuth = {
  apiKeyId: null,
  organizationId: testOrg.id,
  userId: testUser.id,
  planId: "starter",
};

function createTestApp() {
  return new Elysia().derive(() => ({ auth: mockAuth })).use(eventsRoutes);
}

function postBatch(
  app: ReturnType<typeof createTestApp>,
  events: Array<{
    name: string;
    contactId?: string;
    contactEmail?: string;
    properties?: Record<string, unknown>;
  }>
) {
  return app.handle(
    new Request("http://localhost/v1/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    })
  );
}

describe("POST /v1/events/batch", () => {
  let app: ReturnType<typeof createTestApp>;

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
      .values(testContact1)
      .onConflictDoUpdate({
        target: contact.id,
        set: { updatedAt: new Date() },
      });

    await db
      .insert(contact)
      .values(testContact2)
      .onConflictDoUpdate({
        target: contact.id,
        set: { updatedAt: new Date() },
      });

    await db
      .insert(workflow)
      .values(testWorkflow as typeof workflow.$inferInsert)
      .onConflictDoUpdate({
        target: workflow.id,
        set: { updatedAt: new Date() },
      });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createTestApp();

    // Clean up events and executions from previous tests
    await db
      .delete(contactEvent)
      .where(eq(contactEvent.organizationId, testOrg.id));

    await db
      .delete(workflowExecution)
      .where(eq(workflowExecution.organizationId, testOrg.id));
  });

  afterAll(async () => {
    // Clean up all test data
    await db
      .delete(contactEvent)
      .where(eq(contactEvent.organizationId, testOrg.id));
    await db
      .delete(workflowExecution)
      .where(eq(workflowExecution.organizationId, testOrg.id));
    await db.delete(workflow).where(eq(workflow.id, testWorkflow.id));
    await db
      .delete(contact)
      .where(inArray(contact.id, [testContact1.id, testContact2.id]));
    await db.delete(member).where(eq(member.id, testMember.id));
    await db.delete(organization).where(eq(organization.id, testOrg.id));
    await db.delete(user).where(eq(user.id, testUser.id));
  });

  // ---------------------------------------------------------------------------
  // Empty batch
  // ---------------------------------------------------------------------------

  it("returns success for empty events array", async () => {
    const res = await postBatch(app, []);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(0);
    expect(body.errors).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Contact resolution by ID
  // ---------------------------------------------------------------------------

  it("resolves contacts by ID and inserts events", async () => {
    const res = await postBatch(app, [
      { name: "page.viewed", contactId: testContact1.id },
      { name: "button.clicked", contactId: testContact2.id },
    ]);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(2);
    expect(body.errors).toHaveLength(0);

    // Verify events were inserted
    const events = await db
      .select()
      .from(contactEvent)
      .where(eq(contactEvent.organizationId, testOrg.id));

    expect(events).toHaveLength(2);
    expect(events.map((e) => e.eventName).sort()).toEqual([
      "button.clicked",
      "page.viewed",
    ]);
  });

  // ---------------------------------------------------------------------------
  // Contact resolution by email
  // ---------------------------------------------------------------------------

  it("resolves contacts by email", async () => {
    const res = await postBatch(app, [
      { name: "signup.completed", contactEmail: testContact1.email },
    ]);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(1);

    const events = await db
      .select()
      .from(contactEvent)
      .where(eq(contactEvent.organizationId, testOrg.id));

    expect(events).toHaveLength(1);
    expect(events[0].contactId).toBe(testContact1.id);
  });

  // ---------------------------------------------------------------------------
  // Mixed ID + email resolution
  // ---------------------------------------------------------------------------

  it("resolves contacts with mixed ID and email lookups", async () => {
    const res = await postBatch(app, [
      { name: "event.a", contactId: testContact1.id },
      { name: "event.b", contactEmail: testContact2.email },
    ]);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Missing contacts produce errors
  // ---------------------------------------------------------------------------

  it("reports errors for missing contacts without failing batch", async () => {
    const res = await postBatch(app, [
      { name: "good.event", contactId: testContact1.id },
      { name: "bad.event", contactId: "nonexistent-id" },
      { name: "also.bad", contactEmail: "nobody@example.com" },
    ]);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(false); // has errors
    expect(body.processed).toBe(1);
    expect(body.errors).toHaveLength(2);
    expect(body.errors[0]).toContain("Contact not found");
    expect(body.errors[1]).toContain("Contact not found");

    // Only the successful event was inserted
    const events = await db
      .select()
      .from(contactEvent)
      .where(eq(contactEvent.organizationId, testOrg.id));

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("good.event");
  });

  // ---------------------------------------------------------------------------
  // All contacts missing → no events inserted
  // ---------------------------------------------------------------------------

  it("returns early when all contacts are missing", async () => {
    const res = await postBatch(app, [
      { name: "ghost.event", contactId: "nonexistent" },
    ]);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.processed).toBe(0);
    expect(body.errors).toHaveLength(1);

    // incrementEventUsage should NOT be called when processed = 0
    expect(incrementEventUsage).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Workflow triggering
  // ---------------------------------------------------------------------------

  it("triggers matching workflows via batch SQS", async () => {
    const res = await postBatch(app, [
      {
        name: "purchase.completed",
        contactId: testContact1.id,
        properties: { amount: 99 },
      },
    ]);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.workflowsTriggered).toBe(1);

    expect(enqueueWorkflowStepBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: "trigger",
          workflowId: testWorkflow.id,
          contactId: testContact1.id,
          organizationId: testOrg.id,
        }),
      ])
    );
  });

  it("triggers workflow for each contact that matches the event", async () => {
    const res = await postBatch(app, [
      { name: "purchase.completed", contactId: testContact1.id },
      { name: "purchase.completed", contactId: testContact2.id },
    ]);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.workflowsTriggered).toBe(2);
    expect(body.processed).toBe(2);
  });

  it("does not trigger workflows for non-matching events", async () => {
    const res = await postBatch(app, [
      { name: "unrelated.event", contactId: testContact1.id },
    ]);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.workflowsTriggered).toBe(0);
    expect(body.processed).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Waiting execution resumption
  // ---------------------------------------------------------------------------

  it("resumes waiting executions and cancels timeout schedulers", async () => {
    // Create a waiting execution
    await db.insert(workflowExecution).values({
      id: `${TEST_PREFIX}-exec-1`,
      workflowId: testWorkflow.id,
      contactId: testContact1.id,
      organizationId: testOrg.id,
      status: "waiting",
      waitingForEvent: "purchase.completed",
      waitTimeoutSchedulerName: "wraps-wf-to-timeout-1",
      currentStepId: "step-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as typeof workflowExecution.$inferInsert);

    const res = await postBatch(app, [
      { name: "purchase.completed", contactId: testContact1.id },
    ]);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.executionsResumed).toBe(1);

    // Timeout scheduler should be cancelled
    expect(deleteScheduledStep).toHaveBeenCalledWith("wraps-wf-to-timeout-1");

    // The resume job should be in the batch
    expect(enqueueWorkflowStepBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resume",
          executionId: `${TEST_PREFIX}-exec-1`,
          branch: "yes",
        }),
      ])
    );
  });

  it("does not resume non-waiting executions", async () => {
    // Create a completed execution (should be ignored)
    await db.insert(workflowExecution).values({
      id: `${TEST_PREFIX}-exec-done`,
      workflowId: testWorkflow.id,
      contactId: testContact1.id,
      organizationId: testOrg.id,
      status: "completed",
      waitingForEvent: "purchase.completed",
      currentStepId: "step-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as typeof workflowExecution.$inferInsert);

    const res = await postBatch(app, [
      { name: "purchase.completed", contactId: testContact1.id },
    ]);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.executionsResumed).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Event properties passthrough
  // ---------------------------------------------------------------------------

  it("stores event properties in the database", async () => {
    const props = { orderId: "order-123", total: 42.5 };

    const res = await postBatch(app, [
      { name: "order.placed", contactId: testContact1.id, properties: props },
    ]);

    expect(res.status).toBe(200);

    const events = await db
      .select()
      .from(contactEvent)
      .where(
        and(
          eq(contactEvent.organizationId, testOrg.id),
          eq(contactEvent.eventName, "order.placed")
        )
      );

    expect(events).toHaveLength(1);
    expect(events[0].eventData).toEqual(props);
  });

  // ---------------------------------------------------------------------------
  // Deduplicates contacts in batch
  // ---------------------------------------------------------------------------

  it("handles duplicate contactIds in a single batch", async () => {
    const res = await postBatch(app, [
      { name: "event.a", contactId: testContact1.id },
      { name: "event.b", contactId: testContact1.id },
    ]);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.processed).toBe(2);

    // Both events should be stored
    const events = await db
      .select()
      .from(contactEvent)
      .where(eq(contactEvent.organizationId, testOrg.id));

    expect(events).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Event usage tracking
  // ---------------------------------------------------------------------------

  it("increments event usage with total processed count", async () => {
    await postBatch(app, [
      { name: "ev.1", contactId: testContact1.id },
      { name: "ev.2", contactId: testContact2.id },
    ]);

    expect(incrementEventUsage).toHaveBeenCalledWith(testOrg.id, 2);
  });
});
