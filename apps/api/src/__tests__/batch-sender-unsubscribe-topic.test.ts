/**
 * Batch Sender — Per-Topic Unsubscribe Token Tests
 *
 * Verifies that the List-Unsubscribe one-click token scopes to a topic when
 * the batch audience is topic-based, and stays global otherwise.
 *
 * Context: Apple Mail / Gmail's one-click unsubscribe POSTs the
 * List-Unsubscribe URL. The route handler in routes/unsubscribe.ts branches
 * on whether the token carries a tid — with tid it unsubscribes only that
 * contactTopic, without tid it globally unsubscribes the contact. This test
 * locks in that batch-sender passes tid through for audienceType="topic".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockContext } from "./__helpers__/lambda-context";

// Every command the SES client is asked to send, so a test can assert on the
// real payload (headers and template data) a recipient would get.
const { sesCommands } = vi.hoisted(() => ({
  sesCommands: [] as Array<Record<string, unknown>>,
}));

const generateUnsubscribeTokenMock = vi.fn(
  async (
    _contactId: string,
    _organizationId: string,
    _topicId?: string
  ): Promise<string> => "mock-token"
);

vi.mock("@aws-sdk/client-sesv2", () => {
  function GetAccountCommand(input: unknown) {
    return input;
  }
  function SendBulkEmailCommand(input: unknown) {
    return input;
  }
  return {
    SESv2Client: class {
      send(command: Record<string, unknown>) {
        sesCommands.push(command);
        return Promise.resolve({
          SendQuota: { MaxSendRate: 14 },
          BulkEmailEntryResults: [
            { Status: "SUCCESS", MessageId: "msg-1" },
            { Status: "SUCCESS", MessageId: "msg-2" },
          ],
        });
      }
    },
    GetAccountCommand,
    SendBulkEmailCommand,
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
  generateUnsubscribeToken: generateUnsubscribeTokenMock,
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

let selectCallIndex = 0;
let selectResults: unknown[][] = [];
let mockClaimReturning: Array<{ contactId: string }> = [];

// countBroadcastRecipients is called on chunk 0 by the audience-snapshot
// recount (plan 169); mocked directly rather than going through the real
// @wraps/db implementation, which would hit a real DB. Default resolves 2,
// matching makeBatch()'s default totalRecipients used by every test here.
const countBroadcastRecipientsMock = vi.fn().mockResolvedValue(2);

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");

  function thenable(rows: unknown[]) {
    const obj: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) =>
        Promise.resolve(rows).then(resolve),
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
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockImplementation(() => Promise.resolve(mockClaimReturning)),
          }),
        }),
      }),
    },
    sql: (...args: unknown[]) => args,
    countBroadcastRecipients: countBroadcastRecipientsMock,
  };
});

process.env.BATCH_QUEUE_URL =
  "https://sqs.us-east-1.amazonaws.com/123456789012/queue";
// Recipient-facing link bases have no platform fallback — the worker throws
// unless the deployment configures its own URLs.
process.env.API_BASE_URL = "https://api.test.local";

const { handler } = await import("../workers/batch-sender");

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

function setupSelects(
  batch: Record<string, unknown>,
  emailType: "marketing" | "transactional" = "marketing"
) {
  const contacts = makeContacts();
  mockClaimReturning = contacts.map((c) => ({ contactId: c.id }));

  const awsAccountFeatures = [{}];
  const template = [
    {
      sesTemplateName: "wraps-tmpl-1",
      compiledHtml: "<p>Hi</p>",
      emailType,
    },
  ];
  const org = [{ name: "Test Org" }];

  // getContactsChunk select order:
  //   topic   — db.select() for correlated subquery (exists()), then contacts
  //   segment — segment row lookup (1 select), then contacts
  //   all     — contacts only
  if (batch.audienceType === "topic") {
    selectResults = [
      [batch],
      [], // contactTopic correlated subquery (db.select() is called to build it; slot consumed)
      contacts,
      awsAccountFeatures,
      template,
      org,
    ];
  } else if (batch.audienceType === "segment") {
    selectResults = [
      [batch],
      [
        {
          id: "seg-1",
          condition: {
            logic: "AND",
            groups: [
              {
                // Must be a real operator: a condition that compiles to no SQL
                // now fails closed and returns zero contacts.
                filters: [{ field: "email", operator: "exists" }],
              },
            ],
          },
        },
      ],
      contacts,
      awsAccountFeatures,
      template,
      org,
    ];
  } else {
    selectResults = [[batch], contacts, awsAccountFeatures, template, org];
  }
}

describe("Batch sender unsubscribe token scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateUnsubscribeTokenMock.mockClear();
    selectCallIndex = 0;
    sesCommands.length = 0;
    selectResults = [];
    mockClaimReturning = [];
    countBroadcastRecipientsMock.mockClear();
    countBroadcastRecipientsMock.mockResolvedValue(2);
  });

  it("passes topicId to generateUnsubscribeToken when audienceType=topic", async () => {
    setupSelects(
      makeBatch({ audienceType: "topic", topicId: "topic-newsletter" })
    );

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(generateUnsubscribeTokenMock).toHaveBeenCalled();
    for (const call of generateUnsubscribeTokenMock.mock.calls) {
      expect(call[0]).toMatch(/^contact-/);
      expect(call[1]).toBe("org-1");
      expect(call[2]).toBe("topic-newsletter");
    }
  });

  it("omits topicId when audienceType=all (global unsubscribe)", async () => {
    setupSelects(makeBatch({ audienceType: "all", topicId: null }));

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(generateUnsubscribeTokenMock).toHaveBeenCalled();
    for (const call of generateUnsubscribeTokenMock.mock.calls) {
      expect(call[2]).toBeUndefined();
    }
  });

  it("omits topicId when audienceType=segment (global unsubscribe)", async () => {
    setupSelects(
      makeBatch({ audienceType: "segment", segmentId: "seg-1", topicId: null })
    );

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(generateUnsubscribeTokenMock).toHaveBeenCalled();
    for (const call of generateUnsubscribeTokenMock.mock.calls) {
      expect(call[2]).toBeUndefined();
    }
  });
});

type BulkEntry = {
  Destination: { ToAddresses: string[] };
  ReplacementHeaders?: Array<{ Name: string; Value: string }>;
  ReplacementEmailContent?: {
    ReplacementTemplate?: { ReplacementTemplateData?: string };
  };
};

function sentEntries(): BulkEntry[] {
  return sesCommands.flatMap(
    (c) => (c.BulkEmailEntries as BulkEntry[] | undefined) ?? []
  );
}

describe("every broadcast carries an unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateUnsubscribeTokenMock.mockClear();
    selectCallIndex = 0;
    sesCommands.length = 0;
    selectResults = [];
    mockClaimReturning = [];
    countBroadcastRecipientsMock.mockClear();
    countBroadcastRecipientsMock.mockResolvedValue(2);
  });

  function expectOneClickUnsubscribe(entry: BulkEntry) {
    const headers = entry.ReplacementHeaders ?? [];
    const listUnsubscribe = headers.find((h) => h.Name === "List-Unsubscribe");
    const post = headers.find((h) => h.Name === "List-Unsubscribe-Post");

    expect(listUnsubscribe?.Value).toBe(
      "<https://api.test.local/unsubscribe/mock-token>"
    );
    expect(post?.Value).toBe("List-Unsubscribe=One-Click");

    const data = JSON.parse(
      entry.ReplacementEmailContent?.ReplacementTemplate
        ?.ReplacementTemplateData ?? "{}"
    );
    expect(data.unsubscribeUrl).toBe(
      "https://api.test.local/unsubscribe/mock-token"
    );
    expect(String(data.preferencesUrl)).toContain("/preferences/mock-token");
  }

  it("an all-contacts broadcast gives every recipient a one-click unsubscribe and link variables", async () => {
    setupSelects(makeBatch({ audienceType: "all", topicId: null }));

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    const entries = sentEntries();
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expectOneClickUnsubscribe(entry);
    }
  });

  it("the token is global for an all-contacts broadcast, so it removes the contact from everything", async () => {
    setupSelects(makeBatch({ audienceType: "all", topicId: null }));

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(generateUnsubscribeTokenMock).toHaveBeenCalledTimes(2);
    for (const call of generateUnsubscribeTokenMock.mock.calls) {
      expect(call[1]).toBe("org-1");
      expect(call[2]).toBeUndefined();
    }
  });

  it("a template typed transactional still gets an unsubscribe when it is broadcast", async () => {
    setupSelects(
      makeBatch({ audienceType: "all", topicId: null }),
      "transactional"
    );

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    const entries = sentEntries();
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expectOneClickUnsubscribe(entry);
    }
  });
});
