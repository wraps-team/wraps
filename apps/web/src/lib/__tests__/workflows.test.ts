/**
 * Unit tests for workflow utility functions
 */

import type { Workflow } from "@wraps/db";
import { describe, expect, it } from "vitest";

import {
  getStepCount,
  getTriggerDescription,
  WORKFLOW_STATUS_COLORS,
  WORKFLOW_STATUS_LABELS,
} from "../(ee)/workflows";

// Helper to create a mock workflow
function createMockWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: "wf-1",
    name: "Test Workflow",
    description: null,
    status: "draft",
    triggerType: "event",
    triggerConfig: { eventName: "signup" },
    allowReentry: false,
    reentryDelaySeconds: null,
    canvasViewport: { x: 0, y: 0, zoom: 1 },
    organizationId: "org-1",
    awsAccountId: null,
    topicId: null,
    maxConcurrentExecutions: 1000,
    contactCooldownSeconds: null,
    totalExecutions: 0,
    activeExecutions: 0,
    completedExecutions: 0,
    failedExecutions: 0,
    droppedExecutions: 0,
    aiGenerated: false,
    aiPrompt: null,
    defaultFrom: null,
    defaultFromName: null,
    defaultReplyTo: null,
    defaultSenderId: null,
    slug: null,
    sourceTs: null,
    sourceHash: null,
    pushedFromCli: false,
    lastPushedAt: null,
    cliProjectPath: null,
    lastEditedFrom: null,
    version: 1,
    lastTriggeredAt: null,
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    steps: [],
    transitions: [],
    ...overrides,
  };
}

describe("WORKFLOW_STATUS_LABELS", () => {
  it("should have labels for all statuses", () => {
    expect(WORKFLOW_STATUS_LABELS.draft).toBe("Draft");
    expect(WORKFLOW_STATUS_LABELS.enabled).toBe("Enabled");
    expect(WORKFLOW_STATUS_LABELS.paused).toBe("Paused");
    expect(WORKFLOW_STATUS_LABELS.archived).toBe("Archived");
  });
});

describe("WORKFLOW_STATUS_COLORS", () => {
  it("should have colors for all statuses", () => {
    expect(WORKFLOW_STATUS_COLORS.draft).toContain("text-foreground");
    expect(WORKFLOW_STATUS_COLORS.enabled).toContain("text-success");
    expect(WORKFLOW_STATUS_COLORS.paused).toContain("text-warning");
    expect(WORKFLOW_STATUS_COLORS.archived).toContain("text-muted-foreground");
  });
});

describe("getStepCount", () => {
  it("should return 0 for workflow with no steps", () => {
    const workflow = createMockWorkflow({ steps: [] });
    expect(getStepCount(workflow)).toBe(0);
  });

  it("should exclude trigger from step count", () => {
    const workflow = createMockWorkflow({
      steps: [
        {
          type: "trigger",
          name: "Start",
          id: "1",
          position: { x: 0, y: 0 },
          config: { type: "trigger", triggerType: "event" },
        },
      ],
    });
    expect(getStepCount(workflow)).toBe(0);
  });

  it("should count action steps", () => {
    const workflow = createMockWorkflow({
      steps: [
        {
          type: "trigger",
          name: "Start",
          id: "1",
          position: { x: 0, y: 0 },
          config: { type: "trigger", triggerType: "event" },
        },
        {
          type: "send_email",
          name: "Email",
          id: "2",
          position: { x: 0, y: 100 },
          config: { type: "send_email", templateId: "tmpl-1" },
        },
        {
          type: "delay",
          name: "Wait",
          id: "3",
          position: { x: 0, y: 200 },
          config: { type: "delay", amount: 1, unit: "days" },
        },
        {
          type: "exit",
          name: "End",
          id: "4",
          position: { x: 0, y: 300 },
          config: { type: "exit" },
        },
      ],
    });
    expect(getStepCount(workflow)).toBe(3); // send_email, delay, exit
  });

  it("should count condition and webhook steps", () => {
    const workflow = createMockWorkflow({
      steps: [
        {
          type: "trigger",
          name: "Start",
          id: "1",
          position: { x: 0, y: 0 },
          config: { type: "trigger", triggerType: "event" },
        },
        {
          type: "condition",
          name: "Check",
          id: "2",
          position: { x: 0, y: 100 },
          config: {
            type: "condition",
            field: "email",
            operator: "contains",
            value: "@",
          },
        },
        {
          type: "webhook",
          name: "API Call",
          id: "3",
          position: { x: 0, y: 200 },
          config: {
            type: "webhook",
            url: "https://example.com",
            method: "POST",
          },
        },
      ],
    });
    expect(getStepCount(workflow)).toBe(2);
  });
});

describe("getTriggerDescription", () => {
  it("should describe contact_created trigger", () => {
    const workflow = createMockWorkflow({
      triggerType: "contact_created",
      triggerConfig: {},
    });
    expect(getTriggerDescription(workflow)).toBe("When contact is created");
  });

  it("should describe contact_updated trigger", () => {
    const workflow = createMockWorkflow({
      triggerType: "contact_updated",
      triggerConfig: {},
    });
    expect(getTriggerDescription(workflow)).toBe("When contact is updated");
  });

  it("should describe event trigger with event name", () => {
    const workflow = createMockWorkflow({
      triggerType: "event",
      triggerConfig: { eventName: "purchase_completed" },
    });
    expect(getTriggerDescription(workflow)).toBe(
      'When "purchase_completed" occurs'
    );
  });

  it("should describe event trigger without event name", () => {
    const workflow = createMockWorkflow({
      triggerType: "event",
      triggerConfig: {},
    });
    expect(getTriggerDescription(workflow)).toBe(
      "Custom event (not configured)"
    );
  });

  it("should describe segment_entry trigger", () => {
    const workflow = createMockWorkflow({
      triggerType: "segment_entry",
      triggerConfig: {},
    });
    expect(getTriggerDescription(workflow)).toBe("When contact enters segment");
  });

  it("should describe segment_exit trigger", () => {
    const workflow = createMockWorkflow({
      triggerType: "segment_exit",
      triggerConfig: {},
    });
    expect(getTriggerDescription(workflow)).toBe("When contact exits segment");
  });

  it("should describe schedule trigger with cron", () => {
    const workflow = createMockWorkflow({
      triggerType: "schedule",
      triggerConfig: { schedule: "0 9 * * *" },
    });
    expect(getTriggerDescription(workflow)).toBe("On schedule: 0 9 * * *");
  });

  it("should describe schedule trigger without cron", () => {
    const workflow = createMockWorkflow({
      triggerType: "schedule",
      triggerConfig: {},
    });
    expect(getTriggerDescription(workflow)).toBe("Scheduled (not configured)");
  });

  it("should describe api trigger", () => {
    const workflow = createMockWorkflow({
      triggerType: "api",
      triggerConfig: {},
    });
    expect(getTriggerDescription(workflow)).toBe("Manual API trigger");
  });

  it("should describe topic_subscribed trigger with topic name", () => {
    const workflow = createMockWorkflow({
      triggerType: "topic_subscribed",
      // Runtime code accesses topicName but type only has topicId
      triggerConfig: { topicName: "Newsletter" } as unknown as Record<
        string,
        unknown
      >,
    });
    expect(getTriggerDescription(workflow)).toBe(
      'When subscribed to "Newsletter"'
    );
  });

  it("should describe topic_subscribed trigger without topic name", () => {
    const workflow = createMockWorkflow({
      triggerType: "topic_subscribed",
      triggerConfig: {},
    });
    expect(getTriggerDescription(workflow)).toBe("When subscribed to topic");
  });

  it("should describe topic_unsubscribed trigger with topic name", () => {
    const workflow = createMockWorkflow({
      triggerType: "topic_unsubscribed",
      // Runtime code accesses topicName but type only has topicId
      triggerConfig: { topicName: "Newsletter" } as unknown as Record<
        string,
        unknown
      >,
    });
    expect(getTriggerDescription(workflow)).toBe(
      'When unsubscribed from "Newsletter"'
    );
  });

  it("should describe topic_unsubscribed trigger without topic name", () => {
    const workflow = createMockWorkflow({
      triggerType: "topic_unsubscribed",
      triggerConfig: {},
    });
    expect(getTriggerDescription(workflow)).toBe(
      "When unsubscribed from topic"
    );
  });

  it("should handle unknown trigger type", () => {
    const workflow = createMockWorkflow({
      triggerType: "unknown_type" as never,
      triggerConfig: {},
    });
    expect(getTriggerDescription(workflow)).toBe("Unknown trigger");
  });

  it("should handle null triggerConfig", () => {
    const workflow = createMockWorkflow({
      triggerType: "event",
      triggerConfig: null,
    });
    expect(getTriggerDescription(workflow)).toBe(
      "Custom event (not configured)"
    );
  });
});
