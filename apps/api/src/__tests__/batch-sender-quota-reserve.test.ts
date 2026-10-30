/**
 * Batch Sender — Daily Quota Reserve
 *
 * A per-AWS-account `dailyQuotaReserve` (emails/24h) that broadcasts must
 * leave untouched, so a support agent launching a broadcast can never
 * consume the SES daily quota transactional traffic needs.
 *
 * The worker reads Max24HourSend/SentLast24Hours from GetAccountCommand
 * (same call already used for MaxSendRate) and computes:
 *
 *   headroom = Max24HourSend - SentLast24Hours - dailyQuotaReserve
 *
 * If headroom < the chunk's contact count, the chunk is paused: no SES
 * send calls are made, the SAME chunk (same chunkIndex/cursor) is
 * re-enqueued with a 900s SQS delay, and a deduplicated org notification
 * (type "broadcast.quota_paused") is sent.
 *
 * Tests:
 *   - Reserve set, insufficient headroom → paused (no sends, re-enqueue
 *     same chunk at 900s, one notification)
 *   - Reserve null → feature off, sends proceed
 *   - Reserve set, ample headroom → sends proceed
 *   - GetAccount throws → fail open, sends proceed
 *   - Max24HourSend === -1 (unlimited) → gate skipped, sends proceed
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockContext } from "./__helpers__/lambda-context";

// ─────────────────────────────────────────────────────────────────────────────
// SQS mock — captures outgoing chunk messages (body + DelaySeconds)
// ─────────────────────────────────────────────────────────────────────────────

const sqsSendCalls: Array<{ MessageBody: string; DelaySeconds?: number }> = [];

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

// ─────────────────────────────────────────────────────────────────────────────
// SES mock — configurable MaxSendRate / Max24HourSend / SentLast24Hours,
// or throws on GetAccount call
// ─────────────────────────────────────────────────────────────────────────────

let sesMaxSendRate: number | null = 14; // null = throw on GetAccount
let sesMax24HourSend: number | null = null; // null = omit from response
let sesSentLast24Hours: number | null = null; // null = omit from response
let sesCallCount = 0;
let sendCallCount = 0;

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = vi.fn().mockImplementation(() => {
      sesCallCount++;
      // Call 0 = GetAccountCommand
      if (sesCallCount === 1) {
        if (sesMaxSendRate === null) {
          return Promise.reject(new Error("GetAccount failed: network error"));
        }
        return Promise.resolve({
          SendQuota: {
            MaxSendRate: sesMaxSendRate,
            Max24HourSend: sesMax24HourSend ?? undefined,
            SentLast24Hours: sesSentLast24Hours ?? undefined,
          },
        });
      }
      // Call 1+ = SendBulkEmailCommand
      sendCallCount++;
      return Promise.resolve({
        BulkEmailEntryResults: [
          { Status: "SUCCESS", MessageId: "msg-1" },
          { Status: "SUCCESS", MessageId: "msg-2" },
        ],
      });
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

// ─────────────────────────────────────────────────────────────────────────────
// DB mock — bulk path select order (claim-before-send contract):
//   0: batch  1: contacts  2: aws account  3: template  4: org
// Paused path only reaches index 2 for processJob, then notifyBroadcastQuotaPaused
// makes two more selects (3: batch name/subject, 4: org slug).
// notifyOrg / hasRecentNotification are mocked directly (spied) rather than
// going through the real @wraps/db implementation, which would hit a real DB.
// ─────────────────────────────────────────────────────────────────────────────

let selectCallIndex = 0;
let selectResults: unknown[][] = [];
let mockClaimReturning: Array<{ contactId: string }> = [];

const notifyOrgMock = vi.fn().mockResolvedValue(undefined);
const hasRecentNotificationMock = vi.fn().mockResolvedValue(false);
// countBroadcastRecipients is called on chunk 0 by the audience-snapshot
// recount (plan 169); mocked directly like notifyOrg/hasRecentNotification
// rather than going through the real @wraps/db implementation. Default
// resolves 100, matching makeBatch()'s default totalRecipients used by
// every test in this file.
const countBroadcastRecipientsMock = vi.fn().mockResolvedValue(100);

// notifyOrg now comes from @wraps/auth/notify (the @byo-oss/notifications plugin
// path), not @wraps/db, so it is stubbed on its own module.
vi.mock("@wraps/auth/notify", () => ({
  notifyOrg: (...args: unknown[]) => notifyOrgMock(...args),
}));

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
    hasRecentNotification: hasRecentNotificationMock,
    countBroadcastRecipients: countBroadcastRecipientsMock,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Service mocks
// ─────────────────────────────────────────────────────────────────────────────

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

vi.mock("@react-email/render", () => ({
  toPlainText: vi.fn().mockReturnValue("plain text"),
}));

vi.mock("./variable-mappings", () => ({
  applyVariableMappings: vi
    .fn()
    .mockImplementation((data: Record<string, string>) => data),
}));

process.env.BATCH_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/queue";
// Recipient-facing link bases have no platform fallback — the worker throws
// unless the deployment configures its own URLs.
process.env.API_BASE_URL = "https://api.test.local";

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
    subject: "Quota Reserve Test",
    from: "sender@example.com",
    fromName: "Sender",
    replyTo: null,
    // Ensure more contacts remain so the worker would enqueue a next chunk
    totalRecipients: 100,
    processedRecipients: 0,
    sent: 0,
    failed: 0,
    variableMappings: null,
    ...overrides,
  };
}

function makeContacts(count = 50) {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    email: `user${i}@example.com`,
    phone: null,
    firstName: `User${i}`,
    lastName: null,
    company: null,
    jobTitle: null,
    properties: {},
    createdAt: new Date("2026-01-15T10:00:00Z"),
  }));
}

/** Setup selects for a chunk that is EXPECTED to pause (gate triggers). */
function setupSelectsForPause(
  dailyQuotaReserve: number,
  batchOverrides: Record<string, unknown> = {}
) {
  mockClaimReturning = [];
  selectResults = [
    [makeBatch(batchOverrides)],
    makeContacts(50),
    [{ dailyQuotaReserve }], // aws account row
    [{ name: "Test Broadcast", subject: "Quota Reserve Test" }], // notifyBroadcastQuotaPaused: batch
    [{ slug: "test-org" }], // notifyBroadcastQuotaPaused: org
  ];
}

/** Setup selects for a chunk that is EXPECTED to proceed (sends happen). */
function setupSelectsForSend(dailyQuotaReserve: number | null) {
  mockClaimReturning = makeContacts(50).map((c) => ({ contactId: c.id }));
  selectResults = [
    [makeBatch()],
    makeContacts(50),
    [{ dailyQuotaReserve }], // aws account row
    [
      {
        sesTemplateName: "wraps-tmpl-1",
        compiledHtml: null,
        emailType: "marketing",
      },
    ],
    [{ name: "Test Org" }],
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

beforeEach(() => {
  vi.clearAllMocks();
  sesCallCount = 0;
  sendCallCount = 0;
  sesMaxSendRate = 14;
  sesMax24HourSend = null;
  sesSentLast24Hours = null;
  sqsSendCalls.length = 0;
  selectCallIndex = 0;
  selectResults = [];
  mockClaimReturning = [];
  notifyOrgMock.mockClear();
  hasRecentNotificationMock.mockClear();
  hasRecentNotificationMock.mockResolvedValue(false);
  countBroadcastRecipientsMock.mockClear();
  countBroadcastRecipientsMock.mockResolvedValue(100);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("daily quota reserve gate", () => {
  it("pauses the chunk when headroom is insufficient: no sends, re-enqueues the SAME chunk at 900s, notifies once", async () => {
    sesMaxSendRate = 14;
    sesMax24HourSend = 120_000;
    sesSentLast24Hours = 115_000;
    setupSelectsForPause(40_000); // headroom = 120000 - 115000 - 40000 = -35000 < 50

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    // No SendBulkEmail/SendEmail calls — only the GetAccount call happened.
    expect(sendCallCount).toBe(0);

    // Exactly one SQS message, re-enqueuing the SAME chunk (chunkIndex 0,
    // no cursor) with the 900s pause delay.
    expect(sqsSendCalls).toHaveLength(1);
    expect(sqsSendCalls[0].DelaySeconds).toBe(900);
    const requeued = JSON.parse(sqsSendCalls[0].MessageBody);
    expect(requeued.chunkIndex).toBe(0);
    expect(requeued.cursor).toBeUndefined();
    expect(requeued.batchId).toBe("batch-1");

    // Notification fired once, deduplicated type.
    expect(notifyOrgMock).toHaveBeenCalledTimes(1);
    expect(notifyOrgMock.mock.calls[0][0]).toMatchObject({
      organizationId: "org-1",
      type: "broadcast.quota_paused",
    });
  });

  it("does not notify again while the batch is still paused for the reserve", async () => {
    // pausedReason already "quota_reserve" means the previous cycle paused
    // and alerted; the 15-minute retry must stay quiet even once the 24h
    // notification window lapses (hasRecentNotification -> false here).
    sesMaxSendRate = 14;
    sesMax24HourSend = 120_000;
    sesSentLast24Hours = 115_000;
    setupSelectsForPause(40_000, { pausedReason: "quota_reserve" });

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(sqsSendCalls[0]?.DelaySeconds).toBe(900);
    expect(notifyOrgMock).not.toHaveBeenCalled();
  });

  it("proceeds with sends when the reserve is null (feature off)", async () => {
    sesMaxSendRate = 14;
    sesMax24HourSend = 120_000;
    sesSentLast24Hours = 115_000;
    setupSelectsForSend(null);

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(sendCallCount).toBeGreaterThan(0);
    expect(notifyOrgMock).not.toHaveBeenCalled();
    // Next chunk enqueued at the normal rate-limit delay, not the 900s pause.
    expect(sqsSendCalls).toHaveLength(1);
    expect(sqsSendCalls[0].DelaySeconds).not.toBe(900);
    const nextJob = JSON.parse(sqsSendCalls[0].MessageBody);
    expect(nextJob.chunkIndex).toBe(1);
  });

  it("proceeds with sends when headroom is ample", async () => {
    sesMaxSendRate = 14;
    sesMax24HourSend = 120_000;
    sesSentLast24Hours = 10_000;
    setupSelectsForSend(40_000); // headroom = 120000 - 10000 - 40000 = 70000

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(sendCallCount).toBeGreaterThan(0);
    expect(notifyOrgMock).not.toHaveBeenCalled();
    expect(sqsSendCalls).toHaveLength(1);
    expect(sqsSendCalls[0].DelaySeconds).not.toBe(900);
  });

  it("fails open (sends proceed) when GetAccountCommand throws", async () => {
    sesMaxSendRate = null; // makes GetAccountCommand throw
    setupSelectsForSend(40_000);

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(sendCallCount).toBeGreaterThan(0);
    expect(notifyOrgMock).not.toHaveBeenCalled();
    expect(sqsSendCalls).toHaveLength(1);
    expect(sqsSendCalls[0].DelaySeconds).not.toBe(900);
  });

  it("skips the gate when Max24HourSend is -1 (unlimited)", async () => {
    sesMaxSendRate = 14;
    sesMax24HourSend = -1;
    sesSentLast24Hours = 999_999_999; // irrelevant — unlimited quota
    setupSelectsForSend(40_000);

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(sendCallCount).toBeGreaterThan(0);
    expect(notifyOrgMock).not.toHaveBeenCalled();
    expect(sqsSendCalls).toHaveLength(1);
    expect(sqsSendCalls[0].DelaySeconds).not.toBe(900);
  });
});
