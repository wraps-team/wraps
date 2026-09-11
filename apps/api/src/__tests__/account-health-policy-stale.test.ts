/**
 * Account Health — stale console-policy notification
 *
 * Plan 282 fingerprints which version of the `wraps-console-access-role`
 * policy a customer's role carries and writes it to
 * `aws_account.consolePolicyVersion`. This plan raises a customer-facing
 * `aws.role_policy_stale` notification when a *fresh* probe on this sweep
 * observes a version below `CURRENT_CONSOLE_POLICY_VERSION` — distinct from
 * `aws.role_unreachable` (the role doesn't work at all; see
 * account-health-role-access.test.ts). Every case here is the success path:
 * the role assumes, SES answers, the probe runs — the opposite fixture from
 * that file's AssumeRole-failure mocks.
 *
 * Boundaries mocked: STS/SESv2/CloudWatch (AWS), the database, Sentry,
 * logger, and `probeConsolePolicyVersion` itself — mocked directly so each
 * case can choose its return value without depending on which marker actions
 * a stub SES client would need to succeed or fail.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mutable so each case can set its own stored `consolePolicyVersion` /
 * `consolePolicyCheckedAt` — the pre-probe reading the sweep loads before
 * deciding whether to probe at all.
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
    notifyOrg: mockNotifyOrg,
    hasRecentNotification: mockHasRecentNotification,
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

describe("account-health console-policy-stale notification", () => {
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
    ACCOUNT_ROW.roleLastReachableAt = new Date("2026-07-01T00:00:00Z");
    ACCOUNT_ROW.consolePolicyVersion = null;
    ACCOUNT_ROW.consolePolicyCheckedAt = null;
    // getCredentials caches per `${accountId}:${orgId}` in module scope with
    // the credential's own expiry, so a test that assumes the role
    // successfully would serve every later test from cache. A fresh id per
    // test keeps that cache from crossing test boundaries.
    accountCounter += 1;
    ACCOUNT_ROW.id = `acct-row-${accountCounter}`;
  });

  it("notifies aws.role_policy_stale when a fresh probe returns a version below current", async () => {
    mockProbeConsolePolicyVersion.mockResolvedValue({
      version: CURRENT_CONSOLE_POLICY_VERSION - 1,
      unreachable: false,
    });

    await invoke();

    expect(mockProbeConsolePolicyVersion).toHaveBeenCalledTimes(1);
    expect(mockNotifyOrg).toHaveBeenCalledTimes(1);
    const payload = mockNotifyOrg.mock.calls[0][0];
    expect(payload.type).toBe("aws.role_policy_stale");
    expect(payload.organizationId).toBe("org-1");
    expect(payload.data).toMatchObject({
      awsAccountId: ACCOUNT_ROW.id,
      version: CURRENT_CONSOLE_POLICY_VERSION - 1,
    });
    expect(payload.href).toBe(`/acme/settings/aws-accounts/${ACCOUNT_ROW.id}`);
    expect(mockCaptureException).not.toHaveBeenCalled();
    // Not an incident — no internal Sentry signal, unlike aws.role_unreachable.
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("does not notify when the fresh probe returns the current version", async () => {
    mockProbeConsolePolicyVersion.mockResolvedValue({
      version: CURRENT_CONSOLE_POLICY_VERSION,
      unreachable: false,
    });

    await invoke();

    expect(mockProbeConsolePolicyVersion).toHaveBeenCalledTimes(1);
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("does not notify when the probe returns unreachable, regardless of version", async () => {
    // A throttled/unrecognised error is not a policy-version fact — even a
    // low version number here must not be read as "behind".
    mockProbeConsolePolicyVersion.mockResolvedValue({
      version: 0,
      unreachable: true,
    });

    await invoke();

    expect(mockProbeConsolePolicyVersion).toHaveBeenCalledTimes(1);
    expect(mockNotifyOrg).not.toHaveBeenCalled();
    // Nothing to persist either — the previous reading stays in place.
    const policyWrite = mockDbSet.mock.calls.find(
      (call) => call[0]?.consolePolicyVersion !== undefined
    );
    expect(policyWrite).toBeUndefined();
  });

  it("still skips the probe for an up-to-date role inside the 24h window", async () => {
    ACCOUNT_ROW.consolePolicyVersion = CURRENT_CONSOLE_POLICY_VERSION;
    ACCOUNT_ROW.consolePolicyCheckedAt = new Date(Date.now() - 60_000);

    await invoke();

    expect(mockProbeConsolePolicyVersion).not.toHaveBeenCalled();
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("re-probes a role already known to be behind, even inside the 24h window", async () => {
    // The window used to apply here too, so a customer who repaired their
    // role went on being told it was broken for up to a day — the one moment
    // they are actually watching the banner. An account known to be behind is
    // the case where a change is expected, so it is re-probed every sweep.
    ACCOUNT_ROW.consolePolicyVersion = CURRENT_CONSOLE_POLICY_VERSION - 1;
    ACCOUNT_ROW.consolePolicyCheckedAt = new Date(Date.now() - 60_000);
    mockProbeConsolePolicyVersion.mockResolvedValue({
      version: CURRENT_CONSOLE_POLICY_VERSION,
      unreachable: false,
    });

    await invoke();

    expect(mockProbeConsolePolicyVersion).toHaveBeenCalledTimes(1);
    // The repair is observed and persisted, which is what clears the banner.
    const policyWrite = mockDbSet.mock.calls.find(
      (call) => call[0]?.consolePolicyVersion !== undefined
    );
    expect(policyWrite?.[0].consolePolicyVersion).toBe(
      CURRENT_CONSOLE_POLICY_VERSION
    );
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("does not re-notify a still-behind account on every sweep", async () => {
    // Probing hourly must not mean notifying hourly. The guard is
    // notifyOnce's own 24h dedupe against the notification table, which is
    // independent of the probe throttle — if the two are ever collapsed back
    // into one window, this fails.
    ACCOUNT_ROW.consolePolicyVersion = CURRENT_CONSOLE_POLICY_VERSION - 1;
    ACCOUNT_ROW.consolePolicyCheckedAt = new Date(Date.now() - 60_000);
    mockProbeConsolePolicyVersion.mockResolvedValue({
      version: CURRENT_CONSOLE_POLICY_VERSION - 1,
      unreachable: false,
    });
    mockHasRecentNotification.mockResolvedValue(true);

    await invoke();

    expect(mockProbeConsolePolicyVersion).toHaveBeenCalledTimes(1);
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });
});
