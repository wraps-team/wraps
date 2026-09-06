/**
 * Account Health — a CloudWatch reputation read failing must not take the
 * customer-facing alerts (or the reachability stamp) down with it.
 *
 * `checkAccount` stamps `roleLastReachableAt` immediately after `GetAccount`
 * succeeds, in its own `db.update`. Blocks 1 (sending paused), 2 (sandbox ->
 * production), and 3 (quota) run next, using only the `GetAccount` response —
 * no CloudWatch dependency. Only THEN is CloudWatch read, for block 4
 * (reputation) and the persisted health verdict, which is written last in its
 * own separate `db.update`. This ordering guards two regressions a prior
 * revision of this worker introduced by moving CloudWatch ahead of the alert
 * blocks and merging the stamp into the verdict write: a CloudWatch throttle,
 * 5xx, or a role missing `cloudwatch:GetMetricData` would have thrown before
 * the stamp landed AND before blocks 1-3 ever ran, silently killing every
 * alert for that account for the hour — worse than the pre-existing behavior
 * on `main`, where only the reputation check depended on CloudWatch.
 *
 * Boundaries mocked: STS/SESv2/CloudWatch (AWS), the database, Sentry, logger.
 * Harness copied from account-health-role-access.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT_ROW: {
  id: string;
  organizationId: string;
  name: string;
  accountId: string;
  region: string;
  features: { email: { sandbox: boolean } };
  roleLastReachableAt: Date | null;
} = {
  id: "acct-row-cw-1",
  organizationId: "org-1",
  name: "Production",
  accountId: "472506473063",
  region: "us-east-1",
  features: { email: { sandbox: false } },
  roleLastReachableAt: new Date("2026-07-01T00:00:00Z"),
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

const mockNotifyOrg = vi.fn().mockResolvedValue([]);
const mockHasRecentNotification = vi.fn().mockResolvedValue(false);
/** Captures every db.update().set() payload so each write is visible. */
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

const { handler } = await import("../workers/account-health");

const invoke = () =>
  (handler as (event: unknown, ctx: unknown, cb: unknown) => Promise<unknown>)(
    {},
    {},
    () => {
      // noop callback — the handler is promise-based
    }
  );

describe("account-health when the CloudWatch reputation read fails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRecentNotification.mockResolvedValue(false);
    mockNotifyOrg.mockResolvedValue([]);
    ACCOUNT_ROW.roleLastReachableAt = new Date("2026-07-01T00:00:00Z");
    ACCOUNT_ROW.id = "acct-row-cw-1";

    mockStsSend.mockResolvedValue({
      Credentials: {
        AccessKeyId: "AKIA-test",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2099-01-01"),
      },
    });
    mockSesSend.mockResolvedValue({
      SendingEnabled: false,
      EnforcementStatus: "HEALTHY",
      SendQuota: { Max24HourSend: 50_000, SentLast24Hours: 10 },
    });
    mockCloudWatchSend.mockRejectedValue(
      Object.assign(new Error("Rate exceeded"), { name: "ThrottlingException" })
    );
  });

  it("still stamps roleLastReachableAt even though CloudWatch failed afterward", async () => {
    await invoke();

    const stamped = mockDbSet.mock.calls.find(
      (call) => call[0]?.roleLastReachableAt instanceof Date
    );
    expect(stamped).toBeDefined();
  });

  it("does not write a health verdict when CloudWatch failed", async () => {
    await invoke();

    const verdictWrite = mockDbSet.mock.calls.find(
      (call) => call[0]?.healthStatus !== undefined
    );
    expect(verdictWrite).toBeUndefined();
  });

  it("still fires ses.sending_paused even though CloudWatch failed afterward", async () => {
    // Block 1 runs on the GetAccount response alone, before CloudWatch is
    // ever read, so a CloudWatch failure must not suppress it — the whole
    // point of moving the CloudWatch read back after blocks 1-3.
    await invoke();

    expect(mockNotifyOrg).toHaveBeenCalledTimes(1);
    const payload = mockNotifyOrg.mock.calls[0][0];
    expect(payload.type).toBe("ses.sending_paused");
    expect(payload.title).toContain("paused");
  });

  it("still reports the CloudWatch failure itself to the generic per-account catch", async () => {
    await invoke();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
