/**
 * Batch Sender — SES Error Recovery
 *
 * Tests the catch-block inside the SES bulk send loop (sesTemplateName path):
 *
 *   Throttle  → re-queues same chunkIndex with 30s delay; does NOT proceed
 *   Permission → inserts failed records for all recipients, then re-throws
 *   Generic    → inserts failed records, increments failed counter, continues
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockContext } from "./__helpers__/lambda-context";

// ─────────────────────────────────────────────────────────────────────────────
// SQS mock — captures SendMessageCommand inputs so we can assert re-queue args
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
// SES mock — throws specific errors on the bulk send call (index 1)
// ─────────────────────────────────────────────────────────────────────────────

let sesCallCount = 0;
let sesErrorToThrow: Error | null = null;
// When set, the SendBulkEmail call resolves with this per-recipient result
// shape instead of throwing — lets tests exercise the per-recipient
// success/failure path (recordAcceptedSend/recordSendFailure) rather than the
// whole-call catch block.
let sesBulkResultsOverride: {
  BulkEmailEntryResults: Array<{
    Status: string;
    MessageId?: string;
    Error?: unknown;
  }>;
} | null = null;

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = vi.fn().mockImplementation(() => {
      sesCallCount++;
      // Index 0 = GetAccount, index 1+ = SendBulkEmail
      if (sesCallCount > 1 && sesErrorToThrow) {
        return Promise.reject(sesErrorToThrow);
      }
      if (sesCallCount > 1 && sesBulkResultsOverride) {
        return Promise.resolve(sesBulkResultsOverride);
      }
      return Promise.resolve({ SendQuota: { MaxSendRate: 14 } });
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
// DB mock — index-based selects, tracks inserts
// Bulk path select order (batch.from != null, emailTemplateId set):
//   0: batch
//   1: contacts
//   2: template  \  via Promise.all
//   3: org       /
//   4: existingSendRecords (dedup)
// ─────────────────────────────────────────────────────────────────────────────

let selectCallIndex = 0;
let selectResults: unknown[][] = [];
// Track UPDATE set calls for post-send status assertions
const updateSetCalls: Record<string, unknown>[] = [];
// Track UPDATE set+where pairs, so a test can prove a status write carries the
// `status <> 'cancelled'` guard rather than clobbering a concurrent cancel.
const updateWhereCalls: Array<{
  values: Record<string, unknown>;
  predicate: unknown;
}> = [];
// Contacts returned by claim INSERT
let mockClaimReturning: Array<{ contactId: string }> = [];
// Track DELETE calls (throttle claim-release). For each delete we record how
// many SQS sends had happened at that moment — proves delete-before-re-enqueue.
const deleteWhereCalls: unknown[] = [];
const sqsCallsAtDelete: number[] = [];
// notifyOrg / hasRecentNotification / countBroadcastRecipients are mocked
// directly (spied) rather than going through the real @wraps/db
// implementation, which would hit a real DB. countBroadcastRecipients is
// called on chunk 0 by the audience-snapshot recount (plan 169); default
// resolves 2, matching makeBulkBatch()'s default totalRecipients — tests using
// setupLargeChunkSelects override it to match their own totalRecipients.
const notifyOrgMock = vi.fn().mockResolvedValue(undefined);
const hasRecentNotificationMock = vi.fn().mockResolvedValue(false);
const countBroadcastRecipientsMock = vi.fn().mockResolvedValue(2);

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
        set: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
          updateSetCalls.push(vals);
          return {
            where: vi.fn().mockImplementation((predicate: unknown) => {
              updateWhereCalls.push({ values: vals, predicate });
              return {
                returning: vi.fn().mockResolvedValue([]),
              };
            }),
          };
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
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((whereArg: unknown) => {
          deleteWhereCalls.push(whereArg);
          sqsCallsAtDelete.push(sqsSendCalls.length);
          return Promise.resolve(undefined);
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

function makeBulkBatch(overrides: Record<string, unknown> = {}) {
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
      lastName: null,
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
      lastName: null,
      company: null,
      jobTitle: null,
      properties: {},
      createdAt: new Date("2026-01-15T11:00:00Z"),
    },
  ];
}

function setupBulkSelects() {
  // Default: both contacts claimed by INSERT
  mockClaimReturning = makeContacts().map((c) => ({ contactId: c.id }));
  selectResults = [
    [makeBulkBatch()],
    makeContacts(),
    [{}], // aws account features (config set lookup — after contacts)
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

/** Larger contact set for tests that need a full (non-final) chunk. */
function makeManyContacts(count: number) {
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

/**
 * Setup for tests whose branch returns BEFORE shouldEnqueueNextChunk is
 * evaluated (daily-quota pause, circuit breaker) — both call one of the
 * notify* helpers, which issue two extra selects (batch name/subject, org
 * slug) on top of the standard 5.
 */
function setupBulkSelectsForEarlyReturn() {
  mockClaimReturning = makeContacts().map((c) => ({ contactId: c.id }));
  selectResults = [
    [makeBulkBatch()],
    makeContacts(),
    [{}], // aws account features
    [
      {
        sesTemplateName: "wraps-tmpl-1",
        compiledHtml: null,
        emailType: "marketing",
      },
    ],
    [{ name: "Test Org" }],
    [{ name: "Test Broadcast", subject: "Test Subject" }], // notify*: batch
    [{ slug: "test-org" }], // notify*: org
  ];
}

/**
 * Setup for tests that need a FULL chunk (contacts.length === CHUNK_SIZE)
 * with more of the audience remaining, so shouldEnqueueNextChunk is true and
 * the worker never reaches notifyBroadcastFinished's extra selects.
 */
function setupLargeChunkSelects(count = 50, totalRecipients = 100) {
  const contacts = makeManyContacts(count);
  mockClaimReturning = contacts.map((c) => ({ contactId: c.id }));
  // The chunk-0 audience-snapshot recount must match this fixture's own
  // totalRecipients, or it would silently overwrite it back to the file
  // default (2) and break shouldEnqueueNextChunk for these large-chunk cases.
  countBroadcastRecipientsMock.mockResolvedValueOnce(totalRecipients);
  selectResults = [
    [makeBulkBatch({ totalRecipients })],
    contacts,
    [{}], // aws account features
    [
      {
        sesTemplateName: "wraps-tmpl-1",
        compiledHtml: null,
        emailType: "marketing",
      },
    ],
    [{ name: "Test Org" }],
  ];
  return contacts;
}

/**
 * Walk a Drizzle SQL tree (real `and`/`eq`/`inArray` objects — the mock spreads
 * `...actual`) and collect every bound Param value. Lets us assert the DELETE's
 * where clause carries the status='queued' predicate and the contact ids.
 */
function collectParamValues(node: unknown, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") {
    return out;
  }
  if (Array.isArray(node)) {
    // inArray embeds a plain array of Param objects as a query chunk
    for (const item of node) {
      collectParamValues(item, out);
    }
    return out;
  }
  const record = node as Record<string, unknown>;
  if ("value" in record && !("queryChunks" in record)) {
    out.push(record.value);
  }
  if (Array.isArray(record.queryChunks)) {
    for (const chunk of record.queryChunks) {
      collectParamValues(chunk, out);
    }
  }
  return out;
}

function makeSQSEvent(chunkIndex = 0) {
  return {
    Records: [
      {
        body: JSON.stringify({
          batchId: "batch-1",
          organizationId: "org-1",
          awsAccountId: "aws-1",
          channel: "email",
          chunkIndex,
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
  sesErrorToThrow = null;
  sesBulkResultsOverride = null;
  sqsSendCalls.length = 0;
  selectCallIndex = 0;
  selectResults = [];
  updateSetCalls.length = 0;
  updateWhereCalls.length = 0;
  mockClaimReturning = [];
  deleteWhereCalls.length = 0;
  sqsCallsAtDelete.length = 0;
  notifyOrgMock.mockClear();
  hasRecentNotificationMock.mockClear();
  hasRecentNotificationMock.mockResolvedValue(false);
  countBroadcastRecipientsMock.mockClear();
  countBroadcastRecipientsMock.mockResolvedValue(2);
});

// ─────────────────────────────────────────────────────────────────────────────
// Throttle error
// ─────────────────────────────────────────────────────────────────────────────

describe("SES throttle error", () => {
  it("re-queues the same chunkIndex (not incremented) with 30s delay", async () => {
    setupBulkSelects();
    sesErrorToThrow = Object.assign(new Error("Rate exceeded"), {
      name: "Throttling",
    });

    await handler(makeSQSEvent(2), makeMockContext(), vi.fn());

    expect(sqsSendCalls).toHaveLength(1);

    const requeued = JSON.parse(sqsSendCalls[0].MessageBody);
    // chunkIndex must remain 2 — NOT incremented to 3
    expect(requeued.chunkIndex).toBe(2);
    expect(requeued.batchId).toBe("batch-1");
    expect(requeued.organizationId).toBe("org-1");
  });

  it("delays the re-queued message by exactly 30 seconds", async () => {
    setupBulkSelects();
    sesErrorToThrow = Object.assign(new Error("Rate exceeded"), {
      name: "TooManyRequestsException",
    });

    await handler(makeSQSEvent(0), makeMockContext(), vi.fn());

    expect(sqsSendCalls[0]?.DelaySeconds).toBe(30);
  });

  it("does NOT update messageSend rows with error status when throttled (chunk will retry)", async () => {
    setupBulkSelects();
    sesErrorToThrow = Object.assign(new Error("Rate limit exceeded"), {
      name: "Throttling",
    });

    await handler(makeSQSEvent(0), makeMockContext(), vi.fn());

    // On throttle, we re-queue and return early — no post-send status updates
    const failedUpdates = updateSetCalls.filter((u) => u.status === "failed");
    expect(failedUpdates).toHaveLength(0);
  });

  it("releases unused claims (DELETE, status=queued) once BEFORE re-enqueueing", async () => {
    setupBulkSelects();
    sesErrorToThrow = Object.assign(new Error("Rate exceeded"), {
      name: "Throttling",
    });

    await handler(makeSQSEvent(1), makeMockContext(), vi.fn());

    // Exactly one DELETE — releases this invocation's still-queued claims so
    // the 30s redelivery can re-claim them (rows would otherwise be stuck:
    // claim INSERT conflicts, re-claim UPDATE sees fresh non-stale claimedAt).
    expect(deleteWhereCalls).toHaveLength(1);

    // The DELETE happened BEFORE the SQS re-enqueue (0 SQS sends at delete time)
    expect(sqsCallsAtDelete[0]).toBe(0);

    // The where clause targets the claimed contacts AND the queued status —
    // never rows already updated to sent/failed by earlier sub-batches.
    const paramValues = collectParamValues(deleteWhereCalls[0]).flat();
    expect(paramValues).toContain("queued");
    expect(paramValues).toContain("org-1");
    expect(paramValues).toContain("batch-1");
    expect(paramValues).toContain("contact-1");
    expect(paramValues).toContain("contact-2");

    // And the chunk is still re-enqueued with the SAME chunkIndex
    expect(sqsSendCalls).toHaveLength(1);
    const requeued = JSON.parse(sqsSendCalls[0].MessageBody);
    expect(requeued.chunkIndex).toBe(1);
    expect(sqsSendCalls[0].DelaySeconds).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Permission error
// ─────────────────────────────────────────────────────────────────────────────

describe("SES permission error", () => {
  it("updates claimed rows to failed for all recipients before re-throwing", async () => {
    setupBulkSelects();
    sesErrorToThrow = Object.assign(
      new Error("User is not authorized to perform: ses:SendBulkEmail"),
      { name: "AccessDeniedException" }
    );

    await expect(
      handler(makeSQSEvent(0), makeMockContext(), vi.fn())
    ).rejects.toThrow();

    // Permission error path updates claimed rows to failed via a single UPDATE
    // with inArray for all recipients in the batch
    const failedUpdate = updateSetCalls.find((u) => u.status === "failed");
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate?.status).toBe("failed");
  });

  it("error message mentions IAM role and instructs how to fix it", async () => {
    setupBulkSelects();
    sesErrorToThrow = Object.assign(new Error("AccessDenied"), {
      name: "AccessDenied",
    });

    await expect(
      handler(makeSQSEvent(0), makeMockContext(), vi.fn())
    ).rejects.toThrow(/IAM role|CloudFormation|update-role/i);
  });

  it("does NOT re-queue an SQS message when permission error occurs", async () => {
    setupBulkSelects();
    sesErrorToThrow = Object.assign(new Error("is not authorized to perform"), {
      name: "AccessDeniedException",
    });

    await expect(
      handler(makeSQSEvent(0), makeMockContext(), vi.fn())
    ).rejects.toThrow();

    expect(sqsSendCalls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SES daily quota error
// ─────────────────────────────────────────────────────────────────────────────

describe("SES daily quota error", () => {
  it("re-queues the SAME chunkIndex at 900s, releases claims, marks nothing failed, pauses, and notifies once", async () => {
    setupBulkSelectsForEarlyReturn();
    sesErrorToThrow = Object.assign(new Error("Daily message quota exceeded"), {
      name: "LimitExceededException",
    });

    await handler(makeSQSEvent(3), makeMockContext(), vi.fn());

    // Re-enqueues the SAME chunkIndex (not incremented) at 900s.
    expect(sqsSendCalls).toHaveLength(1);
    expect(sqsSendCalls[0].DelaySeconds).toBe(900);
    const requeued = JSON.parse(sqsSendCalls[0].MessageBody);
    expect(requeued.chunkIndex).toBe(3);
    expect(requeued.batchId).toBe("batch-1");

    // Claim-release DELETE scoped to status='queued', same shape as throttle.
    expect(deleteWhereCalls).toHaveLength(1);
    const paramValues = collectParamValues(deleteWhereCalls[0]).flat();
    expect(paramValues).toContain("queued");
    expect(paramValues).toContain("org-1");
    expect(paramValues).toContain("batch-1");

    // No messageSend row is ever marked failed on this path.
    const failedUpdates = updateSetCalls.filter((u) => u.status === "failed");
    expect(failedUpdates).toHaveLength(0);

    // batchSend.pausedReason is set to 'daily_quota'.
    const pausedUpdate = updateSetCalls.find(
      (u) => u.pausedReason === "daily_quota"
    );
    expect(pausedUpdate).toBeDefined();

    // Exactly one notification of the right type.
    expect(notifyOrgMock).toHaveBeenCalledTimes(1);
    expect(notifyOrgMock.mock.calls[0][0]).toMatchObject({
      organizationId: "org-1",
      type: "broadcast.daily_quota_paused",
    });
  });

  it("writes no second notification when one already landed in the dedupe window", async () => {
    setupBulkSelectsForEarlyReturn();
    hasRecentNotificationMock.mockResolvedValue(true);
    sesErrorToThrow = Object.assign(
      new Error("Sending quota for the account has been exceeded"),
      { name: "Throttling" } // realistic ambiguity: same name isThrottle matches
    );

    await handler(makeSQSEvent(0), makeMockContext(), vi.fn());

    // Daily-quota branch still wins over isThrottle (ordering gate), so the
    // chunk is paused at 900s, not retried at 30s.
    expect(sqsSendCalls[0]?.DelaySeconds).toBe(900);
    expect(notifyOrgMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Whole-chunk failure circuit breaker
// ─────────────────────────────────────────────────────────────────────────────

describe("whole-chunk failure circuit breaker", () => {
  it("stops the broadcast when a chunk sends zero and fails every recipient", async () => {
    setupBulkSelectsForEarlyReturn();
    sesBulkResultsOverride = {
      BulkEmailEntryResults: [
        { Status: "FAILED", Error: "Bounce" },
        { Status: "FAILED", Error: "Bounce" },
      ],
    };

    await handler(makeSQSEvent(5), makeMockContext(), vi.fn());

    // Zero SQS sends — the chain is stopped, not re-enqueued.
    expect(sqsSendCalls).toHaveLength(0);

    // Batch row ends 'failed' with a non-null errorMessage. (Distinct from the
    // per-recipient messageSend 'failed' updates, which use `error` not
    // `errorMessage` and have no `completedAt`.)
    const statusUpdate = updateSetCalls.find(
      (u) => u.status === "failed" && "completedAt" in u
    );
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate?.errorMessage).toEqual(expect.any(String));
    expect(statusUpdate?.errorMessage).not.toBe("");

    // Notification type is 'broadcast.stopped_early', NOT 'broadcast.finished'.
    expect(notifyOrgMock).toHaveBeenCalledTimes(1);
    expect(notifyOrgMock.mock.calls[0][0]).toMatchObject({
      organizationId: "org-1",
      type: "broadcast.stopped_early",
    });
  });

  it("does NOT fire when a chunk has at least one success (partial failure is normal)", async () => {
    const contacts = setupLargeChunkSelects(50, 100);
    sesBulkResultsOverride = {
      BulkEmailEntryResults: contacts.map((_c, i) =>
        i === 0
          ? { Status: "SUCCESS", MessageId: `msg-${i}` }
          : { Status: "FAILED", Error: "Bounce" }
      ),
    };

    await handler(makeSQSEvent(0), makeMockContext(), vi.fn());

    // The breaker must not trip on partial failure — the chunk chain
    // continues to the next chunk.
    expect(sqsSendCalls).toHaveLength(1);
    const nextJob = JSON.parse(sqsSendCalls[0].MessageBody);
    expect(nextJob.chunkIndex).toBe(1);

    // No 'stopped_early' or 'finished' notification — this is ordinary
    // progress, nothing to tell the customer yet.
    expect(notifyOrgMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pausedReason lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("cancel durability", () => {
  it("guards every batch status write with status <> 'cancelled'", async () => {
    setupBulkSelectsForEarlyReturn();
    sesBulkResultsOverride = {
      BulkEmailEntryResults: [
        { Status: "FAILED", Error: "Bounce" },
        { Status: "FAILED", Error: "Bounce" },
      ],
    };

    await handler(makeSQSEvent(5), makeMockContext(), vi.fn());

    // processJob reads batch.status once at load, then runs for as long as a
    // chunk takes. A cancel issued inside that window is invisible to this
    // invocation, so an unguarded write would flip the row back out of
    // 'cancelled' — and the next invocation's cancelled check reads that same
    // column, so the chain would resume sending a stopped broadcast.
    // Only batchSend writes, not per-recipient messageSend ones — both set
    // `status`, but messageSend carries `error` while batchSend carries
    // `errorMessage`/`completedAt`/`startedAt`.
    const statusWrites = updateWhereCalls.filter(
      (u) => typeof u.values.status === "string" && !("error" in u.values)
    );
    expect(statusWrites.length).toBeGreaterThan(0);

    for (const write of statusWrites) {
      const params = collectParamValues(write.predicate).flat();
      expect(params).toContain("cancelled");
    }
  });
});

describe("pausedReason lifecycle", () => {
  it("clears pausedReason back to null once a chunk actually sends", async () => {
    const contacts = setupLargeChunkSelects(50, 100);
    sesBulkResultsOverride = {
      BulkEmailEntryResults: contacts.map((_c, i) => ({
        Status: "SUCCESS",
        MessageId: `msg-${i}`,
      })),
    };

    await handler(makeSQSEvent(0), makeMockContext(), vi.fn());

    // The progress UPDATE (the only write reachable on a real send) clears
    // pausedReason — a batch that paused once must not read as paused forever.
    const progressUpdate = updateSetCalls.find(
      (u) => "pausedReason" in u && u.lastChunkIndex !== undefined
    );
    expect(progressUpdate).toBeDefined();
    expect(progressUpdate?.pausedReason).toBeNull();
  });
});
