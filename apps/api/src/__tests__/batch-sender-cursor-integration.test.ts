/**
 * Batch Sender - Cursor Passing Integration Tests
 *
 * Tests that processJob extracts the cursor from the last contact
 * and includes it in the SQS message for the next chunk.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture SQS SendMessageCommand calls
const sqsSendCalls: Array<{ MessageBody: string; DelaySeconds?: number }> = [];

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = vi.fn().mockResolvedValue({
      SendQuota: { MaxSendRate: 14 },
      BulkEmailEntryResults: Array.from({ length: 50 }, (_, i) => ({
        Status: "SUCCESS",
        MessageId: `msg-${i}`,
      })),
    });
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
  SQSClient: class {
    send = vi.fn().mockImplementation((cmd: { input: unknown }) => {
      sqsSendCalls.push(
        cmd.input as { MessageBody: string; DelaySeconds?: number }
      );
      return Promise.resolve({});
    });
  },
  SendMessageCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock("@react-email/render", () => ({
  toPlainText: vi.fn().mockReturnValue("plain text"),
}));

const contactCreatedAt = new Date("2026-01-15T10:00:00Z");

// Build 50 contacts so the chunk is "full" and triggers next chunk enqueue
const mockContacts = Array.from({ length: 50 }, (_, i) => ({
  id: `contact-${i}`,
  email: `user-${i}@example.com`,
  phone: null,
  firstName: `User${i}`,
  lastName: null,
  company: null,
  jobTitle: null,
  properties: {},
  createdAt: new Date(contactCreatedAt.getTime() + i * 1000),
}));
const lastContact = mockContacts.at(-1)!;

function getTableName(table: unknown): string {
  if (
    table &&
    typeof table === "object" &&
    Symbol.for("drizzle:Name") in table
  ) {
    return (table as Record<symbol, string>)[Symbol.for("drizzle:Name")];
  }
  if (typeof table === "object" && table !== null && "_" in table) {
    return (table as { _: { name: string } })._.name;
  }
  return "unknown";
}

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");

  return {
    ...actual,
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation((table: unknown) => {
          const name = getTableName(table);

          if (name === "batch_send") {
            return {
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: "batch-1",
                    organizationId: "org-1",
                    status: "pending",
                    audienceType: "all",
                    topicId: null,
                    segmentId: null,
                    emailTemplateId: "tmpl-1",
                    from: "test@example.com",
                    fromName: "Test",
                    replyTo: null,
                    subject: "Hello",
                    htmlContent: null,
                    totalRecipients: 100,
                    processedRecipients: 0,
                    sent: 0,
                    failed: 0,
                    variableMappings: null,
                  },
                ]),
              }),
            };
          }

          if (name === "template") {
            return {
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    sesTemplateName: "wraps-tmpl-1",
                    compiledHtml: null,
                    emailType: "marketing",
                  },
                ]),
              }),
            };
          }

          if (name === "organization") {
            return {
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ name: "Test Org" }]),
              }),
            };
          }

          // Contact query: .where().orderBy().limit()
          return {
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(mockContacts),
              }),
            }),
          };
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    },
    sql: (...args: unknown[]) => args,
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

// Must set before import — QUEUE_URL is captured at module load
process.env.BATCH_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/queue";

const { handler } = await import("../workers/batch-sender");

function makeSQSEvent(job: Record<string, unknown>) {
  return {
    Records: [
      {
        body: JSON.stringify(job),
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
}

describe("processJob cursor passing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqsSendCalls.length = 0;
    process.env.BATCH_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/queue";
  });

  it("includes cursor from last contact in next chunk SQS message", async () => {
    const event = makeSQSEvent({
      batchId: "batch-1",
      organizationId: "org-1",
      awsAccountId: "aws-1",
      channel: "email",
      chunkIndex: 0,
    });

    await handler(event, {} as never, () => {});

    // Should have enqueued a next chunk
    expect(sqsSendCalls.length).toBe(1);

    const nextJob = JSON.parse(sqsSendCalls[0].MessageBody);
    expect(nextJob.chunkIndex).toBe(1);
    expect(nextJob.cursor).toEqual({
      createdAt: lastContact.createdAt.toISOString(),
      id: lastContact.id,
    });
  });

  it("completes batch when chunk returns fewer than CHUNK_SIZE contacts", async () => {
    // Return only 10 contacts (less than 50 = CHUNK_SIZE)
    const shortChunkContacts = mockContacts.slice(0, 10);
    const { db } = await import("@wraps/db");

    // Override contact query to return short chunk
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockImplementation((table: unknown) => {
        const name = getTableName(table);

        if (name === "batch_send") {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "batch-1",
                  organizationId: "org-1",
                  status: "processing",
                  audienceType: "all",
                  topicId: null,
                  segmentId: null,
                  emailTemplateId: "tmpl-1",
                  from: "test@example.com",
                  fromName: "Test",
                  replyTo: null,
                  subject: "Hello",
                  htmlContent: null,
                  totalRecipients: 100,
                  processedRecipients: 50,
                  sent: 50,
                  failed: 0,
                  variableMappings: null,
                },
              ]),
            }),
          };
        }

        if (name === "template") {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  sesTemplateName: "wraps-tmpl-1",
                  compiledHtml: null,
                  emailType: "marketing",
                },
              ]),
            }),
          };
        }

        if (name === "organization") {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ name: "Test Org" }]),
            }),
          };
        }

        // Contact query returns short chunk (10 < 50)
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(shortChunkContacts),
            }),
          }),
        };
      }),
    });

    sqsSendCalls.length = 0;

    const event = makeSQSEvent({
      batchId: "batch-1",
      organizationId: "org-1",
      awsAccountId: "aws-1",
      channel: "email",
      chunkIndex: 1,
      cursor: {
        createdAt: mockContacts[49].createdAt.toISOString(),
        id: mockContacts[49].id,
      },
    });

    await handler(event, {} as never, () => {});

    // Should NOT enqueue another chunk
    expect(sqsSendCalls.length).toBe(0);

    // Should have called update to mark batch completed
    expect(db.update).toHaveBeenCalled();
  });

  it("stops at totalRecipients even when more contacts are now available", async () => {
    const { db } = await import("@wraps/db");

    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockImplementation((table: unknown) => {
        const name = getTableName(table);

        if (name === "batch_send") {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "batch-1",
                  organizationId: "org-1",
                  status: "processing",
                  audienceType: "all",
                  topicId: null,
                  segmentId: null,
                  emailTemplateId: "tmpl-1",
                  from: "test@example.com",
                  fromName: "Test",
                  replyTo: null,
                  subject: "Hello",
                  htmlContent: null,
                  totalRecipients: 50,
                  processedRecipients: 50,
                  sent: 50,
                  failed: 0,
                  variableMappings: null,
                },
              ]),
            }),
          };
        }

        throw new Error(`Unexpected select for table: ${name}`);
      }),
    });

    sqsSendCalls.length = 0;

    const event = makeSQSEvent({
      batchId: "batch-1",
      organizationId: "org-1",
      awsAccountId: "aws-1",
      channel: "email",
      chunkIndex: 1,
      cursor: {
        createdAt: mockContacts[49].createdAt.toISOString(),
        id: mockContacts[49].id,
      },
    });

    await handler(event, {} as never, () => {});

    const updateCalls = (db.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);
    expect(sqsSendCalls.length).toBe(0);
  });

  it("does not enqueue next chunk when full chunk reaches totalRecipients", async () => {
    // Scenario: totalRecipients=50, processedRecipients=0, DB returns exactly 50 contacts
    // This exercises the shouldEnqueueNextChunk condition:
    //   (50 === min(50, 50)) && (0 + 50 < 50) = true && false = no next chunk
    const { db } = await import("@wraps/db");

    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockImplementation((table: unknown) => {
        const name = getTableName(table);

        if (name === "batch_send") {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "batch-1",
                  organizationId: "org-1",
                  status: "pending",
                  audienceType: "all",
                  topicId: null,
                  segmentId: null,
                  emailTemplateId: "tmpl-1",
                  from: "test@example.com",
                  fromName: "Test",
                  replyTo: null,
                  subject: "Hello",
                  htmlContent: null,
                  totalRecipients: 50,
                  processedRecipients: 0,
                  sent: 0,
                  failed: 0,
                  variableMappings: null,
                },
              ]),
            }),
          };
        }

        if (name === "template") {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  sesTemplateName: "wraps-tmpl-1",
                  compiledHtml: null,
                  emailType: "marketing",
                },
              ]),
            }),
          };
        }

        if (name === "organization") {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ name: "Test Org" }]),
            }),
          };
        }

        // Contact query returns exactly 50 (full chunk = totalRecipients)
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockContacts),
            }),
          }),
        };
      }),
    });

    sqsSendCalls.length = 0;

    const event = makeSQSEvent({
      batchId: "batch-1",
      organizationId: "org-1",
      awsAccountId: "aws-1",
      channel: "email",
      chunkIndex: 0,
    });

    await handler(event, {} as never, () => {});

    // shouldEnqueueNextChunk should be false: 0 + 50 < 50 is false
    expect(sqsSendCalls.length).toBe(0);
  });
});
