/**
 * Account Health — SES production access
 *
 * AWS publishes no event when an account leaves the SES sandbox; the hourly
 * sweep reading GetAccount.ProductionAccessEnabled is the only signal. When it
 * sees production access the sweep must flip the stored flag and emit the
 * `activation.production_access` platform event onboarding workflows trigger
 * on — including for accounts whose sandbox flag was never recorded, which no
 * "transition" check would ever catch. The inbox "granted" notice stays
 * reserved for a real sandbox exit.
 *
 * Boundaries mocked: STS/SESv2/CloudWatch (AWS), the database, Sentry, logger,
 * and the activation-tracking module (its platform calls are covered by
 * activation-tracking.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mutable so a test can flip the account between "has passed a check before"
 * and "never has" — that distinction is what decides whether a broken role is
 * a reportable regression or an unfinished setup.
 */
const ACCOUNT_ROW: {
  id: string;
  organizationId: string;
  name: string;
  accountId: string;
  region: string;
  features: { email?: { sandbox?: boolean } } | null;
  createdBy: string | null;
  roleLastReachableAt: Date | null;
} = {
  id: "acct-row-1",
  organizationId: "org-1",
  name: "Production",
  accountId: "472506473063",
  region: "us-east-1",
  features: { email: { sandbox: false } },
  createdBy: "user-1",
  roleLastReachableAt: new Date("2026-07-01T00:00:00Z"),
};

const CREDENTIAL_ROW = {
  roleArn: "arn:aws:iam::472506473063:role/wraps-console-access-role",
  externalId: "ext-1",
  region: "us-east-1",
};

/**
 * The org's subscription row, as read by hasActivePaidSubscription. `null`
 * means no active subscription row at all; `{ plan: "free" }` means an
 * active free-tier subscription (the common case per subscription-gate.ts) —
 * both must be treated as "not paying".
 */
const SUBSCRIPTION_STATE: { row: { plan: string } | null } = { row: null };

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

const mockNotifyOrg = vi.fn().mockResolvedValue([]);
const mockHasRecentNotification = vi.fn().mockResolvedValue(false);
/** Captures every db.update().set() payload so the "known good" stamp is visible. */
const mockDbSet = vi.fn();

vi.mock("@wraps/db", () => {
  const awsAccountTable = { __table: "awsAccount" };
  const organizationTable = { __table: "organization" };
  const subscriptionTable = { __table: "subscription" };

  // Route results by target table, and by whether the caller narrows with
  // .limit() — the sweep awaits where() directly, the single-row reads do not.
  const chainFor = (table: { __table: string }) => {
    let rows: unknown[];
    if (table.__table === "organization") {
      rows = [{ slug: "acme" }];
    } else if (table.__table === "subscription") {
      rows = SUBSCRIPTION_STATE.row ? [SUBSCRIPTION_STATE.row] : [];
    } else {
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

const mockTrackProductionAccess = vi.fn().mockResolvedValue(undefined);
vi.mock("../lib/activation-tracking", () => ({
  trackProductionAccess: mockTrackProductionAccess,
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

let accountCounter = 0;

function sesAccount(productionAccess: boolean) {
  return {
    SendingEnabled: true,
    EnforcementStatus: "HEALTHY",
    ProductionAccessEnabled: productionAccess,
    SendQuota: { Max24HourSend: 50_000, SentLast24Hours: 10 },
  };
}

const sandboxWrites = () =>
  mockDbSet.mock.calls.filter(
    (call) => call[0]?.features?.email?.sandbox === false
  );

const productionNotices = () =>
  mockNotifyOrg.mock.calls.filter(
    (call) => call[0]?.type === "ses.production_access"
  );

describe("account-health SES production access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRecentNotification.mockResolvedValue(false);
    mockNotifyOrg.mockResolvedValue([]);
    SUBSCRIPTION_STATE.row = null;
    ACCOUNT_ROW.roleLastReachableAt = new Date("2026-07-01T00:00:00Z");
    // getCredentials caches per account in module scope; a fresh id per test
    // keeps one test's assumed role from serving the next.
    accountCounter += 1;
    ACCOUNT_ROW.id = `acct-prod-${accountCounter}`;
    mockStsSend.mockResolvedValue({
      Credentials: {
        AccessKeyId: "AKIA-test",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2099-01-01"),
      },
    });
    mockCloudWatchSend.mockResolvedValue({ MetricDataResults: [] });
  });

  it("emits the event, flips the flag and notifies on a real sandbox exit", async () => {
    ACCOUNT_ROW.features = { email: { sandbox: true } };
    mockSesSend.mockResolvedValue(sesAccount(true));

    await invoke();

    expect(sandboxWrites()).toHaveLength(1);
    expect(productionNotices()).toHaveLength(1);
    expect(mockTrackProductionAccess).toHaveBeenCalledTimes(1);
    // The connecting user, so the flag lands on the contact that got
    // activation.aws_connected.
    expect(mockTrackProductionAccess).toHaveBeenCalledWith("org-1", "user-1", {
      region: "us-east-1",
      accountId: "472506473063",
    });
  });

  it("emits for an account whose sandbox flag was never recorded, without announcing it", async () => {
    // Never scanned from the dashboard: features.email exists but carries no
    // sandbox key. A `sandbox === true` check would skip this account forever.
    ACCOUNT_ROW.features = { email: {} };
    mockSesSend.mockResolvedValue(sesAccount(true));

    await invoke();

    expect(sandboxWrites()).toHaveLength(1);
    expect(mockTrackProductionAccess).toHaveBeenCalledTimes(1);
    // Nothing was "granted" that we saw; the account may always have had it.
    expect(productionNotices()).toHaveLength(0);
  });

  it("stays quiet once the flag already says production", async () => {
    // Without this the event would re-fire every hour for every account.
    ACCOUNT_ROW.features = { email: { sandbox: false } };
    mockSesSend.mockResolvedValue(sesAccount(true));

    await invoke();

    expect(mockTrackProductionAccess).not.toHaveBeenCalled();
    expect(sandboxWrites()).toHaveLength(0);
    expect(productionNotices()).toHaveLength(0);
  });

  it("does nothing while the account is still in the sandbox", async () => {
    ACCOUNT_ROW.features = { email: { sandbox: true } };
    mockSesSend.mockResolvedValue(sesAccount(false));

    await invoke();

    expect(mockTrackProductionAccess).not.toHaveBeenCalled();
    expect(sandboxWrites()).toHaveLength(0);
  });

  it("ignores accounts with no email features at all", async () => {
    // An SMS-only account: writing an email block would make it look like
    // email had been deployed there.
    ACCOUNT_ROW.features = null;
    mockSesSend.mockResolvedValue(sesAccount(true));

    await invoke();

    expect(mockTrackProductionAccess).not.toHaveBeenCalled();
    expect(sandboxWrites()).toHaveLength(0);
  });
});
