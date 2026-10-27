/**
 * Batch Sender — Quota-Stuck Escalation
 *
 * When the daily quota reserve gate (batch-sender-quota-reserve.test.ts) pauses
 * a broadcast and it has made zero progress for QUOTA_STUCK_THRESHOLD_MS (24h),
 * the worker escalates: a distinct in-app notification (type
 * "broadcast.quota_stuck") plus an email to the org's owners/admins. This is an
 * escalation ALONGSIDE the routine broadcast.quota_paused notification, not a
 * replacement — that one keeps firing every 24h regardless.
 *
 * Tests:
 *   - Below threshold (1h stale) → no escalation
 *   - Above threshold (30h stale) → notifies + emails once
 *   - Deduped (hasRecentNotification true for quota_stuck) → neither the
 *     notification nor the email happens, chunk still re-enqueued
 *   - Null lastChunkAt falls back to startedAt, then createdAt
 *   - Email failure is contained — chunk still re-enqueues, notification
 *     was still written
 *   - No owner/admin recipients — notification still written, no email
 *     attempted, nothing throws
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
// SES mock — GetAccount only. The pause path always returns before any
// SendBulkEmail call, so every invocation here is a GetAccountCommand.
// ─────────────────────────────────────────────────────────────────────────────

let sesMax24HourSend = 120_000;
let sesSentLast24Hours = 115_000;

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = vi.fn().mockImplementation(() =>
      Promise.resolve({
        SendQuota: {
          MaxSendRate: 14,
          Max24HourSend: sesMax24HourSend,
          SentLast24Hours: sesSentLast24Hours,
        },
      })
    );
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
// Email mock — intercept only sendBroadcastStuckEmail; everything else
// (resolveAppUrl, toSesVariableName, transformVariablesForSes) is real but
// unreached by the pause path, so no need to stub it.
// ─────────────────────────────────────────────────────────────────────────────

const sendBroadcastStuckEmailMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@wraps/email", async () => {
  const actual =
    await vi.importActual<typeof import("@wraps/email")>("@wraps/email");
  return {
    ...actual,
    sendBroadcastStuckEmail: sendBroadcastStuckEmailMock,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// DB mock — index-based selects (see setupSelectsForPause/appendStuckSelects
// below for the exact sequence), plus an innerJoin branch on `.from()` for
// getOrgAlertEmails' member/user join.
// ─────────────────────────────────────────────────────────────────────────────

let selectCallIndex = 0;
let selectResults: unknown[][] = [];
let mockClaimReturning: Array<{ contactId: string }> = [];
// WHERE predicates passed to getOrgAlertEmails' member/user join. Captured so a
// test can prove the owner/admin filter is applied in SQL rather than in JS
// after an unordered LIMIT — see the "narrows by role in SQL" test.
const memberJoinWhereCalls: unknown[] = [];

const notifyOrgMock = vi.fn().mockResolvedValue(undefined);
const hasRecentNotificationDedupe: Record<string, boolean> = {};
const hasRecentNotificationMock = vi
  .fn()
  .mockImplementation((params: { type: string }) =>
    Promise.resolve(hasRecentNotificationDedupe[params.type] ?? false)
  );
// countBroadcastRecipients is called on chunk 0 by the audience-snapshot
// recount (plan 169); mocked directly like notifyOrg/hasRecentNotification
// rather than going through the real @wraps/db implementation. Default
// resolves 800_000, matching makeBatch()'s default totalRecipients used by
// every test in this file.
const countBroadcastRecipientsMock = vi.fn().mockResolvedValue(800_000);

function thenable(rows: unknown[]) {
  const obj: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve(rows).then(resolve),
    limit: vi.fn().mockImplementation(() => thenable(rows)),
    orderBy: vi.fn().mockImplementation(() => thenable(rows)),
  };
  return obj;
}

// notifyOrg now comes from @wraps/auth/notify (the better-inbox plugin
// path), not @wraps/db, so it is stubbed on its own module.
vi.mock("@wraps/auth/notify", () => ({
  notifyOrg: (...args: unknown[]) => notifyOrgMock(...args),
}));

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");

  return {
    ...actual,
    db: {
      select: vi.fn().mockImplementation(() => {
        const rows = selectResults[selectCallIndex] ?? [];
        selectCallIndex += 1;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => thenable(rows)),
            // getOrgAlertEmails' member/user join — same rows array, since
            // it consumes the next selectResults entry like any other select.
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation((predicate: unknown) => {
                memberJoinWhereCalls.push(predicate);
                return thenable(rows);
              }),
            }),
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
process.env.API_BASE_URL = "https://api.test.local";
process.env.APP_BASE_URL = "https://app.test.local";

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
    name: "Stuck Broadcast Test",
    subject: "Quota Stuck Test",
    from: "sender@example.com",
    fromName: "Sender",
    replyTo: null,
    awsAccountId: "aws-1",
    totalRecipients: 800_000,
    processedRecipients: 240_000,
    sent: 0,
    failed: 0,
    variableMappings: null,
    lastChunkAt: null,
    startedAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
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

/**
 * Baseline selects for the gate always pausing (dailyQuotaReserve=40_000
 * against a fixed 120_000/115_000 quota — headroom is negative, always < 50).
 */
function setupSelectsForPause(batchOverrides: Record<string, unknown> = {}) {
  mockClaimReturning = [];
  selectResults = [
    [makeBatch(batchOverrides)],
    makeContacts(50),
    [{ dailyQuotaReserve: 40_000 }],
    [{ name: "Stuck Broadcast Test", subject: "Quota Stuck Test" }], // notifyBroadcastQuotaPaused: batch
    [{ slug: "test-org" }], // notifyBroadcastQuotaPaused: org
  ];
}

/**
 * Append the two extra selects alertBroadcastQuotaStuck issues once it
 * decides to escalate (org slug, then getOrgAlertEmails' member/user rows).
 */
function appendStuckSelects(
  memberRows: Array<{ email: string; role: string }>
) {
  selectResults.push([{ slug: "test-org" }], memberRows);
}

/**
 * Collect every string appearing anywhere in a WHERE predicate.
 *
 * This file stubs `sql` as `(...args) => args`, so `ilike()` yields nested raw
 * template chunks rather than Drizzle SQL objects — the structured
 * collectParamValues walk used in batch-sender-ses-errors.test.ts finds nothing
 * here. The tree also closes on itself (a column references its table), hence
 * the seen-set.
 */
function collectStrings(
  node: unknown,
  out: string[] = [],
  seen = new WeakSet<object>()
): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (!node || typeof node !== "object" || seen.has(node)) {
    return out;
  }
  seen.add(node);
  for (const value of Object.values(node as Record<string, unknown>)) {
    collectStrings(value, out, seen);
  }
  return out;
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
  sesMax24HourSend = 120_000;
  sesSentLast24Hours = 115_000;
  sqsSendCalls.length = 0;
  selectCallIndex = 0;
  selectResults = [];
  mockClaimReturning = [];
  notifyOrgMock.mockClear();
  hasRecentNotificationMock.mockClear();
  for (const key of Object.keys(hasRecentNotificationDedupe)) {
    delete hasRecentNotificationDedupe[key];
  }
  sendBroadcastStuckEmailMock.mockClear();
  sendBroadcastStuckEmailMock.mockResolvedValue(undefined);
  countBroadcastRecipientsMock.mockClear();
  countBroadcastRecipientsMock.mockResolvedValue(800_000);
  memberJoinWhereCalls.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("quota-stuck escalation", () => {
  it("does not escalate when the pause is below the stuck threshold (1h stale)", async () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    setupSelectsForPause({ lastChunkAt: oneHourAgo });

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    // Routine pause notification still fires...
    expect(notifyOrgMock).toHaveBeenCalledTimes(1);
    expect(notifyOrgMock.mock.calls[0][0]).toMatchObject({
      type: "broadcast.quota_paused",
    });
    // ...but no stuck escalation.
    expect(sendBroadcastStuckEmailMock).not.toHaveBeenCalled();
  });

  it("escalates once when the pause exceeds the stuck threshold (30h stale)", async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
    setupSelectsForPause({ lastChunkAt: thirtyHoursAgo });
    appendStuckSelects([{ email: "owner@example.com", role: "owner" }]);

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(notifyOrgMock).toHaveBeenCalledTimes(2);
    expect(notifyOrgMock.mock.calls[1][0]).toMatchObject({
      organizationId: "org-1",
      type: "broadcast.quota_stuck",
    });

    expect(sendBroadcastStuckEmailMock).toHaveBeenCalledTimes(1);
    const call = sendBroadcastStuckEmailMock.mock.calls[0][0];
    expect(call.to).toContain("owner@example.com");
    expect(call.max24HourSend).toBe(120_000);
    expect(call.sentLast24Hours).toBe(115_000);
    expect(call.reserve).toBe(40_000);

    // Still re-enqueued at 900s, same chunk.
    expect(sqsSendCalls).toHaveLength(1);
    expect(sqsSendCalls[0].DelaySeconds).toBe(900);
    const requeued = JSON.parse(sqsSendCalls[0].MessageBody);
    expect(requeued.chunkIndex).toBe(0);
  });

  it("is deduped when hasRecentNotification is true for quota_stuck: neither fires, chunk still re-enqueues", async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
    hasRecentNotificationDedupe["broadcast.quota_stuck"] = true;
    setupSelectsForPause({ lastChunkAt: thirtyHoursAgo });
    // No appendStuckSelects — the dedupe check returns before any further select.

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    // Routine pause notification still fires (separate dedupe key/type).
    expect(notifyOrgMock).toHaveBeenCalledTimes(1);
    expect(notifyOrgMock.mock.calls[0][0]).toMatchObject({
      type: "broadcast.quota_paused",
    });
    expect(sendBroadcastStuckEmailMock).not.toHaveBeenCalled();

    expect(sqsSendCalls).toHaveLength(1);
    expect(sqsSendCalls[0].DelaySeconds).toBe(900);
  });

  it("falls back through startedAt, then createdAt, when lastChunkAt is null", async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);

    // Sub-case 1: lastChunkAt null, startedAt 30h ago → escalates via startedAt.
    setupSelectsForPause({ lastChunkAt: null, startedAt: thirtyHoursAgo });
    appendStuckSelects([{ email: "owner@example.com", role: "owner" }]);
    await handler(makeSQSEvent(), makeMockContext(), vi.fn());
    expect(sendBroadcastStuckEmailMock).toHaveBeenCalledTimes(1);

    // Sub-case 2: lastChunkAt AND startedAt null (first-chunk pause),
    // createdAt 30h ago → escalates via createdAt.
    sendBroadcastStuckEmailMock.mockClear();
    selectCallIndex = 0;
    setupSelectsForPause({
      lastChunkAt: null,
      startedAt: null,
      createdAt: thirtyHoursAgo,
    });
    appendStuckSelects([{ email: "owner@example.com", role: "owner" }]);
    await handler(makeSQSEvent(), makeMockContext(), vi.fn());
    expect(sendBroadcastStuckEmailMock).toHaveBeenCalledTimes(1);
  });

  it("contains an email-send failure: chunk still re-enqueues, notification still written", async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
    setupSelectsForPause({ lastChunkAt: thirtyHoursAgo });
    appendStuckSelects([{ email: "owner@example.com", role: "owner" }]);
    sendBroadcastStuckEmailMock.mockRejectedValueOnce(
      new Error("SES send failed")
    );

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(
      notifyOrgMock.mock.calls.some(
        (c) => c[0].type === "broadcast.quota_stuck"
      )
    ).toBe(true);
    expect(sqsSendCalls).toHaveLength(1);
    expect(sqsSendCalls[0].DelaySeconds).toBe(900);
  });

  it("narrows recipients by role in SQL, not in JS after an unordered LIMIT", async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
    setupSelectsForPause({ lastChunkAt: thirtyHoursAgo });
    appendStuckSelects([{ email: "owner@example.com", role: "owner" }]);

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    // The query must constrain by role itself. Filtering only in JS means the
    // LIMIT is an unordered slice of ALL members, so an org with more than 100
    // can silently yield no owner/admin — and the failure is invisible, since
    // the in-app notification still gets written.
    expect(memberJoinWhereCalls).toHaveLength(1);
    const strings = collectStrings(memberJoinWhereCalls[0]);
    expect(strings).toContain("%owner%");
    expect(strings).toContain("%admin%");
  });

  it("skips the email when there are no owner/admin recipients, without throwing", async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
    setupSelectsForPause({ lastChunkAt: thirtyHoursAgo });
    appendStuckSelects([{ email: "billing@example.com", role: "billing" }]);

    await handler(makeSQSEvent(), makeMockContext(), vi.fn());

    expect(
      notifyOrgMock.mock.calls.some(
        (c) => c[0].type === "broadcast.quota_stuck"
      )
    ).toBe(true);
    expect(sendBroadcastStuckEmailMock).not.toHaveBeenCalled();
    expect(sqsSendCalls).toHaveLength(1);
  });
});
