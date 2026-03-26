import { beforeEach, describe, expect, it, vi } from "vitest";

let selectCallCount = 0;
const updateSetCalls: Array<Record<string, unknown>> = [];

const batchRow = {
  id: "batch-sms-1",
  organizationId: "org-1",
  status: "queued",
  audienceType: "all",
  topicId: null,
  segmentId: null,
  emailTemplateId: null,
  htmlContent: null,
  subject: null,
  from: null,
  fromName: null,
  replyTo: null,
  totalRecipients: 5000,
  processedRecipients: 0,
  sent: 0,
  failed: 0,
  variableMappings: null,
};

const contactRows = [
  {
    id: "contact-1",
    email: null,
    phone: "+15551234567",
    firstName: "SMS",
    lastName: "User",
    company: null,
    jobTitle: null,
    properties: {},
    createdAt: new Date("2026-01-15T10:00:00Z"),
  },
];

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class MockSESv2Client {
    send = vi.fn();
  },
  GetAccountCommand: class {
    constructor(public input: unknown) {}
  },
  SendBulkEmailCommand: class {
    constructor(public input: unknown) {}
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class MockSQSClient {
    send = vi.fn().mockResolvedValue({});
  },
  SendMessageCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock("@react-email/render", () => ({
  toPlainText: vi.fn().mockReturnValue("plain text"),
}));

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");

  return {
    ...actual,
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation(() => {
          if (selectCallCount === 0) {
            selectCallCount += 1;
            return {
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([batchRow]),
              }),
            };
          }

          return {
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(contactRows),
              }),
            }),
          };
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
          updateSetCalls.push(values);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };
});

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
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  flushLogger: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./variable-mappings", () => ({
  applyVariableMappings: vi
    .fn()
    .mockImplementation((data: Record<string, string>) => data),
}));

const { handler } = await import("../workers/batch-sender");
const { getCredentials } = await import("../services/credentials");

describe("batch-sender unsupported channel handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallCount = 0;
    updateSetCalls.length = 0;
  });

  it("marks SMS batch jobs as failed instead of completing silently", async () => {
    const event = {
      Records: [
        {
          body: JSON.stringify({
            batchId: "batch-sms-1",
            organizationId: "org-1",
            awsAccountId: "aws-account-1",
            channel: "sms",
            chunkIndex: 0,
          }),
          messageId: "msg-1",
          receiptHandle: "handle-1",
          attributes: {} as never,
          messageAttributes: {},
          md5OfBody: "",
          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:queue",
          awsRegion: "us-east-1",
        },
      ],
    };

    await handler(event, {} as never, () => {});

    const failedUpdate = updateSetCalls.find(
      (values) => values.status === "failed"
    );

    expect(failedUpdate).toBeDefined();
    expect(failedUpdate?.errorMessage).toBe("Unsupported batch channel: sms");
    expect(failedUpdate?.failed).toBe(5000);
    expect(failedUpdate?.processedRecipients).toBe(5000);

    // Guard fires before any state mutation — batch should never hit "processing"
    const processingUpdate = updateSetCalls.find(
      (values) => values.status === "processing"
    );
    expect(processingUpdate).toBeUndefined();

    expect(vi.mocked(getCredentials)).not.toHaveBeenCalled();
  });
});
