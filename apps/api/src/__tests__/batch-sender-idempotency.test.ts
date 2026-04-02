/**
 * Batch Sender Idempotency Tests
 *
 * Verifies that SQS retry of the same chunk does not send duplicate emails.
 * The batch-sender must skip contacts that already have a messageSend record
 * for the given batchId, and use onConflictDoNothing as a safety net.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Track SES calls to verify no duplicate sends
const sesSendCalls: unknown[][] = [];
let sesBulkCallCount = 0;

vi.mock("@aws-sdk/client-sesv2", () => {
  function GetAccountCommand(this: unknown, input: unknown) {
    return input;
  }
  function SendBulkEmailCommand(this: unknown, input: unknown) {
    return input;
  }
  function SendEmailCommand(this: unknown, input: unknown) {
    return input;
  }
  return {
    SESv2Client: class {
      send(...args: unknown[]) {
        sesSendCalls.push(args);
        sesBulkCallCount++;
        return Promise.resolve({
          SendQuota: { MaxSendRate: 14 },
          BulkEmailEntryResults: [
            { Status: "SUCCESS", MessageId: `msg-${sesBulkCallCount}-1` },
            { Status: "SUCCESS", MessageId: `msg-${sesBulkCallCount}-2` },
          ],
        });
      }
    },
    GetAccountCommand,
    SendBulkEmailCommand,
    SendEmailCommand,
  };
});

vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    send = vi.fn().mockResolvedValue({});
  },
  // biome-ignore lint: mock constructor
  SendMessageCommand: function SendMessageCommand(input: unknown) {
    return input;
  },
}));

vi.mock("@react-email/render", () => ({
  toPlainText: vi.fn().mockReturnValue("plain text"),
}));

vi.mock("../services/credentials", () => ({
  getCredentials: vi.fn().mockResolvedValue({
    accessKeyId: "AKIA-test",
    secretAccessKey: "secret-test",
    sessionToken: "token-test",
    expiration: new Date("2099-01-01"),
    region: "us-east-1",
  }),
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailSent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/unsubscribe-token", () => ({
  generateUnsubscribeToken: vi.fn().mockResolvedValue("mock-token"),
}));

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  flushLogger: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./variable-mappings", () => ({
  applyVariableMappings: vi
    .fn()
    .mockImplementation((data: Record<string, string>) => data),
}));

// ─────────────────────────────────────────────────────────────────────────────
// DB mock — tracks insert calls and supports alreadySent filtering
// ─────────────────────────────────────────────────────────────────────────────

let selectCallIndex = 0;
let selectResults: unknown[][] = [];
const updateSetCalls: Record<string, unknown>[] = [];

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");

  // Helper: make a value that is both thenable (resolves to rows) and chainable
  function thenable(rows: unknown[]) {
    const obj: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve),
      limit: vi.fn().mockImplementation(() => thenable(rows)),
      orderBy: vi.fn().mockImplementation(() => thenable(rows)),
    };
    return obj;
  }

  return {
    ...actual,
    db: {
      select: vi.fn().mockImplementation(() => {
        const rows = selectResults[selectCallIndex] ?? [];
        selectCallIndex += 1;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => thenable(rows)),
          }),
        };
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
          updateSetCalls.push(values);
          return {
            where: vi.fn().mockResolvedValue(undefined),
          };
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        })),
      }),
    },
    sql: (...args: unknown[]) => args,
  };
});

const { handler } = await import("../workers/batch-sender");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    organizationId: "org-1",
    status: "queued",
    audienceType: "all",
    topicId: null,
    segmentId: null,
    emailTemplateId: "tmpl-1",
    htmlContent: null,
    subject: "Test Subject",
    from: "sender@example.com",
    fromName: "Sender",
    replyTo: null,
    totalRecipients: 2,
    processedRecipients: 0,
    sent: 0,
    failed: 0,
    variableMappings: null,
    ...overrides,
  };
}

function makeContacts() {
  return [
    {
      id: "contact-1",
      email: "alice@example.com",
      phone: null,
      firstName: "Alice",
      lastName: "A",
      company: null,
      jobTitle: null,
      properties: {},
      createdAt: new Date("2026-01-15T10:00:00Z"),
    },
    {
      id: "contact-2",
      email: "bob@example.com",
      phone: null,
      firstName: "Bob",
      lastName: "B",
      company: null,
      jobTitle: null,
      properties: {},
      createdAt: new Date("2026-01-15T11:00:00Z"),
    },
  ];
}

function makeSQSEvent() {
  return {
    Records: [
      {
        body: JSON.stringify({
          batchId: "batch-1",
          organizationId: "org-1",
          awsAccountId: "aws-1",
          channel: "email",
          chunkIndex: 0,
        }),
        messageId: "sqs-msg-1",
        receiptHandle: "handle-1",
        attributes: {} as never,
        messageAttributes: {},
        md5OfBody: "",
        eventSource: "aws:sqs",
        eventSourceARN: "arn:aws:sqs:us-east-1:123:queue",
        awsRegion: "us-east-1",
      },
    ],
  };
}

/**
 * DB select call order in processJob:
 * 1. batchSend record
 * 2. contacts (getContactsChunk)
 * 3. template (Promise.all)
 * 4. organization (Promise.all)
 * 5. alreadySent contactIds (dedup query)
 *
 * Note: orgExt select only runs when batch.from is null (not in these tests).
 */
function setupSelects(opts: {
  batch: Record<string, unknown>;
  contacts?: unknown[];
  alreadySentContactIds?: string[];
}) {
  selectResults = [
    // 1. batch
    [opts.batch],
    // 2. contacts chunk
    opts.contacts ?? makeContacts(),
    // 3. template
    [{ sesTemplateName: "wraps-tmpl-1", compiledHtml: "<p>Hi</p>", emailType: "marketing" }],
    // 4. organization
    [{ name: "Test Org" }],
    // 5. already-sent contact IDs for dedup
    (opts.alreadySentContactIds ?? []).map((id) => ({ contactId: id })),
  ];
}

describe("Batch sender idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sesSendCalls.length = 0;
    sesBulkCallCount = 0;
    selectCallIndex = 0;
    selectResults = [];
    updateSetCalls.length = 0;
  });

  it("skips contacts that already have send records for this batch (SQS retry)", async () => {
    // Simulate: contact-1 was already sent in a previous invocation
    setupSelects({
      batch: makeBatch(),
      alreadySentContactIds: ["contact-1"],
    });

    await handler(makeSQSEvent(), {} as never, vi.fn());

    // SES should only be called for contact-2 (not contact-1)
    expect(sesSendCalls).toHaveLength(2); // GetAccount + 1 bulk send
    const bulkCall = sesSendCalls[1]?.[0] as Record<string, unknown> | undefined;
    const entries = bulkCall?.BulkEmailEntries as Array<Record<string, unknown>> | undefined;
    expect(entries).toHaveLength(1);

    const progressUpdate = updateSetCalls.find(
      (call) => "processedRecipients" in call
    );
    const processedExpr = progressUpdate?.processedRecipients;
    expect(Array.isArray(processedExpr)).toBe(true);
    expect((processedExpr as unknown[]).at(-1)).toBe(1);
  });

  it("skips entire chunk when all contacts already sent", async () => {
    setupSelects({
      batch: makeBatch(),
      alreadySentContactIds: ["contact-1", "contact-2"],
    });

    await handler(makeSQSEvent(), {} as never, vi.fn());

    // Only GetAccount call, no bulk send
    const bulkSendCalls = sesSendCalls.filter(
      (call) => (call[0] as Record<string, unknown>)?.BulkEmailEntries !== undefined
    );
    expect(bulkSendCalls).toHaveLength(0);

    const progressUpdate = updateSetCalls.find(
      (call) => "processedRecipients" in call
    );
    const processedExpr = progressUpdate?.processedRecipients;
    expect(Array.isArray(processedExpr)).toBe(true);
    expect((processedExpr as unknown[]).at(-1)).toBe(0);
  });

  it("sends to all contacts when none have been sent yet (first invocation)", async () => {
    setupSelects({
      batch: makeBatch(),
      alreadySentContactIds: [],
    });

    await handler(makeSQSEvent(), {} as never, vi.fn());

    // SES bulk send should include both contacts
    const bulkCall = sesSendCalls[1]?.[0] as Record<string, unknown> | undefined;
    const entries = bulkCall?.BulkEmailEntries as Array<Record<string, unknown>> | undefined;
    expect(entries).toHaveLength(2);

    const progressUpdate = updateSetCalls.find(
      (call) => "processedRecipients" in call
    );
    const processedExpr = progressUpdate?.processedRecipients;
    expect(Array.isArray(processedExpr)).toBe(true);
    expect((processedExpr as unknown[]).at(-1)).toBe(2);
  });
});
