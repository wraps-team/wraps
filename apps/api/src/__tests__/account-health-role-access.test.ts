/**
 * Account Health — broken customer role handling
 *
 * A customer whose `wraps-console-access-role` is deleted or whose trust policy
 * has drifted makes AssumeRole fail with AccessDenied on every hourly sweep.
 * That is a permanent, customer-actionable condition, not a Wraps defect: it
 * must reach the customer's inbox (deduped) rather than Sentry, where it
 * otherwise re-reports forever and nobody is told the account stopped being
 * health-checked.
 *
 * Boundaries mocked: STS/SESv2/CloudWatch (AWS), the database, Sentry, logger.
 * `getCredentials` runs for real so the classification is exercised against the
 * error the AWS SDK actually throws.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT_ROW = {
  id: "acct-row-1",
  organizationId: "org-1",
  name: "Production",
  accountId: "472506473063",
  region: "us-east-1",
  features: { email: { sandbox: false } },
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
vi.mock("@sentry/aws-serverless", () => ({
  captureException: mockCaptureException,
  wrapHandler: (handler: unknown) => handler,
}));

vi.mock("../lib/sentry", () => ({}));

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  flushLogger: vi.fn().mockResolvedValue(undefined),
}));

const mockNotifyOrg = vi.fn().mockResolvedValue([]);
const mockHasRecentNotification = vi.fn().mockResolvedValue(false);

vi.mock("@wraps/db", () => {
  const awsAccountTable = { __table: "awsAccount" };
  const organizationTable = { __table: "organization" };

  // Route results by target table, and by whether the caller narrows with
  // .limit() — the sweep awaits where() directly, the single-row reads do not.
  const chainFor = (table: { __table: string }) => {
    const rows =
      table.__table === "organization" ? [{ slug: "acme" }] : [CREDENTIAL_ROW];
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
      update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    },
    awsAccount: awsAccountTable,
    organization: organizationTable,
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

/** Shape of the STS AccessDenied the broken-role accounts actually produce. */
function accessDeniedError(): Error {
  const error = new Error(
    "User: arn:aws:sts::905130073023:assumed-role/wraps-production-AccountHealthHandlerRole/wraps-production-AccountHealthHandlerFunction is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::472506473063:role/wraps-console-access-role"
  );
  error.name = "AccessDenied";
  return error;
}

const invoke = () =>
  (handler as (event: unknown, ctx: unknown, cb: unknown) => Promise<unknown>)(
    {},
    {},
    () => {
      // noop callback — the handler is promise-based
    }
  );

describe("account-health with an unusable customer role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRecentNotification.mockResolvedValue(false);
    mockNotifyOrg.mockResolvedValue([]);
  });

  it("notifies the organization instead of reporting to Sentry", async () => {
    mockStsSend.mockRejectedValue(accessDeniedError());

    await invoke();

    expect(mockNotifyOrg).toHaveBeenCalledTimes(1);
    const payload = mockNotifyOrg.mock.calls[0][0];
    expect(payload.organizationId).toBe("org-1");
    expect(payload.type).toBe("aws.role_unreachable");
    expect(payload.data).toMatchObject({ awsAccountId: "acct-row-1" });
    // The copy has to name the account and the repair command, or the customer
    // cannot act on it.
    expect(`${payload.title} ${payload.body}`).toContain("472506473063");
    expect(payload.body).toContain("wraps platform update-role");

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("dedupes so an unrepaired role notifies once per window, not hourly", async () => {
    mockStsSend.mockRejectedValue(accessDeniedError());
    mockHasRecentNotification.mockResolvedValue(true);

    await invoke();

    expect(mockNotifyOrg).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("still reports unexpected failures to Sentry", async () => {
    mockStsSend.mockRejectedValue(
      Object.assign(new TypeError("cannot read property of undefined"), {
        name: "TypeError",
      })
    );

    await invoke();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("treats a role that lost SES permissions the same as an unusable role", async () => {
    mockStsSend.mockResolvedValue({
      Credentials: {
        AccessKeyId: "AKIA-test",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2099-01-01"),
      },
    });
    const denied = new Error(
      "User is not authorized to perform: ses:GetAccount"
    );
    denied.name = "AccessDeniedException";
    mockSesSend.mockRejectedValue(denied);

    await invoke();

    expect(mockNotifyOrg).toHaveBeenCalledTimes(1);
    expect(mockNotifyOrg.mock.calls[0][0].type).toBe("aws.role_unreachable");
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
