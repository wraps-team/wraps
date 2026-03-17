/**
 * Workflow Processor Step Handler Tests
 *
 * Tests individual step handlers via `handler(type:"execute")` and direct
 * import for exported helpers. Covers: processStep edge cases, send_email,
 * send_sms, delay, condition, update_contact, wait_for_email_engagement,
 * subscribe_topic, unsubscribe_topic.
 */

import type { SQSEvent } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock data factories
// ─────────────────────────────────────────────────────────────────────────────

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: "exec-1",
    workflowId: "wf-1",
    contactId: "contact-1",
    organizationId: "org-1",
    status: "active",
    currentStepId: "step-1",
    triggerData: {},
    startedAt: new Date(),
    completedAt: null,
    error: null,
    errorStepId: null,
    allowReentry: false,
    waitingForEvent: null,
    waitTimeoutAt: null,
    waitTimeoutSchedulerName: null,
    delaySchedulerName: null,
    nextStepScheduledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-1",
    email: "test@example.com",
    phone: null,
    firstName: "Test",
    lastName: "User",
    company: null,
    jobTitle: null,
    organizationId: "org-1",
    emailStatus: "active",
    status: "active",
    properties: {},
    preferredChannel: null,
    ...overrides,
  };
}

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    organizationId: "org-1",
    name: "Test Workflow",
    status: "enabled",
    triggerType: "event",
    triggerConfig: {},
    awsAccountId: "aws-1",
    allowReentry: false,
    reentryDelaySeconds: null,
    contactCooldownSeconds: null,
    maxConcurrentExecutions: null,
    steps: [
      { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
      {
        id: "step-1",
        type: "webhook",
        config: {
          type: "webhook",
          url: "https://hook.example.com",
          method: "POST",
          headers: {},
          body: {},
        },
      },
    ],
    transitions: [
      {
        id: "t1",
        fromStepId: "trigger-1",
        toStepId: "step-1",
        condition: null,
      },
    ],
    defaultFrom: "noreply@test.com",
    defaultFromName: "Test",
    defaultReplyTo: null,
    defaultSenderId: null,
    totalExecutions: 0,
    activeExecutions: 0,
    completedExecutions: 0,
    failedExecutions: 0,
    droppedExecutions: 0,
    lastTriggeredAt: null,
    ...overrides,
  };
}

function makeSQSEvent(...bodies: Record<string, unknown>[]): SQSEvent {
  return {
    Records: bodies.map((body, i) => ({
      messageId: `msg-${i}`,
      receiptHandle: `rh-${i}`,
      body: JSON.stringify(body),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "0",
        SenderId: "test",
        ApproximateFirstReceiveTimestamp: "0",
      },
      messageAttributes: {},
      md5OfBody: "",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:us-east-1:000:test",
      awsRegion: "us-east-1",
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockEnqueueWorkflowStep = vi.fn();
const mockEnqueueWorkflowStepBatch = vi.fn();
const mockScheduleWaitTimeout = vi.fn().mockResolvedValue("sched-wait-123");
const mockScheduleWorkflowStep = vi.fn().mockResolvedValue("sched-step-123");
const mockDeleteScheduledStep = vi.fn();
const mockCreateNextWorkflowSchedule = vi.fn();
const mockFetch = vi.fn();

// Track SES/SMS send calls via constructor capture
const sesSendCalls: unknown[][] = [];
const smsSendCalls: unknown[][] = [];

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();
const mockDbTransaction = vi.fn();
const mockDbQueryWorkflowExecution = { findFirst: vi.fn() };

mockDbTransaction.mockImplementation(async (callback: Function) =>
  callback({
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
  })
);

vi.mock("@aws-sdk/client-sesv2", () => {
  class MockSESv2Client {
    send(...args: unknown[]) {
      sesSendCalls.push(args);
      return Promise.resolve({ MessageId: "ses-msg-1" });
    }
  }
  // biome-ignore lint: constructor returns input for pass-through
  function SendEmailCommand(this: unknown, input: unknown) {
    return input;
  }
  return { SESv2Client: MockSESv2Client, SendEmailCommand };
});

vi.mock("@aws-sdk/client-pinpoint-sms-voice-v2", () => {
  class MockPinpointSMSVoiceV2Client {
    send(...args: unknown[]) {
      smsSendCalls.push(args);
      return Promise.resolve({ MessageId: "sms-msg-1" });
    }
  }
  // biome-ignore lint: constructor returns input for pass-through
  function SendTextMessageCommand(this: unknown, input: unknown) {
    return input;
  }
  return {
    PinpointSMSVoiceV2Client: MockPinpointSMSVoiceV2Client,
    SendTextMessageCommand,
  };
});

vi.mock("@react-email/render", () => ({
  toPlainText: vi.fn().mockReturnValue("plain text fallback"),
}));

vi.mock("@wraps/email", () => ({
  generateSESTemplateName: vi.fn().mockReturnValue("ses-tmpl-name"),
  transformVariablesForSes: vi.fn((s: string) => s),
  upsertSESTemplate: vi.fn(),
}));

vi.mock("handlebars", () => ({
  default: {
    compile: vi
      .fn()
      .mockReturnValue(
        (data: Record<string, string>) => `compiled:${JSON.stringify(data)}`
      ),
  },
}));

vi.mock("../../lib/activation-tracking", () => ({
  trackFirstEmailSent: vi.fn(),
}));

vi.mock("../../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  flushLogger: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/unsubscribe-token", () => ({
  generateUnsubscribeToken: vi.fn().mockReturnValue("mock-token"),
}));

vi.mock("../../services/credentials", () => ({
  getCredentials: vi.fn().mockResolvedValue({
    accessKeyId: "AKIA",
    secretAccessKey: "secret",
    sessionToken: "tok",
  }),
}));

vi.mock("../../services/workflow-queue", () => ({
  enqueueWorkflowStep: mockEnqueueWorkflowStep,
  enqueueWorkflowStepBatch: mockEnqueueWorkflowStepBatch,
  scheduleWaitTimeout: mockScheduleWaitTimeout,
  scheduleWorkflowStep: mockScheduleWorkflowStep,
  deleteScheduledStep: mockDeleteScheduledStep,
}));

vi.mock("../../services/workflow-scheduler", () => ({
  createNextWorkflowSchedule: mockCreateNextWorkflowSchedule,
}));

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");
  return {
    ...actual,
    db: {
      select: mockDbSelect,
      update: mockDbUpdate,
      insert: mockDbInsert,
      transaction: mockDbTransaction,
      query: { workflowExecution: mockDbQueryWorkflowExecution },
    },
    contactIdsMatchingCondition: vi.fn().mockResolvedValue([]),
    sql: (strings: TemplateStringsArray, ..._values: unknown[]) => ({
      sql: strings.join("?"),
    }),
  };
});

const mockDnsLookup = vi
  .fn()
  .mockResolvedValue({ address: "93.184.216.34", family: 4 });
vi.mock("node:dns/promises", () => ({
  default: { lookup: mockDnsLookup },
  lookup: mockDnsLookup,
}));

vi.stubGlobal("fetch", mockFetch);

const { handler, handleUpdateContact, handleWaitForEmailEngagement } =
  await import("../workers/workflow-processor");

const { trackFirstEmailSent: mockTrackFirstEmailSent } = await import(
  "../../lib/activation-tracking"
);

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function setupProcessStep(opts: {
  execution?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  stepExecStatus?: string;
}) {
  const exec = makeExecution(opts.execution);
  const wf = makeWorkflow(opts.workflow);
  const ct = makeContact(opts.contact);

  mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(exec);

  let selectCallCount = 0;
  mockDbSelect.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([wf]),
          }),
        }),
      };
    }
    if (selectCallCount === 2) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([ct]),
          }),
        }),
      };
    }
    // Default for step-handler-specific selects
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
  });

  // Simulate ON CONFLICT ... WHERE behavior:
  // - "executing" (first claim): returns the new row
  // - "completed" or "already_executing": WHERE rejects → empty RETURNING
  const isBlocked =
    opts.stepExecStatus === "completed" ||
    opts.stepExecStatus === "already_executing";
  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(
          isBlocked
            ? []
            : [
                {
                  id: "se-1",
                  status: "executing",
                  idempotencyKey: `${exec.id}-${exec.currentStepId}`,
                },
              ]
        ),
      }),
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([exec]),
      }),
    }),
  });

  return { exec, wf, ct };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
  sesSendCalls.length = 0;
  smsSendCalls.length = 0;
  mockDbTransaction.mockImplementation(async (callback: Function) =>
    callback({
      select: mockDbSelect,
      update: mockDbUpdate,
      insert: mockDbInsert,
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 1: processStep edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe("processStep edge cases", () => {
  const executeJob = (stepId = "step-1") => ({
    type: "execute" as const,
    executionId: "exec-1",
    stepId,
    organizationId: "org-1",
  });

  it("returns early when execution not found", async () => {
    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(null);
    await handler(makeSQSEvent(executeJob()));
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns early when execution completed", async () => {
    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(
      makeExecution({ status: "completed" })
    );
    await handler(makeSQSEvent(executeJob()));
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns early when execution cancelled", async () => {
    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(
      makeExecution({ status: "cancelled" })
    );
    await handler(makeSQSEvent(executeJob()));
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("fails execution when contact not found", async () => {
    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(makeExecution());
    let selectCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCount++;
      if (selectCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([makeWorkflow()]),
            }),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
    });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeExecution()]),
        }),
      }),
    });
    await handler(makeSQSEvent(executeJob()));
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("fails execution when step not in workflow", async () => {
    setupProcessStep({});
    await handler(makeSQSEvent(executeJob("nonexistent-step")));
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("skips when step already completed (idempotency)", async () => {
    setupProcessStep({ stepExecStatus: "completed" });
    await handler(makeSQSEvent(executeJob()));
    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("skips when step already executing (concurrent race condition)", async () => {
    // Simulate: another SQS message already claimed this step.
    // ON CONFLICT ... WHERE status NOT IN ('executing','completed') fails,
    // so RETURNING gives back an empty array.
    const exec = makeExecution();
    const wf = makeWorkflow();
    const ct = makeContact();

    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(exec);

    let selectCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCount++;
      if (selectCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([wf]),
            }),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([ct]),
          }),
        }),
      };
    });

    // ON CONFLICT WHERE clause rejects → empty RETURNING
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([exec]),
        }),
      }),
    });

    mockFetch.mockResolvedValue({ status: 200, ok: true });

    const result = await handler(makeSQSEvent(executeJob()));

    // Step should NOT be executed — no fetch, no enqueue
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
    // Should return SUCCESS (graceful skip), not a batchItemFailure
    expect(result.batchItemFailures).toEqual([]);
  });

  it("completes execution on exit step", async () => {
    setupProcessStep({
      workflow: {
        steps: [
          { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
          { id: "step-1", type: "exit", config: { type: "exit" } },
        ],
      },
      execution: { currentStepId: "step-1" },
    });
    await handler(makeSQSEvent(executeJob()));
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("fails execution when step handler throws", async () => {
    setupProcessStep({
      workflow: {
        steps: [
          { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
          {
            id: "step-1",
            type: "webhook",
            config: {
              type: "webhook",
              url: "https://hook.example.com",
              method: "POST",
            },
          },
        ],
      },
    });
    mockFetch.mockRejectedValue(new Error("Network error"));
    await handler(makeSQSEvent(executeJob()));
    expect(mockFetch).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 2: handleSendEmail
// ═══════════════════════════════════════════════════════════════════════════

describe("handleSendEmail", () => {
  const emailStep = {
    id: "step-email",
    type: "send_email",
    config: {
      type: "send_email",
      templateId: "tmpl-1",
      from: null,
      fromName: null,
      replyTo: null,
    },
  };

  const emailJob = {
    type: "execute" as const,
    executionId: "exec-1",
    stepId: "step-email",
    organizationId: "org-1",
  };

  function setupEmailTest(
    opts: {
      contact?: Record<string, unknown>;
      execution?: Record<string, unknown>;
      workflow?: Record<string, unknown>;
      template?: Record<string, unknown> | null;
    } = {}
  ) {
    const exec = makeExecution({
      currentStepId: "step-email",
      ...opts.execution,
    });
    const ct = makeContact(opts.contact);
    const wf = makeWorkflow({
      steps: [
        { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
        emailStep,
      ],
      transitions: [
        {
          id: "t1",
          fromStepId: "trigger-1",
          toStepId: "step-email",
          condition: null,
        },
      ],
      ...opts.workflow,
    });

    const defaultTemplate = {
      id: "tmpl-1",
      name: "Welcome",
      subject: "Hello {{firstName}}",
      compiledHtml: "<h1>Hi {{firstName}}</h1>",
      emailType: "marketing",
      sesTemplateName: "ses-tmpl-1",
    };

    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(exec);

    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      const chain = (rows: unknown[]) => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      });

      switch (selectCallCount) {
        case 1:
          return chain([wf]);
        case 2:
          return chain([ct]);
        case 3:
          return chain([
            {
              awsAccountId: wf.awsAccountId,
              defaultFrom: wf.defaultFrom,
              defaultFromName: wf.defaultFromName,
              defaultReplyTo: wf.defaultReplyTo,
            },
          ]);
        case 4:
          return chain([{ region: "us-east-1" }]);
        case 5:
          return opts.template === null
            ? chain([])
            : chain([opts.template || defaultTemplate]);
        case 6:
          return chain([{ name: "Test Org" }]);
        default:
          return chain([]);
      }
    });

    let insertCallCount = 0;
    mockDbInsert.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: "se-1",
                  status: "executing",
                  idempotencyKey: "exec-1-step-email",
                },
              ]),
            }),
          }),
        };
      }
      return { values: vi.fn().mockResolvedValue(undefined) };
    });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([exec]),
        }),
      }),
    });

    return { exec, wf, ct };
  }

  it("skips when contact has no email", async () => {
    setupEmailTest({ contact: { email: null } });
    await handler(makeSQSEvent(emailJob));
    expect(sesSendCalls).toHaveLength(0);
  });

  it("skips when contact bounced", async () => {
    setupEmailTest({ contact: { emailStatus: "bounced" } });
    await handler(makeSQSEvent(emailJob));
    expect(sesSendCalls).toHaveLength(0);
  });

  it("skips when contact unsubscribed", async () => {
    setupEmailTest({ contact: { emailStatus: "unsubscribed" } });
    await handler(makeSQSEvent(emailJob));
    expect(sesSendCalls).toHaveLength(0);
  });

  it("skips when no AWS account configured", async () => {
    setupEmailTest();
    // Override 3rd select to return no awsAccountId
    const origImpl = mockDbSelect.getMockImplementation()!;
    let count = 0;
    mockDbSelect.mockImplementation((...args: unknown[]) => {
      count++;
      if (count === 3) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ awsAccountId: null }]),
            }),
          }),
        };
      }
      return origImpl(...args);
    });
    await handler(makeSQSEvent(emailJob));
    expect(sesSendCalls).toHaveLength(0);
  });

  it("throws when template not found", async () => {
    setupEmailTest({ template: null });
    await handler(makeSQSEvent(emailJob));
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("throws when template has no compiledHtml", async () => {
    setupEmailTest({
      template: {
        id: "tmpl-1",
        name: "Welcome",
        subject: "Hello",
        compiledHtml: null,
        emailType: "marketing",
        sesTemplateName: null,
      },
    });
    await handler(makeSQSEvent(emailJob));
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("sends via SES template when sesTemplateName exists", async () => {
    setupEmailTest();
    await handler(makeSQSEvent(emailJob));
    expect(sesSendCalls).toHaveLength(1);
    const sendInput = sesSendCalls[0][0] as Record<string, unknown>;
    const content = sendInput.Content as Record<string, unknown>;
    expect(content.Template).toBeDefined();
    expect((content.Template as Record<string, unknown>).TemplateName).toBe(
      "ses-tmpl-1"
    );
  });

  it("auto-publishes template then sends via SES template", async () => {
    const { upsertSESTemplate } = await import("@wraps/email");
    (upsertSESTemplate as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      undefined
    );

    setupEmailTest({
      template: {
        id: "tmpl-1",
        name: "Welcome",
        subject: "Hello {{firstName}}",
        compiledHtml: "<h1>Hi {{firstName}}</h1>",
        emailType: "marketing",
        sesTemplateName: null,
      },
    });

    await handler(makeSQSEvent(emailJob));
    expect(upsertSESTemplate).toHaveBeenCalled();
    expect(sesSendCalls).toHaveLength(1);
    const content = (sesSendCalls[0][0] as Record<string, unknown>)
      .Content as Record<string, unknown>;
    expect(content.Template).toBeDefined();
  });

  it("falls back to raw HTML when auto-publish fails", async () => {
    const { upsertSESTemplate } = await import("@wraps/email");
    (upsertSESTemplate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("SES error")
    );

    setupEmailTest({
      template: {
        id: "tmpl-1",
        name: "Welcome",
        subject: "Hello {{firstName}}",
        compiledHtml: "<h1>Hi {{firstName}}</h1>",
        emailType: "marketing",
        sesTemplateName: null,
      },
    });

    await handler(makeSQSEvent(emailJob));
    expect(sesSendCalls).toHaveLength(1);
    const content = (sesSendCalls[0][0] as Record<string, unknown>)
      .Content as Record<string, unknown>;
    expect(content.Simple).toBeDefined();
  });

  it("adds List-Unsubscribe headers for marketing", async () => {
    setupEmailTest();
    await handler(makeSQSEvent(emailJob));
    const content = (sesSendCalls[0][0] as Record<string, unknown>)
      .Content as Record<string, unknown>;
    const tmplContent = content.Template as Record<string, unknown>;
    const headers = tmplContent.Headers as Array<{
      Name: string;
      Value: string;
    }>;
    expect(headers).toBeDefined();
    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ Name: "List-Unsubscribe" }),
        expect.objectContaining({ Name: "List-Unsubscribe-Post" }),
      ])
    );
  });

  it("no unsubscribe headers for transactional", async () => {
    setupEmailTest({
      template: {
        id: "tmpl-1",
        name: "Welcome",
        subject: "Hello",
        compiledHtml: "<h1>Hi</h1>",
        emailType: "transactional",
        sesTemplateName: "ses-tmpl-1",
      },
    });
    await handler(makeSQSEvent(emailJob));
    const content = (sesSendCalls[0][0] as Record<string, unknown>)
      .Content as Record<string, unknown>;
    const tmplContent = content.Template as Record<string, unknown>;
    const templateData = JSON.parse(tmplContent.TemplateData as string) as Record<
      string,
      unknown
    >;
    expect(templateData.unsubscribeUrl).toBe(
      "https://api.wraps.dev/unsubscribe/mock-token"
    );
    expect(templateData.preferencesUrl).toBe(
      "https://app.wraps.dev/preferences/mock-token"
    );
    expect(tmplContent.Headers).toBeUndefined();
  });

  it("records messageSend and updates contact metrics", async () => {
    setupEmailTest();
    await handler(makeSQSEvent(emailJob));
    expect(mockDbInsert).toHaveBeenCalledTimes(2);
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("includes trigger data and properties in replacement data", async () => {
    setupEmailTest({
      execution: {
        triggerData: { source: "api", plan: "pro" },
        currentStepId: "step-email",
      },
      contact: { firstName: "Jane", properties: { tier: "gold" } },
    });
    await handler(makeSQSEvent(emailJob));
    expect(sesSendCalls).toHaveLength(1);
    const content = (sesSendCalls[0][0] as Record<string, unknown>)
      .Content as Record<string, unknown>;
    const tmplContent = content.Template as Record<string, unknown>;
    const templateData = JSON.parse(tmplContent.TemplateData as string);
    expect(templateData.firstName).toBe("Jane");
    expect(templateData.tier).toBe("gold");
    expect(templateData.source).toBe("api");
    expect(templateData.plan).toBe("pro");
  });

  it("uses step-level subject override instead of template subject", async () => {
    const overrideStep = {
      ...emailStep,
      config: {
        ...emailStep.config,
        subject: "Custom: {{firstName}}, check this out",
      },
    };
    setupEmailTest({
      contact: { firstName: "Jane" },
      workflow: {
        steps: [
          { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
          overrideStep,
        ],
      },
    });
    await handler(makeSQSEvent(emailJob));
    expect(sesSendCalls).toHaveLength(1);
    const content = (sesSendCalls[0][0] as Record<string, unknown>)
      .Content as Record<string, unknown>;
    // Subject override forces raw HTML path even when SES template exists
    expect(content.Simple).toBeDefined();
    expect(content.Template).toBeUndefined();
  });

  it("passes contactEmail to trackFirstEmailSent", async () => {
    setupEmailTest({ contact: { email: "workflow-user@example.com" } });
    await handler(makeSQSEvent(emailJob));
    expect(mockTrackFirstEmailSent).toHaveBeenCalledWith(
      "org-1",
      { channel: "email", source: "workflow" },
      "workflow-user@example.com"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 3: handleSendSms
// ═══════════════════════════════════════════════════════════════════════════

describe("handleSendSms", () => {
  const smsStep = {
    id: "step-sms",
    type: "send_sms",
    config: { type: "send_sms", body: "Hello from Wraps!", senderId: null },
  };

  const smsJob = {
    type: "execute" as const,
    executionId: "exec-1",
    stepId: "step-sms",
    organizationId: "org-1",
  };

  function setupSmsTest(
    opts: {
      contact?: Record<string, unknown>;
      workflow?: Record<string, unknown>;
      smsConfig?: Record<string, unknown>;
    } = {}
  ) {
    const step = {
      ...smsStep,
      config: { ...smsStep.config, ...opts.smsConfig },
    };
    const exec = makeExecution({ currentStepId: "step-sms" });
    const ct = makeContact({ phone: "+15551234567", ...opts.contact });
    const wf = makeWorkflow({
      steps: [
        { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
        step,
      ],
      transitions: [
        {
          id: "t1",
          fromStepId: "trigger-1",
          toStepId: "step-sms",
          condition: null,
        },
      ],
      ...opts.workflow,
    });

    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(exec);

    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      const chain = (rows: unknown[]) => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      });
      switch (selectCallCount) {
        case 1:
          return chain([wf]);
        case 2:
          return chain([ct]);
        case 3:
          return chain([
            {
              awsAccountId: wf.awsAccountId,
              defaultSenderId: wf.defaultSenderId,
            },
          ]);
        case 4:
          return chain([{ region: "us-east-1" }]);
        default:
          return chain([]);
      }
    });

    let insertCallCount = 0;
    mockDbInsert.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        // Step execution insert with onConflictDoUpdate
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: "se-1",
                  status: "executing",
                  idempotencyKey: "exec-1-step-sms",
                },
              ]),
            }),
          }),
        };
      }
      // messageSend insert (plain insert, no conflict handler)
      return {
        values: vi.fn().mockResolvedValue(undefined),
      };
    });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([exec]),
        }),
      }),
    });
  }

  it("skips when no phone", async () => {
    setupSmsTest({ contact: { phone: null } });
    await handler(makeSQSEvent(smsJob));
    expect(smsSendCalls).toHaveLength(0);
  });

  it("skips when invalid E.164", async () => {
    setupSmsTest({ contact: { phone: "555-bad" } });
    await handler(makeSQSEvent(smsJob));
    expect(smsSendCalls).toHaveLength(0);
  });

  it("skips when no AWS account", async () => {
    setupSmsTest();
    const origImpl = mockDbSelect.getMockImplementation()!;
    let count = 0;
    mockDbSelect.mockImplementation((...args: unknown[]) => {
      count++;
      if (count === 3) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ awsAccountId: null }]),
            }),
          }),
        };
      }
      return origImpl(...args);
    });
    await handler(makeSQSEvent(smsJob));
    expect(smsSendCalls).toHaveLength(0);
  });

  it("skips when no message body", async () => {
    setupSmsTest({ smsConfig: { body: "" } });
    await handler(makeSQSEvent(smsJob));
    expect(smsSendCalls).toHaveLength(0);
  });

  it("sends with senderId from config", async () => {
    setupSmsTest({ smsConfig: { senderId: "MyBrand" } });
    await handler(makeSQSEvent(smsJob));
    expect(smsSendCalls).toHaveLength(1);
    const input = smsSendCalls[0][0] as Record<string, unknown>;
    expect(input.OriginationIdentity).toBe("MyBrand");
  });

  it("happy path: sends with variable substitution and updates metrics", async () => {
    setupSmsTest();
    await handler(makeSQSEvent(smsJob));
    expect(smsSendCalls).toHaveLength(1);
    const input = smsSendCalls[0][0] as Record<string, unknown>;
    expect(input.DestinationPhoneNumber).toBe("+15551234567");
    // Body passed through Handlebars substituteVariables (mock returns "compiled:...")
    const body = input.MessageBody as string;
    expect(body).toContain("test@example.com");
    expect(body).toContain("Test"); // firstName
    expect(input.ConfigurationSetName).toBe("wraps-sms-config");
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("normalizes dot-notation variables via transformVariablesForSes", async () => {
    const { transformVariablesForSes } = await import("@wraps/email");
    setupSmsTest({ smsConfig: { body: "Hello {{contact.firstName}}" } });
    await handler(makeSQSEvent(smsJob));
    expect(smsSendCalls).toHaveLength(1);
    expect(transformVariablesForSes).toHaveBeenCalledWith(
      "Hello {{contact.firstName}}"
    );
  });

  it("normalizes fallback syntax via transformVariablesForSes", async () => {
    const { transformVariablesForSes } = await import("@wraps/email");
    setupSmsTest({ smsConfig: { body: "Hi {{firstName|there}}" } });
    await handler(makeSQSEvent(smsJob));
    expect(smsSendCalls).toHaveLength(1);
    expect(transformVariablesForSes).toHaveBeenCalledWith(
      "Hi {{firstName|there}}"
    );
  });

  it("normalizes mixed variable formats before substitution", async () => {
    const { transformVariablesForSes } = await import("@wraps/email");
    const body = "Hi {{contact.firstName|there}}, email: {{email}}";
    setupSmsTest({ smsConfig: { body } });
    await handler(makeSQSEvent(smsJob));
    expect(smsSendCalls).toHaveLength(1);
    expect(transformVariablesForSes).toHaveBeenCalledWith(body);
  });

  it("records SMS send in messageSend table", async () => {
    setupSmsTest();
    await handler(makeSQSEvent(smsJob));
    expect(smsSendCalls).toHaveLength(1);

    // Verify db.insert was called for messageSend (second insert call after step execution)
    const insertCalls = mockDbInsert.mock.calls;
    // First insert = step execution, subsequent inserts = messageSend
    expect(insertCalls.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 4: handleDelay
// ═══════════════════════════════════════════════════════════════════════════

describe("handleDelay", () => {
  const delayJob = {
    type: "execute" as const,
    executionId: "exec-1",
    stepId: "step-delay",
    organizationId: "org-1",
  };

  function setupDelayTest(unit: string, amount: number, hasNextStep = true) {
    const delayStep = {
      id: "step-delay",
      type: "delay",
      config: { type: "delay", unit, amount },
    };
    const transitions = hasNextStep
      ? [
          {
            id: "t1",
            fromStepId: "trigger-1",
            toStepId: "step-delay",
            condition: null,
          },
          {
            id: "t2",
            fromStepId: "step-delay",
            toStepId: "step-next",
            condition: null,
          },
        ]
      : [
          {
            id: "t1",
            fromStepId: "trigger-1",
            toStepId: "step-delay",
            condition: null,
          },
        ];

    const exec = makeExecution({ currentStepId: "step-delay" });
    const wf = makeWorkflow({
      steps: [
        { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
        delayStep,
        {
          id: "step-next",
          type: "webhook",
          config: { type: "webhook", url: "https://x.com", method: "POST" },
        },
      ],
      transitions,
    });
    const ct = makeContact();

    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(exec);

    // processStep prelude: workflow, contact
    // handleDelay: workflow (again) for transitions
    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      const chain = (rows: unknown[]) => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      });
      switch (selectCallCount) {
        case 1:
          return chain([wf]);
        case 2:
          return chain([ct]);
        case 3:
          return chain([wf]); // handleDelay reloads workflow
        default:
          return chain([]);
      }
    });

    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "se-1",
              status: "executing",
              idempotencyKey: "exec-1-step-delay",
            },
          ]),
        }),
      }),
    });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([exec]),
        }),
      }),
    });
  }

  it("converts minutes to seconds", async () => {
    setupDelayTest("minutes", 5);
    await handler(makeSQSEvent(delayJob));
    expect(mockScheduleWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ delaySeconds: 300 })
    );
  });

  it("converts hours to seconds", async () => {
    setupDelayTest("hours", 2);
    await handler(makeSQSEvent(delayJob));
    expect(mockScheduleWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ delaySeconds: 7200 })
    );
  });

  it("converts days to seconds", async () => {
    setupDelayTest("days", 1);
    await handler(makeSQSEvent(delayJob));
    expect(mockScheduleWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ delaySeconds: 86_400 })
    );
  });

  it("completes execution when no next transition", async () => {
    setupDelayTest("minutes", 5, false);
    await handler(makeSQSEvent(delayJob));
    expect(mockScheduleWorkflowStep).not.toHaveBeenCalled();
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("schedules next step and pauses execution", async () => {
    setupDelayTest("hours", 1);
    await handler(makeSQSEvent(delayJob));
    expect(mockScheduleWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: "exec-1",
        stepId: "step-next",
        organizationId: "org-1",
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 5: handleCondition
// ═══════════════════════════════════════════════════════════════════════════

describe("handleCondition", () => {
  const conditionJob = {
    type: "execute" as const,
    executionId: "exec-1",
    stepId: "step-cond",
    organizationId: "org-1",
  };

  function setupConditionTest(
    condConfig: Record<string, unknown>,
    contact: Record<string, unknown> = {},
    execution: Record<string, unknown> = {},
    stepOverrides: Record<string, unknown> = {}
  ) {
    const condStep = {
      id: "step-cond",
      type: "condition",
      config: { type: "condition", ...condConfig },
      ...stepOverrides,
    };

    setupProcessStep({
      execution: { currentStepId: "step-cond", ...execution },
      contact,
      workflow: {
        steps: [
          { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
          condStep,
          {
            id: "step-yes",
            type: "webhook",
            config: { type: "webhook", url: "https://x.com", method: "POST" },
          },
          {
            id: "step-no",
            type: "webhook",
            config: { type: "webhook", url: "https://y.com", method: "POST" },
          },
        ],
        transitions: [
          {
            id: "t1",
            fromStepId: "trigger-1",
            toStepId: "step-cond",
            condition: null,
          },
          {
            id: "t2",
            fromStepId: "step-cond",
            toStepId: "step-yes",
            condition: { branch: "yes" },
          },
          {
            id: "t3",
            fromStepId: "step-cond",
            toStepId: "step-no",
            condition: { branch: "no" },
          },
        ],
      },
    });
  }

  it("reads from contact first-class field", async () => {
    setupConditionTest(
      { field: "firstName", operator: "equals", value: "Jane" },
      { firstName: "Jane" }
    );
    await handler(makeSQSEvent(conditionJob));
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-yes" })
    );
  });

  it("reads from contact.properties", async () => {
    setupConditionTest(
      { field: "tier", operator: "equals", value: "gold" },
      { properties: { tier: "gold" } }
    );
    await handler(makeSQSEvent(conditionJob));
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-yes" })
    );
  });

  it("strips properties. prefix when looking up custom properties", async () => {
    setupConditionTest(
      { field: "properties.plan", operator: "equals", value: "pro" },
      { properties: { plan: "pro" } }
    );
    await handler(makeSQSEvent(conditionJob));
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-yes" })
    );
  });

  it("strips properties. prefix and takes no branch when value differs", async () => {
    setupConditionTest(
      { field: "properties.plan", operator: "equals", value: "enterprise" },
      { properties: { plan: "pro" } }
    );
    await handler(makeSQSEvent(conditionJob));
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-no" })
    );
  });

  it("reads from triggerData", async () => {
    setupConditionTest(
      { field: "source", operator: "equals", value: "api" },
      {},
      { triggerData: { source: "api" } }
    );
    await handler(makeSQSEvent(conditionJob));
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-yes" })
    );
  });

  it("returns no when field not found", async () => {
    setupConditionTest(
      { field: "nonexistent", operator: "equals", value: "anything" },
      {}
    );
    await handler(makeSQSEvent(conditionJob));
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-no" })
    );
  });

  it("strips contact. prefix to read first-class field", async () => {
    setupConditionTest(
      { field: "contact.firstName", operator: "equals", value: "Jane" },
      { firstName: "Jane" }
    );
    await handler(makeSQSEvent(conditionJob));
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-yes" })
    );
  });

  it("strips contact.properties. prefix to read custom property", async () => {
    setupConditionTest(
      {
        field: "contact.properties.onboardingPath",
        operator: "equals",
        value: "start_building",
      },
      { properties: { onboardingPath: "start_building" } }
    );
    await handler(makeSQSEvent(conditionJob));
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-yes" })
    );
  });

  it("strips contact. prefix for is_true on custom property", async () => {
    setupConditionTest(
      { field: "contact.hasConnectedAws", operator: "is_true" },
      { properties: { hasConnectedAws: true } }
    );
    await handler(makeSQSEvent(conditionJob));
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-yes" })
    );
  });

  it("cascade engagement: opened -> yes", async () => {
    setupConditionTest(
      { field: "engagement.status", operator: "equals", value: "true" },
      {},
      {},
      { cascadeGroupId: "cascade-1" }
    );
    const origImpl = mockDbSelect.getMockImplementation()!;
    let count = 0;
    mockDbSelect.mockImplementation((...args: unknown[]) => {
      count++;
      if (count === 3) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ branch: "opened" }]),
              }),
              limit: vi.fn().mockResolvedValue([{ branch: "opened" }]),
            }),
          }),
        };
      }
      return origImpl(...args);
    });
    await handler(makeSQSEvent(conditionJob));
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-yes" })
    );
  });

  it("cascade engagement: timeout -> no", async () => {
    setupConditionTest(
      { field: "engagement.status", operator: "equals", value: "true" },
      {},
      {},
      { cascadeGroupId: "cascade-1" }
    );
    const origImpl = mockDbSelect.getMockImplementation()!;
    let count = 0;
    mockDbSelect.mockImplementation((...args: unknown[]) => {
      count++;
      if (count === 3) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ branch: "timeout" }]),
              }),
              limit: vi.fn().mockResolvedValue([{ branch: "timeout" }]),
            }),
          }),
        };
      }
      return origImpl(...args);
    });
    await handler(makeSQSEvent(conditionJob));
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-no" })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 6: handleUpdateContact (direct import)
// ═══════════════════════════════════════════════════════════════════════════

describe("handleUpdateContact", () => {
  it("sets first-class field (firstName)", async () => {
    const ct = makeContact({ firstName: "Old" });
    const config = {
      type: "update_contact" as const,
      updates: [
        { field: "firstName", operation: "set" as const, value: "New" },
      ],
    };
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const result = await handleUpdateContact(config as never, ct as never);
    expect(result.action).toBe("next");
    const setArg = mockDbUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.firstName).toBe("New");
  });

  it("sets custom property", async () => {
    const ct = makeContact({ properties: {} });
    const config = {
      type: "update_contact" as const,
      updates: [{ field: "tier", operation: "set" as const, value: "gold" }],
    };
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const result = await handleUpdateContact(config as never, ct as never);
    expect(result.action).toBe("next");
    const setArg = mockDbUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.properties.tier).toBe("gold");
  });

  it("unsets first-class field", async () => {
    const ct = makeContact({ firstName: "Old" });
    const config = {
      type: "update_contact" as const,
      updates: [{ field: "firstName", operation: "unset" as const }],
    };
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    await handleUpdateContact(config as never, ct as never);
    const setArg = mockDbUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.firstName).toBeNull();
  });

  it("unsets custom property", async () => {
    const ct = makeContact({ properties: { tier: "gold" } });
    const config = {
      type: "update_contact" as const,
      updates: [{ field: "tier", operation: "unset" as const }],
    };
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    await handleUpdateContact(config as never, ct as never);
    const setArg = mockDbUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.properties.tier).toBeUndefined();
  });

  it("increments property", async () => {
    const ct = makeContact({ properties: { score: 10 } });
    const config = {
      type: "update_contact" as const,
      updates: [{ field: "score", operation: "increment" as const, value: 5 }],
    };
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    await handleUpdateContact(config as never, ct as never);
    const setArg = mockDbUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.properties.score).toBe(15);
  });

  it("decrements property", async () => {
    const ct = makeContact({ properties: { score: 10 } });
    const config = {
      type: "update_contact" as const,
      updates: [{ field: "score", operation: "decrement" as const, value: 3 }],
    };
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    await handleUpdateContact(config as never, ct as never);
    const setArg = mockDbUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.properties.score).toBe(7);
  });

  it("appends to array", async () => {
    const ct = makeContact({ properties: { tags: ["a"] } });
    const config = {
      type: "update_contact" as const,
      updates: [{ field: "tags", operation: "append" as const, value: "b" }],
    };
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    await handleUpdateContact(config as never, ct as never);
    const setArg = mockDbUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.properties.tags).toEqual(["a", "b"]);
  });

  it("removes from array", async () => {
    const ct = makeContact({ properties: { tags: ["a", "b", "c"] } });
    const config = {
      type: "update_contact" as const,
      updates: [{ field: "tags", operation: "remove" as const, value: "b" }],
    };
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    await handleUpdateContact(config as never, ct as never);
    const setArg = mockDbUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.properties.tags).toEqual(["a", "c"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 7: handleWaitForEmailEngagement (direct import)
// ═══════════════════════════════════════════════════════════════════════════

describe("handleWaitForEmailEngagement", () => {
  const makeEngConfig = (timeout?: number) => ({
    type: "wait_for_email_engagement" as const,
    timeoutSeconds: timeout,
  });

  it("finds messageId from previous send_email step", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                result: { messageId: "msg-abc" },
                stepId: "cascade-1-send-0",
              },
            ]),
          }),
        }),
      }),
    });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const exec = makeExecution();
    const step = {
      id: "step-wait",
      type: "wait_for_email_engagement",
      config: makeEngConfig(),
      cascadeGroupId: "cascade-1",
    };
    const result = await handleWaitForEmailEngagement(
      makeEngConfig() as never,
      exec as never,
      step as never,
      "org-1"
    );
    expect(result.action).toBe("wait");
    expect(mockScheduleWaitTimeout).toHaveBeenCalled();
    const setCall = mockDbUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.waitingForEvent).toContain("msg-abc");
  });

  it("uses unknown when no previous send step", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const exec = makeExecution();
    const step = {
      id: "step-wait",
      type: "wait_for_email_engagement",
      config: makeEngConfig(),
    };
    await handleWaitForEmailEngagement(
      makeEngConfig() as never,
      exec as never,
      step as never,
      "org-1"
    );
    const setCall = mockDbUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.waitingForEvent).toContain("unknown");
  });

  it("uses default 3-day timeout", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const exec = makeExecution();
    const step = {
      id: "step-wait",
      type: "wait_for_email_engagement",
      config: makeEngConfig(),
    };
    await handleWaitForEmailEngagement(
      makeEngConfig() as never,
      exec as never,
      step as never,
      "org-1"
    );
    expect(mockScheduleWaitTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutSeconds: 259_200 })
    );
  });

  it("scopes by cascadeGroupId", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const exec = makeExecution();
    const step = {
      id: "step-wait",
      type: "wait_for_email_engagement",
      config: makeEngConfig(),
      cascadeGroupId: "cascade-5",
    };
    await handleWaitForEmailEngagement(
      makeEngConfig() as never,
      exec as never,
      step as never,
      "org-1"
    );
    expect(mockDbSelect).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 8: Topic handlers
// ═══════════════════════════════════════════════════════════════════════════

describe("Topic handlers", () => {
  it("subscribeTopic upserts contact-topic", async () => {
    const subscribeStep = {
      id: "step-sub",
      type: "subscribe_topic",
      config: { type: "subscribe_topic", topicId: "topic-1", channel: "email" },
    };
    setupProcessStep({
      execution: { currentStepId: "step-sub" },
      workflow: {
        steps: [
          { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
          subscribeStep,
        ],
        transitions: [
          {
            id: "t1",
            fromStepId: "trigger-1",
            toStepId: "step-sub",
            condition: null,
          },
        ],
      },
    });
    let insertCallCount = 0;
    mockDbInsert.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([{ id: "se-1", status: "executing" }]),
            }),
          }),
        };
      }
      return {
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      };
    });
    await handler(
      makeSQSEvent({
        type: "execute",
        executionId: "exec-1",
        stepId: "step-sub",
        organizationId: "org-1",
      })
    );
    expect(mockDbInsert).toHaveBeenCalledTimes(2);
  });

  it("unsubscribeTopic updates status", async () => {
    const unsubStep = {
      id: "step-unsub",
      type: "unsubscribe_topic",
      config: {
        type: "unsubscribe_topic",
        topicId: "topic-1",
        channel: "email",
      },
    };
    setupProcessStep({
      execution: { currentStepId: "step-unsub" },
      workflow: {
        steps: [
          { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
          unsubStep,
        ],
        transitions: [
          {
            id: "t1",
            fromStepId: "trigger-1",
            toStepId: "step-unsub",
            condition: null,
          },
        ],
      },
    });
    await handler(
      makeSQSEvent({
        type: "execute",
        executionId: "exec-1",
        stepId: "step-unsub",
        organizationId: "org-1",
      })
    );
    expect(mockDbUpdate).toHaveBeenCalled();
  });
});
