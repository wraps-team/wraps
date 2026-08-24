/**
 * Event Feed Staleness Worker Tests
 *
 * Covers the detection + flag lifecycle + alert-once semantics described in
 * plan 113: an account's SES event feed is "stale" when it's connected and a
 * send that should already have been acknowledged has no event behind it. The
 * worker flags it, debounces one cycle, alerts the org owner exactly once per
 * episode, and clears the flags when events demonstrably resume.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  flushLogger: vi.fn().mockResolvedValue(undefined),
}));

const mockSendEventFeedStaleEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@wraps/email", () => ({
  sendEventFeedStaleEmail: (...args: unknown[]) =>
    mockSendEventFeedStaleEmail(...args),
}));

// Real notifyOrg resolves its own `db` via a relative import inside
// packages/db, not via the "@wraps/db" specifier, so mocking db.select/update
// above does not reach it — it would otherwise attempt a real network call
// from this mocked-only test file. Mock it explicitly so alert-copy
// assertions (below) are deterministic and so no unmocked network call
// happens here.
const mockNotifyOrg = vi.fn().mockResolvedValue([]);
vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual<typeof import("@wraps/db")>("@wraps/db");
  return {
    ...actual,
    db: {
      select: (...args: unknown[]) => mockDbSelect(...args),
      update: (...args: unknown[]) => mockDbUpdate(...args),
    },
    notifyOrg: (...args: unknown[]) => mockNotifyOrg(...args),
  };
});

// plan 195: the SES send-metric fallback boundary. Mocked so no test makes a
// real STS/CloudWatch call; captureException is mocked alongside so tests can
// assert it is (or is not) called for the role-access-failure path.
const mockGetCredentials = vi.fn();
vi.mock("../services/credentials", () => ({
  getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
}));

const mockCloudWatchSend = vi.fn();
vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: class {
    send = mockCloudWatchSend;
  },
  GetMetricDataCommand: class {
    constructor(public input: unknown) {}
  },
}));

const mockCaptureException = vi.fn();
const mockCaptureMessage = vi.fn();
vi.mock("@sentry/aws-serverless", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  wrapHandler: (handler: unknown) => handler,
}));

vi.mock("../lib/sentry", () => ({}));

const DEFAULT_CREDENTIALS = {
  accessKeyId: "AKIA-test",
  secretAccessKey: "secret",
  sessionToken: "token",
  expiration: new Date("2099-01-01"),
  region: "us-east-1",
};

/** Shape of the STS AccessDenied a deleted/drifted customer role produces. */
function accessDeniedError(): Error {
  const error = new Error(
    "User: arn:aws:sts::905130073023:assumed-role/wraps-production-EventFeedStalenessHandlerRole/wraps-production-EventFeedStalenessHandlerFunction is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::123456789012:role/wraps-console-access-role"
  );
  error.name = "AccessDenied";
  return error;
}

/** A GetMetricDataCommand response summing to the given total. */
function metricResult(values: number[]) {
  return { MetricDataResults: [{ Id: "sesSend", Values: values }] };
}

const { awsAccount, member, messageSend, organization } = await import(
  "@wraps/db"
);
const { handler } = await import("../workers/event-feed-staleness");

const NOW = new Date("2026-07-07T12:00:00.000Z");
const TWENTY_HOURS_AGO = new Date(NOW.getTime() - 20 * 60 * 60 * 1000);
const SEVEN_HOURS_AGO = new Date(NOW.getTime() - 7 * 60 * 60 * 1000);
const TWO_HOURS_AGO = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
const THIRTY_MIN_AGO = new Date(NOW.getTime() - 30 * 60 * 1000);

const BASE_ACCOUNT = {
  id: "aws-account-1",
  organizationId: "org-1",
  name: "Production",
  accountId: "123456789012",
  region: "us-east-1",
  lastEventReceivedAt: SEVEN_HOURS_AGO as Date | null,
  eventFeedStaleSince: null as Date | null,
  eventFeedAlertedAt: null as Date | null,
};

const OWNER_ROW = { email: "owner@example.com" };
const ORG_ROW = { slug: "acme" };

/** Thenable chain builder: from()/innerJoin()/where()/limit() all return
 * itself, and awaiting the chain resolves to whatever result was set once
 * .from(table) matched a configured table -> rows mapping. */
function makeSelectDispatcher(resultsByTable: Map<unknown, unknown[]>) {
  return () => {
    let result: unknown[] = [];
    const chain: PromiseLike<unknown[]> & Record<string, unknown> = {
      from: vi.fn((table: unknown) => {
        result = resultsByTable.get(table) ?? [];
        return chain;
      }),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      then: (<TResult1 = unknown[], TResult2 = never>(
        onFulfilled?:
          | ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
          | null,
        onRejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null
      ) =>
        Promise.resolve(result).then(
          onFulfilled ?? undefined,
          onRejected ?? undefined
        )) as PromiseLike<unknown[]>["then"],
    };
    return chain;
  };
}

type UpdateCall = {
  table: unknown;
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
};

function setupUpdateCapture(): UpdateCall[] {
  const calls: UpdateCall[] = [];
  mockDbUpdate.mockImplementation((table: unknown) => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    calls.push({ table, set, where });
    return { set };
  });
  return calls;
}

/**
 * Configure db.select to answer per-table with the given fixture rows.
 *
 * `unacknowledgedSend` stands in for the messageSend probe's aggregate row:
 * `{ total, unacknowledged }` counts of accepted sends in the grace-aged
 * window. `true` answers as one accepted send that is still unacknowledged
 * (total=1, unacknowledged=1 -> stale); `false` answers as no accepted sends
 * in the window (total=0 -> not stale, whether that's an idle org or one
 * whose every send already has its event — from the worker's side those are
 * the same answer).
 */
function setupSelects(opts: {
  connectedAccounts: (typeof BASE_ACCOUNT)[];
  unacknowledgedSend?: boolean;
  ownerEmail?: string | null;
  orgSlug?: string | null;
}) {
  const resultsByTable = new Map<unknown, unknown[]>([
    [awsAccount, opts.connectedAccounts],
    [
      messageSend,
      opts.unacknowledgedSend === false
        ? [{ total: 0, unacknowledged: 0 }]
        : [{ total: 1, unacknowledged: 1 }],
    ],
    // getOrgOwnerEmail selects .from(member).innerJoin(user, ...) — the
    // dispatch key is the `.from()` table, i.e. `member`, not `user`.
    [
      member,
      opts.ownerEmail === null
        ? []
        : [{ email: opts.ownerEmail ?? OWNER_ROW.email }],
    ],
    [
      organization,
      opts.orgSlug === null ? [] : [{ slug: opts.orgSlug ?? ORG_ROW.slug }],
    ],
  ]);
  mockDbSelect.mockImplementation(makeSelectDispatcher(resultsByTable));
}

describe("event-feed-staleness worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Pin the clock to the fixture anchor. The worker under test compares
    // against `new Date()` at call time, so without this, fixtures anchored
    // to NOW (e.g. "5 min ago" / "fresh") silently age past the grace period
    // once the real wall clock drifts.
    vi.useFakeTimers({ now: NOW });
    // Safe defaults for the SES send-metric fallback (plan 195): a working
    // role reporting zero sends, so any pre-existing test whose account is
    // old enough to reach the fallback still resolves to "not stale" without
    // needing its own CloudWatch setup.
    mockGetCredentials.mockResolvedValue(DEFAULT_CREDENTIALS);
    mockCloudWatchSend.mockResolvedValue(metricResult([]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags a connected account holding a send no event ever acknowledged", async () => {
    setupSelects({
      connectedAccounts: [{ ...BASE_ACCOUNT }],
      unacknowledgedSend: true,
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe(awsAccount);
    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({ eventFeedStaleSince: expect.any(Date) })
    );
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("alerts the owner once when flagged for over an hour and not yet alerted, quoting the real last-event time (plan 194)", async () => {
    // eventFeedStaleSince (2h ago, when the sweep noticed) and
    // lastEventReceivedAt (7h ago, from BASE_ACCOUNT, when an event actually
    // last arrived) are deliberately different values here — the email and
    // the inbox notification must both quote the latter, never the former.
    setupSelects({
      connectedAccounts: [
        {
          ...BASE_ACCOUNT,
          eventFeedStaleSince: TWO_HOURS_AGO,
          eventFeedAlertedAt: null,
        },
      ],
      unacknowledgedSend: true,
      ownerEmail: OWNER_ROW.email,
      orgSlug: ORG_ROW.slug,
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(mockSendEventFeedStaleEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEventFeedStaleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: OWNER_ROW.email,
        accountName: BASE_ACCOUNT.name,
        awsAccountNumber: BASE_ACCOUNT.accountId,
        region: BASE_ACCOUNT.region,
        orgSlug: ORG_ROW.slug,
        awsAccountId: BASE_ACCOUNT.id,
        lastEventAt: SEVEN_HOURS_AGO,
      })
    );

    expect(mockNotifyOrg).toHaveBeenCalledTimes(1);
    const notifyBody = mockNotifyOrg.mock.calls[0][0].body as string;
    expect(notifyBody).toContain(SEVEN_HOURS_AGO.toISOString());
    expect(notifyBody).not.toContain(TWO_HOURS_AGO.toISOString());

    const alertedUpdate = updateCalls.find((c) =>
      c.set.mock.calls.some(
        (args) => (args[0] as Record<string, unknown>).eventFeedAlertedAt
      )
    );
    expect(alertedUpdate).toBeDefined();
    expect(alertedUpdate?.set).toHaveBeenCalledWith(
      expect.objectContaining({ eventFeedAlertedAt: expect.any(Date) })
    );
  });

  it("does not send a second alert once eventFeedAlertedAt is already set", async () => {
    setupSelects({
      connectedAccounts: [
        {
          ...BASE_ACCOUNT,
          eventFeedStaleSince: TWO_HOURS_AGO,
          eventFeedAlertedAt: THIRTY_MIN_AGO,
        },
      ],
      unacknowledgedSend: true,
      ownerEmail: OWNER_ROW.email,
      orgSlug: ORG_ROW.slug,
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("clears both columns once events resume", async () => {
    setupSelects({
      connectedAccounts: [
        {
          ...BASE_ACCOUNT,
          lastEventReceivedAt: new Date(NOW.getTime() - 5 * 60 * 1000), // 5 min ago — fresh
          eventFeedStaleSince: TWO_HOURS_AGO,
          eventFeedAlertedAt: THIRTY_MIN_AGO,
        },
      ],
      // The send probe no longer reads lastEventReceivedAt at all (plan 196),
      // so recovery is driven purely by this cycle's probe coming back
      // healthy plus the cursor being newer than the flag.
      unacknowledgedSend: false,
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe(awsAccount);
    expect(updateCalls[0].set).toHaveBeenCalledWith({
      eventFeedStaleSince: null,
      eventFeedAlertedAt: null,
    });
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("never flags an account with no recent sends (idle org, not a broken feed)", async () => {
    setupSelects({
      connectedAccounts: [{ ...BASE_ACCOUNT }],
      unacknowledgedSend: false,
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(updateCalls).toHaveLength(0);
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("never flags an infrequent sender whose every send was acknowledged", async () => {
    // Regression: the detector used to pair "sent in the last 24h" with "no
    // event in the last 6h", so an account sending one healthy batch a day
    // satisfied both and got alerted while nothing was wrong. Here the last
    // event is 20h old but sits after the last send — no send is waiting on
    // an event, so the probe finds nothing and the feed is not stale.
    setupSelects({
      connectedAccounts: [
        { ...BASE_ACCOUNT, lastEventReceivedAt: TWENTY_HOURS_AGO },
      ],
      unacknowledgedSend: false,
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(updateCalls).toHaveLength(0);
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("keeps the flag when a stale account stops sending without events resuming", async () => {
    // Sends drying up makes the staleness probe go quiet too. Clearing on
    // that alone would resolve the alert for a feed that never came back, so
    // recovery requires an event newer than the flag itself.
    setupSelects({
      connectedAccounts: [
        {
          ...BASE_ACCOUNT,
          lastEventReceivedAt: SEVEN_HOURS_AGO, // predates the flag
          eventFeedStaleSince: TWO_HOURS_AGO,
          eventFeedAlertedAt: THIRTY_MIN_AGO,
        },
      ],
      unacknowledgedSend: false,
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(updateCalls).toHaveLength(0);
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("clears a flag previously raised on an account that never received any event (plan 194)", async () => {
    // Pre-plan-194 behavior could flag a never-connected account (see the
    // gate at the top of the sweep loop). This proves the one-time
    // correction: on the first sweep after the gate exists, both columns
    // are cleared — not left alone, and not treated as a "recovery".
    setupSelects({
      connectedAccounts: [
        {
          ...BASE_ACCOUNT,
          lastEventReceivedAt: null,
          eventFeedStaleSince: TWO_HOURS_AGO,
          eventFeedAlertedAt: THIRTY_MIN_AGO,
        },
      ],
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe(awsAccount);
    expect(updateCalls[0].set).toHaveBeenCalledWith({
      eventFeedStaleSince: null,
      eventFeedAlertedAt: null,
    });
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("never flags or alerts a never-connected account that has a recent send (plan 194)", async () => {
    // lastEventReceivedAt === null short-circuits before hasUnacknowledgedSend
    // ever runs — the messageSend probe's answer must not matter here. Leave
    // unacknowledgedSend unset (defaults to "stale" in setupSelects) to prove
    // the gate, not the predicate, is what keeps this account quiet.
    setupSelects({
      connectedAccounts: [{ ...BASE_ACCOUNT, lastEventReceivedAt: null }],
      unacknowledgedSend: true,
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(updateCalls).toHaveLength(0);
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  // ─── Plan 195: the SES send-metric fallback ───────────────────────────

  it("[SDK sender regression] flags an account with zero message_send rows when CloudWatch reports sends (plan 195)", async () => {
    // The headline case this plan exists for: an SDK sender's message_send
    // rows are created by the webhook itself, so a broken feed produces zero
    // rows -- hasUnacknowledgedSend finds nothing to judge, exactly as if
    // the account were healthy and idle. Fails before this plan's Step 2.
    setupSelects({
      connectedAccounts: [{ ...BASE_ACCOUNT }],
      unacknowledgedSend: false,
    });
    mockCloudWatchSend.mockResolvedValueOnce(metricResult([3, 2]));
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe(awsAccount);
    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({ eventFeedStaleSince: expect.any(Date) })
    );
  });

  it("leaves the account untouched when CloudWatch reports zero sends (plan 195)", async () => {
    setupSelects({
      connectedAccounts: [{ ...BASE_ACCOUNT }],
      unacknowledgedSend: false,
    });
    mockCloudWatchSend.mockResolvedValueOnce(metricResult([]));
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(updateCalls).toHaveLength(0);
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("leaves the account untouched, logs, and does not report to Sentry when the customer role cannot be assumed (plan 195)", async () => {
    // null from the probe means "couldn't check" -- it must never be read as
    // "sent nothing", and a role that was never granted the permission never
    // self-heals, so this is not exceptional the way an unexpected
    // CloudWatch error is (mirrors account-health.ts's role-unreachable
    // handling).
    setupSelects({
      connectedAccounts: [{ ...BASE_ACCOUNT }],
      unacknowledgedSend: false,
    });
    mockGetCredentials.mockRejectedValueOnce(accessDeniedError());
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(updateCalls).toHaveLength(0);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("never calls CloudWatch when the precise DB signal already found an unacknowledged send (plan 195)", async () => {
    // Cost control: the fallback is consulted only when hasUnacknowledgedSend
    // returns false. This proves the ordering, not just the outcome.
    setupSelects({
      connectedAccounts: [{ ...BASE_ACCOUNT }],
      unacknowledgedSend: true,
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(mockCloudWatchSend).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
  });

  it("never calls CloudWatch for an account whose last event is still inside the grace period (plan 195)", async () => {
    setupSelects({
      connectedAccounts: [
        {
          ...BASE_ACCOUNT,
          lastEventReceivedAt: new Date(NOW.getTime() - 5 * 60 * 1000), // 5 min ago — fresh
        },
      ],
      unacknowledgedSend: false,
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(mockCloudWatchSend).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("threads the observed SES send count into the alert email (plan 195)", async () => {
    setupSelects({
      connectedAccounts: [
        {
          ...BASE_ACCOUNT,
          eventFeedStaleSince: TWO_HOURS_AGO,
          eventFeedAlertedAt: null,
        },
      ],
      unacknowledgedSend: false,
      ownerEmail: OWNER_ROW.email,
      orgSlug: ORG_ROW.slug,
    });
    mockCloudWatchSend.mockResolvedValueOnce(metricResult([4, 1]));
    setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    expect(mockSendEventFeedStaleEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEventFeedStaleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ observedSendCount: 5 })
    );
  });

  it("continues the sweep when one org's email send throws, and does not set eventFeedAlertedAt for it", async () => {
    mockSendEventFeedStaleEmail.mockRejectedValueOnce(new Error("SES down"));

    const throwingAccount = {
      ...BASE_ACCOUNT,
      id: "aws-account-throws",
      organizationId: "org-throws",
      eventFeedStaleSince: TWO_HOURS_AGO,
      eventFeedAlertedAt: null,
    };
    const nextAccount = {
      ...BASE_ACCOUNT,
      id: "aws-account-next",
      organizationId: "org-next",
      eventFeedStaleSince: null,
      eventFeedAlertedAt: null,
    };

    setupSelects({
      connectedAccounts: [throwingAccount, nextAccount],
      unacknowledgedSend: true,
      ownerEmail: OWNER_ROW.email,
      orgSlug: ORG_ROW.slug,
    });
    const updateCalls = setupUpdateCapture();

    await handler({} as never, {} as never, {} as never);

    // The throwing account's alert was attempted but never marked alerted.
    const throwingAccountUpdates = updateCalls.filter((c) =>
      c.set.mock.calls.some(
        (args) => (args[0] as Record<string, unknown>).eventFeedAlertedAt
      )
    );
    expect(throwingAccountUpdates).toHaveLength(0);

    // The sweep continued: the next account still got flagged.
    const staleSinceUpdates = updateCalls.filter((c) =>
      c.set.mock.calls.some(
        (args) => (args[0] as Record<string, unknown>).eventFeedStaleSince
      )
    );
    expect(staleSinceUpdates.length).toBeGreaterThanOrEqual(1);
  });
});
