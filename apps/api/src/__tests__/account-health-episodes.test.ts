/**
 * Account Health — SES alerts notify once per episode
 *
 * Sending-paused, reputation and quota alerts used to fire on every sweep
 * that saw the condition, deduped only to once per 24h, so one account in
 * the reputation review range collected 71 daily inbox rows. They now fire
 * when an account goes into the condition: the previous sweep's reading,
 * persisted in `healthDetail`, already showing it means the episode is
 * ongoing and the customer was told.
 *
 * Harness copied from account-health-policy-stale.test.ts; the policy probe
 * returns the current version so it never adds a notification of its own.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mutable so each case can set its own stored `healthDetail` — the previous
 * sweep's reading the alerts compare against.
 */
const ACCOUNT_ROW: {
  id: string;
  organizationId: string;
  name: string;
  accountId: string;
  region: string;
  features: { email: { sandbox: boolean } };
  roleLastReachableAt: Date | null;
  consolePolicyVersion: number | null;
  consolePolicyCheckedAt: Date | null;
  healthDetail: Record<string, unknown> | null;
} = {
  id: "acct-row-1",
  organizationId: "org-1",
  name: "Production",
  accountId: "472506473063",
  region: "us-east-1",
  features: { email: { sandbox: false } },
  roleLastReachableAt: new Date("2026-07-01T00:00:00Z"),
  consolePolicyVersion: null,
  consolePolicyCheckedAt: null,
  healthDetail: null,
};

const CREDENTIAL_ROW = {
  roleArn: "arn:aws:iam::472506473063:role/wraps-console-access-role",
  externalId: "ext-1",
  region: "us-east-1",
};

const mockStsSend = vi.fn();
const mockSesSend = vi.fn();
const mockCloudWatchSend = vi.fn();

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: class {
    send = mockStsSend;
  },
  AssumeRoleCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = mockSesSend;
  },
  GetAccountCommand: class {
    constructor(public input: unknown) {}
  },
}));

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
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
  wrapHandler: (handler: unknown) => handler,
  withMonitor: (_slug: string, fn: () => unknown) => fn(),
}));

vi.mock("../lib/sentry", () => ({}));

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  flushLogger: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Mocked directly rather than driven through stub SES commands: each case
 * below chooses its own probe outcome, independent of which marker actions a
 * fake client would need to answer.
 */
const mockProbeConsolePolicyVersion = vi.fn();
vi.mock("../lib/console-policy-version", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/console-policy-version")>();
  return {
    ...actual,
    probeConsolePolicyVersion: (
      ...args: Parameters<typeof actual.probeConsolePolicyVersion>
    ) => mockProbeConsolePolicyVersion(...args),
  };
});

const mockNotifyOrg = vi.fn().mockResolvedValue([]);
const mockHasRecentNotification = vi.fn().mockResolvedValue(false);
/** Captures every db.update().set() payload so persistence can be inspected. */
const mockDbSet = vi.fn();

// notifyOrg now comes from @wraps/auth/notify (the @byo-oss/notifications plugin
// path), not @wraps/db, so it is stubbed on its own module.
vi.mock("@wraps/auth/notify", () => ({
  notifyOrg: (...args: unknown[]) => mockNotifyOrg(...args),
}));

vi.mock("@wraps/db", () => {
  const awsAccountTable = { __table: "awsAccount" };
  const organizationTable = { __table: "organization" };
  const subscriptionTable = { __table: "subscription" };

  const chainFor = (table: { __table: string }) => {
    let rows: unknown[];
    if (table.__table === "organization") {
      rows = [{ slug: "acme" }];
    } else if (table.__table === "subscription") {
      rows = [];
    } else {
      // getCredentials' own `.limit(1)` lookup lands here — it needs
      // roleArn/externalId, which ACCOUNT_ROW does not carry.
      rows = [CREDENTIAL_ROW];
    }
    return {
      where: () => ({
        limit: () => Promise.resolve(rows),
        then: (
          resolve: (value: unknown) => unknown,
          reject: (reason: unknown) => unknown
        ) => Promise.resolve([ACCOUNT_ROW]).then(resolve, reject),
      }),
    };
  };

  return {
    db: {
      select: () => ({ from: chainFor }),
      update: () => ({
        set: (values: unknown) => {
          mockDbSet(values);
          return { where: () => Promise.resolve([]) };
        },
      }),
    },
    awsAccount: awsAccountTable,
    organization: organizationTable,
    subscription: subscriptionTable,
    hasRecentNotification: mockHasRecentNotification,
    closeDbConnection: vi.fn(),
    eq: vi.fn(),
    and: vi.fn(),
    isNotNull: vi.fn(),
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNotNull: vi.fn(),
}));

// `getCredentials` runs for real, exercised against the mocked STS client and
// the mocked db above — same pattern as account-health-role-access.test.ts.
const { CURRENT_CONSOLE_POLICY_VERSION } = await import(
  "../lib/console-policy-version"
);
// Its platform calls are covered by activation-tracking.test.ts; the real
// module drags in schema imports the drizzle-orm mock above cannot satisfy.
vi.mock("../lib/activation-tracking", () => ({
  trackProductionAccess: vi.fn().mockResolvedValue(undefined),
}));

const { handler } = await import("../workers/account-health");

const invoke = () =>
  (handler as (event: unknown, ctx: unknown, cb: unknown) => Promise<unknown>)(
    {},
    {},
    () => {
      // noop callback — the handler is promise-based
    }
  );

/** A healthy GetAccount response that trips none of the other sweep alerts. */
function healthyAccountInfo() {
  return {
    SendingEnabled: true,
    EnforcementStatus: "HEALTHY",
    SendQuota: { Max24HourSend: 50_000, SentLast24Hours: 10 },
    ProductionAccessEnabled: false,
  };
}

let accountCounter = 0;

/** A previous-sweep reading with every alert condition clear. */
function clearDetail(): Record<string, unknown> {
  return {
    bounceRate: 0.001,
    complaintRate: 0,
    quotaUsedRatio: 0.01,
    sendingEnabled: true,
    enforcementStatus: "HEALTHY",
  };
}

function bounceRateOf(rate: number) {
  return {
    MetricDataResults: [
      { Id: "bounce", Values: [rate] },
      { Id: "complaint", Values: [0] },
    ],
  };
}

const notifiedTypes = () =>
  mockNotifyOrg.mock.calls.map((call) => call[0].type as string);

describe("account-health SES alerts notify once per episode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRecentNotification.mockResolvedValue(false);
    mockNotifyOrg.mockResolvedValue([]);
    mockStsSend.mockResolvedValue({
      Credentials: {
        AccessKeyId: "AKIA-test",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2099-01-01"),
      },
    });
    mockSesSend.mockResolvedValue(healthyAccountInfo());
    mockCloudWatchSend.mockResolvedValue({ MetricDataResults: [] });
    mockProbeConsolePolicyVersion.mockResolvedValue({
      version: CURRENT_CONSOLE_POLICY_VERSION,
      unreachable: false,
    });
    ACCOUNT_ROW.healthDetail = clearDetail();
    // getCredentials caches per account id in module scope; see
    // account-health-policy-stale.test.ts.
    accountCounter += 1;
    ACCOUNT_ROW.id = `acct-row-episode-${accountCounter}`;
  });

  it("notifies ses.reputation_warning when the bounce rate crosses into review", async () => {
    mockCloudWatchSend.mockResolvedValue(bounceRateOf(0.06));

    await invoke();

    expect(notifiedTypes()).toEqual(["ses.reputation_warning"]);
  });

  it("stays quiet while the previous sweep already saw the bounce rate in review", async () => {
    ACCOUNT_ROW.healthDetail = { ...clearDetail(), bounceRate: 0.07 };
    mockCloudWatchSend.mockResolvedValue(bounceRateOf(0.06));

    await invoke();

    expect(notifiedTypes()).toEqual([]);
  });

  it("notifies ses.sending_paused when sending goes from enabled to paused", async () => {
    mockSesSend.mockResolvedValue({
      ...healthyAccountInfo(),
      SendingEnabled: false,
    });

    await invoke();

    expect(notifiedTypes()).toEqual(["ses.sending_paused"]);
  });

  it("notifies ses.sending_paused off a previous reading with no enforcementStatus key", async () => {
    // Rows written before enforcementStatus existed lack the key; that must
    // read as clear, not as an episode already under way.
    const { enforcementStatus: _omitted, ...oldShape } = clearDetail();
    ACCOUNT_ROW.healthDetail = oldShape;
    mockSesSend.mockResolvedValue({
      ...healthyAccountInfo(),
      SendingEnabled: false,
    });

    await invoke();

    expect(notifiedTypes()).toEqual(["ses.sending_paused"]);
  });

  it("stays quiet while sending was already paused on the previous sweep", async () => {
    ACCOUNT_ROW.healthDetail = { ...clearDetail(), sendingEnabled: false };
    mockSesSend.mockResolvedValue({
      ...healthyAccountInfo(),
      SendingEnabled: false,
    });

    await invoke();

    expect(notifiedTypes()).toEqual([]);
  });

  it("stays quiet while the quota was already past the warning line", async () => {
    ACCOUNT_ROW.healthDetail = { ...clearDetail(), quotaUsedRatio: 0.85 };
    mockSesSend.mockResolvedValue({
      ...healthyAccountInfo(),
      SendQuota: { Max24HourSend: 100, SentLast24Hours: 90 },
    });

    await invoke();

    expect(notifiedTypes()).toEqual([]);
  });

  it("treats an account with no previous reading as all clear", async () => {
    // Never swept, or the last verdict write never ran: the first sweep to
    // see a problem must report it.
    ACCOUNT_ROW.healthDetail = null;
    mockSesSend.mockResolvedValue({
      ...healthyAccountInfo(),
      SendQuota: { Max24HourSend: 100, SentLast24Hours: 90 },
    });

    await invoke();

    expect(notifiedTypes()).toEqual(["ses.quota_warning"]);
  });
});
