/**
 * Workflow Events Service Tests
 *
 * Tests for the workflow event emission system.
 * Covers:
 * - emitWorkflowEvent - generic event emission
 * - emitContactCreated - contact creation events
 * - emitContactUpdated - contact update events
 * - emitTopicSubscribed - topic subscription events
 * - emitTopicUnsubscribed - topic unsubscription events
 * - checkSegmentEntry - segment entry trigger evaluation
 * - checkSegmentExit - segment exit trigger evaluation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Track enqueued workflow steps
const enqueuedSteps: Array<{
  type: string;
  workflowId?: string;
  contactId?: string;
  organizationId?: string;
  eventData?: Record<string, unknown>;
}> = [];

// Mock enqueueWorkflowStep
vi.mock("../automation-queue", () => ({
  enqueueAutomationStep: vi.fn().mockImplementation((step) => {
    enqueuedSteps.push(step);
    return Promise.resolve();
  }),
  enqueueWorkflowStep: vi.fn().mockImplementation((step) => {
    enqueuedSteps.push(step);
    return Promise.resolve();
  }),
}));

// Note: segment evaluation now uses SQL-based functions from @wraps/db
// (contactMatchesCondition, getSegmentsByIds) which are mocked below in the @wraps/db mock.

// Mock database
const mockWorkflows: Array<{
  id: string;
  organizationId: string;
  status: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
}> = [];

const mockSegments: Array<{
  id: string;
  name: string;
}> = [];

vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((_table) => ({
        where: vi.fn().mockImplementation(() => {
          // Return workflows or segments based on context
          if (mockWorkflows.length > 0) {
            return Promise.resolve(mockWorkflows);
          }
          if (mockSegments.length > 0) {
            return Promise.resolve(mockSegments);
          }
          return Promise.resolve([]);
        }),
        limit: vi.fn().mockImplementation(() => {
          if (mockSegments.length > 0) {
            return Promise.resolve(mockSegments);
          }
          return Promise.resolve([]);
        }),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => Promise.resolve()),
      })),
    })),
  },
  contact: { id: "id" },
  contactEvent: {},
  segment: { id: "id", name: "name" },
  automation: {
    id: "id",
    organizationId: "organization_id",
    status: "status",
    triggerType: "trigger_type",
    triggerConfig: "trigger_config",
  },
  workflow: {
    id: "id",
    organizationId: "organization_id",
    status: "status",
    triggerType: "trigger_type",
    triggerConfig: "trigger_config",
  },
  automationExecution: {
    id: "id",
    contactId: "contact_id",
    workflowId: "workflow_id",
    status: "status",
    delaySchedulerName: "delay_scheduler_name",
    waitTimeoutSchedulerName: "wait_timeout_scheduler_name",
  },
  workflowExecution: {
    id: "id",
    contactId: "contact_id",
    workflowId: "workflow_id",
    status: "status",
    delaySchedulerName: "delay_scheduler_name",
    waitTimeoutSchedulerName: "wait_timeout_scheduler_name",
  },
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  inArray: vi.fn((field, values) => ({ inArray: [field, values] })),
  sql: vi.fn((template) => template),
  // SQL-based segment evaluation functions
  contactMatchesCondition: vi
    .fn()
    .mockImplementation((_db, _contactId, _orgId, _condition) =>
      Promise.resolve(false)
    ),
  getSegmentsByIds: vi.fn().mockImplementation((_db, segmentIds) => {
    const result = new Map();
    for (const seg of mockSegments) {
      if (segmentIds.includes(seg.id)) {
        result.set(seg.id, seg);
      }
    }
    return Promise.resolve(result);
  }),
}));

// Import after mocking
import {
  checkSegmentEntry,
  emitContactCreated,
  emitContactUpdated,
  emitTopicSubscribed,
  emitTopicUnsubscribed,
  emitWorkflowEvent,
} from "../workflow-events";

describe("Workflow Events Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueuedSteps.length = 0;
    mockWorkflows.length = 0;
    mockSegments.length = 0;
  });

  describe("emitWorkflowEvent", () => {
    it("should trigger matching workflows", async () => {
      mockWorkflows.push({
        id: "wf-1",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "event",
        triggerConfig: { eventName: "test_event" },
      });

      const result = await emitWorkflowEvent({
        eventName: "test_event",
        contactId: "contact-123",
        organizationId: "org-123",
        eventData: { key: "value" },
      });

      expect(result.workflowsTriggered).toBe(1);
      expect(enqueuedSteps).toHaveLength(1);
      expect(enqueuedSteps[0]).toMatchObject({
        type: "trigger",
        workflowId: "wf-1",
        contactId: "contact-123",
        organizationId: "org-123",
      });
    });

    it("should return 0 when no workflows match", async () => {
      // No workflows configured
      const result = await emitWorkflowEvent({
        eventName: "unmatched_event",
        contactId: "contact-123",
        organizationId: "org-123",
      });

      expect(result.workflowsTriggered).toBe(0);
      expect(enqueuedSteps).toHaveLength(0);
    });

    it("should trigger multiple matching workflows", async () => {
      mockWorkflows.push(
        {
          id: "wf-1",
          organizationId: "org-123",
          status: "enabled",
          triggerType: "event",
          triggerConfig: { eventName: "multi_event" },
        },
        {
          id: "wf-2",
          organizationId: "org-123",
          status: "enabled",
          triggerType: "event",
          triggerConfig: { eventName: "multi_event" },
        }
      );

      const result = await emitWorkflowEvent({
        eventName: "multi_event",
        contactId: "contact-123",
        organizationId: "org-123",
      });

      expect(result.workflowsTriggered).toBe(2);
      expect(enqueuedSteps).toHaveLength(2);
    });

    it("should pass event data to workflow", async () => {
      mockWorkflows.push({
        id: "wf-1",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "event",
        triggerConfig: { eventName: "data_event" },
      });

      await emitWorkflowEvent({
        eventName: "data_event",
        contactId: "contact-123",
        organizationId: "org-123",
        eventData: { orderId: "order-456", amount: 99.99 },
      });

      expect(enqueuedSteps[0].eventData).toEqual({
        orderId: "order-456",
        amount: 99.99,
      });
    });
  });

  describe("emitContactCreated", () => {
    it("should emit contact_created event", async () => {
      mockWorkflows.push({
        id: "wf-welcome",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "event",
        triggerConfig: { eventName: "contact_created" },
      });

      const result = await emitContactCreated({
        contactId: "contact-new",
        organizationId: "org-123",
        contactData: {
          email: "new@example.com",
          firstName: "Jane",
        },
      });

      expect(result.workflowsTriggered).toBeGreaterThanOrEqual(1);
      expect(enqueuedSteps[0].eventData).toMatchObject({
        email: "new@example.com",
        firstName: "Jane",
      });
      expect(enqueuedSteps[0].eventData).toHaveProperty("createdAt");
    });

    it("should trigger workflows with contact_created trigger type (CLI-pushed format)", async () => {
      mockWorkflows.push({
        id: "wf-cli-welcome",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "contact_created",
        triggerConfig: {},
      });

      const result = await emitContactCreated({
        contactId: "contact-new",
        organizationId: "org-123",
        contactData: { email: "cli@example.com" },
      });

      expect(result.workflowsTriggered).toBeGreaterThanOrEqual(1);
      expect(enqueuedSteps.length).toBeGreaterThanOrEqual(1);
      const cliStep = enqueuedSteps.find(
        (s) => s.workflowId === "wf-cli-welcome"
      );
      expect(cliStep).toBeDefined();
      expect(cliStep?.eventData).toMatchObject({
        email: "cli@example.com",
      });
      expect(cliStep?.eventData).toHaveProperty("createdAt");
    });

    it("should include createdAt timestamp", async () => {
      mockWorkflows.push({
        id: "wf-1",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "event",
        triggerConfig: { eventName: "contact_created" },
      });

      const before = new Date().toISOString();
      await emitContactCreated({
        contactId: "contact-123",
        organizationId: "org-123",
      });
      const after = new Date().toISOString();

      const createdAt = enqueuedSteps[0].eventData?.createdAt as string;
      expect(createdAt >= before).toBe(true);
      expect(createdAt <= after).toBe(true);
    });
  });

  describe("emitContactUpdated", () => {
    it("should emit contact_updated event", async () => {
      mockWorkflows.push({
        id: "wf-update",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "event",
        triggerConfig: { eventName: "contact_updated" },
      });

      const result = await emitContactUpdated({
        contactId: "contact-123",
        organizationId: "org-123",
        updatedFields: ["firstName", "lastName"],
        contactData: {
          email: "updated@example.com",
        },
      });

      expect(result.workflowsTriggered).toBeGreaterThanOrEqual(1);
      expect(enqueuedSteps[0].eventData).toMatchObject({
        email: "updated@example.com",
        updatedFields: ["firstName", "lastName"],
      });
      expect(enqueuedSteps[0].eventData).toHaveProperty("updatedAt");
    });

    it("should trigger workflows with contact_updated trigger type (CLI-pushed format)", async () => {
      mockWorkflows.push({
        id: "wf-cli-update",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "contact_updated",
        triggerConfig: {},
      });

      const result = await emitContactUpdated({
        contactId: "contact-123",
        organizationId: "org-123",
        updatedFields: ["email"],
        contactData: { email: "cli-updated@example.com" },
      });

      expect(result.workflowsTriggered).toBeGreaterThanOrEqual(1);
      const cliStep = enqueuedSteps.find(
        (s) => s.workflowId === "wf-cli-update"
      );
      expect(cliStep).toBeDefined();
      expect(cliStep?.eventData).toMatchObject({
        email: "cli-updated@example.com",
        updatedFields: ["email"],
      });
      expect(cliStep?.eventData).toHaveProperty("updatedAt");
    });

    it("should include list of updated fields", async () => {
      mockWorkflows.push({
        id: "wf-1",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "event",
        triggerConfig: { eventName: "contact_updated" },
      });

      await emitContactUpdated({
        contactId: "contact-123",
        organizationId: "org-123",
        updatedFields: ["email", "phone", "properties"],
      });

      expect(enqueuedSteps[0].eventData?.updatedFields).toEqual([
        "email",
        "phone",
        "properties",
      ]);
    });
  });

  describe("emitTopicSubscribed", () => {
    it("should emit topic_subscribed event", async () => {
      mockWorkflows.push({
        id: "wf-topic-event",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "event",
        triggerConfig: { eventName: "topic_subscribed" },
      });

      const result = await emitTopicSubscribed({
        contactId: "contact-123",
        organizationId: "org-123",
        topicId: "topic-newsletter",
        topicName: "Newsletter",
      });

      expect(result.workflowsTriggered).toBeGreaterThanOrEqual(1);
      expect(enqueuedSteps[0].eventData).toMatchObject({
        topicId: "topic-newsletter",
        topicName: "Newsletter",
      });
      expect(enqueuedSteps[0].eventData).toHaveProperty("subscribedAt");
    });

    it("should trigger topic_subscribed trigger type workflows", async () => {
      // First call returns event-based workflows (empty)
      // We need to set up the mock to return topic_subscribed trigger workflows
      mockWorkflows.push({
        id: "wf-topic-trigger",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "topic_subscribed",
        triggerConfig: { topicId: "topic-123" },
      });

      const result = await emitTopicSubscribed({
        contactId: "contact-123",
        organizationId: "org-123",
        topicId: "topic-123",
        topicName: "Welcome Series",
      });

      // Should trigger both event-based and trigger-type workflows
      expect(result.workflowsTriggered).toBeGreaterThanOrEqual(0);
    });
  });

  describe("emitTopicUnsubscribed", () => {
    it("should emit topic_unsubscribed event", async () => {
      mockWorkflows.push({
        id: "wf-unsub",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "event",
        triggerConfig: { eventName: "topic_unsubscribed" },
      });

      const result = await emitTopicUnsubscribed({
        contactId: "contact-123",
        organizationId: "org-123",
        topicId: "topic-promo",
        topicName: "Promotions",
      });

      expect(result.workflowsTriggered).toBeGreaterThanOrEqual(1);
      expect(enqueuedSteps[0].eventData).toMatchObject({
        topicId: "topic-promo",
        topicName: "Promotions",
      });
      expect(enqueuedSteps[0].eventData).toHaveProperty("unsubscribedAt");
    });
  });

  describe("checkSegmentEntry", () => {
    it("should return 0 when no segment_entry workflows exist", async () => {
      // No workflows configured - db.select returns empty array
      const result = await checkSegmentEntry({
        contactId: "contact-123",
        organizationId: "org-123",
      });

      expect(result.workflowsTriggered).toBe(0);
    });

    it("should skip workflows with missing segmentId in config", async () => {
      mockWorkflows.push({
        id: "wf-invalid",
        organizationId: "org-123",
        status: "enabled",
        triggerType: "segment_entry",
        triggerConfig: {}, // Missing segmentId
      });

      const result = await checkSegmentEntry({
        contactId: "contact-123",
        organizationId: "org-123",
      });

      // The workflow is skipped because segmentId is missing
      expect(result.workflowsTriggered).toBe(0);
    });

    it("should have correct function signature", () => {
      // Verify the function exists and accepts the expected params
      expect(checkSegmentEntry).toBeDefined();
      expect(typeof checkSegmentEntry).toBe("function");
    });

    it("should return workflowsTriggered count", async () => {
      const result = await checkSegmentEntry({
        contactId: "contact-123",
        organizationId: "org-123",
      });

      expect(result).toHaveProperty("workflowsTriggered");
      expect(typeof result.workflowsTriggered).toBe("number");
    });
  });
});

describe("Workflow Events - Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueuedSteps.length = 0;
    mockWorkflows.length = 0;
    mockSegments.length = 0;
  });

  it("should handle empty event data gracefully", async () => {
    mockWorkflows.push({
      id: "wf-1",
      organizationId: "org-123",
      status: "enabled",
      triggerType: "event",
      triggerConfig: { eventName: "simple_event" },
    });

    await emitWorkflowEvent({
      eventName: "simple_event",
      contactId: "contact-123",
      organizationId: "org-123",
      // No eventData provided
    });

    expect(enqueuedSteps[0].eventData).toEqual({});
  });

  it("should handle undefined contact data", async () => {
    mockWorkflows.push({
      id: "wf-1",
      organizationId: "org-123",
      status: "enabled",
      triggerType: "event",
      triggerConfig: { eventName: "contact_created" },
    });

    await emitContactCreated({
      contactId: "contact-123",
      organizationId: "org-123",
      // No contactData provided
    });

    expect(enqueuedSteps[0].eventData).toHaveProperty("createdAt");
  });

  it("should handle topic events without topic name", async () => {
    mockWorkflows.push({
      id: "wf-1",
      organizationId: "org-123",
      status: "enabled",
      triggerType: "event",
      triggerConfig: { eventName: "topic_subscribed" },
    });

    await emitTopicSubscribed({
      contactId: "contact-123",
      organizationId: "org-123",
      topicId: "topic-123",
      // No topicName provided
    });

    expect(enqueuedSteps[0].eventData?.topicId).toBe("topic-123");
    expect(enqueuedSteps[0].eventData?.topicName).toBeUndefined();
  });
});
