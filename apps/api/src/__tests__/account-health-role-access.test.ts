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
  features: { email: { sandbox: boolean } };
  roleLastReachableAt: Date | null;
} = {
  id: "acct-row-1",
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

let accountCounter = 0;

describe("account-health with an unusable customer role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRecentNotification.mockResolvedValue(false);
    mockNotifyOrg.mockResolvedValue([]);
    // Default: an account that has passed a check before, so the broken role
    // is a genuine regression. The never-worked case sets this to null.
    ACCOUNT_ROW.roleLastReachableAt = new Date("2026-07-01T00:00:00Z");
    // Default: no active subscription row — not a paying org. Individual
    // tests opt into "paying" or "free-tier active" explicitly.
    SUBSCRIPTION_STATE.row = null;
    // getCredentials caches per `${accountId}:${orgId}` in module scope with
    // the credential's own expiry, so a test that assumes the role successfully
    // would serve every later test from cache and stop them reaching STS at
    // all. A fresh id per test keeps that cache from crossing test boundaries.
    accountCounter += 1;
    ACCOUNT_ROW.id = `acct-row-${accountCounter}`;
  });

  it("notifies the organization instead of reporting to Sentry", async () => {
    mockStsSend.mockRejectedValue(accessDeniedError());

    await invoke();

    expect(mockNotifyOrg).toHaveBeenCalledTimes(1);
    const payload = mockNotifyOrg.mock.calls[0][0];
    expect(payload.organizationId).toBe("org-1");
    expect(payload.type).toBe("aws.role_unreachable");
    expect(payload.data).toMatchObject({ awsAccountId: ACCOUNT_ROW.id });
    // The copy has to name the account and the repair, or the customer cannot
    // act on it. The dashboard button comes first: `href` lands them on the
    // account page, and a dashboard-only customer may have no CLI at all.
    expect(`${payload.title} ${payload.body}`).toContain("472506473063");
    expect(payload.body).toContain("Repair IAM Role");
    expect(payload.body).toContain("wraps platform update-role");
    // Sending assumes this same role, so the alert must say email is blocked —
    // "health checks are not running" alone reads as cosmetic.
    expect(payload.body).toContain("blocked");
    expect(payload.href).toBe(`/acme/settings/aws-accounts/${ACCOUNT_ROW.id}`);

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("stays silent when the role has never once been reachable", async () => {
    // The account that produced 517 Sentry events: registered 2026-05-14, never
    // received an SES event, role never assumable. Nothing regressed, so there
    // is nothing to tell the customer that they could act on.
    ACCOUNT_ROW.roleLastReachableAt = null;
    mockStsSend.mockRejectedValue(accessDeniedError());

    await invoke();

    expect(mockNotifyOrg).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    // Silence must come from the never-reachable rule, not from dedupe
    // accidentally suppressing it — dedupe is off in this test.
    expect(mockHasRecentNotification).not.toHaveBeenCalled();
  });

  it("alerts a previously-working role and says when it last worked", async () => {
    ACCOUNT_ROW.roleLastReachableAt = new Date("2026-07-01T00:00:00Z");
    mockStsSend.mockRejectedValue(accessDeniedError());

    await invoke();

    expect(mockNotifyOrg).toHaveBeenCalledTimes(1);
    expect(mockNotifyOrg.mock.calls[0][0].data).toMatchObject({
      lastReachableAt: "2026-07-01T00:00:00.000Z",
    });
  });

  it("stamps the account as reachable when the check succeeds", async () => {
    // Without this write no account ever becomes alert-eligible, so a role
    // that genuinely breaks later would be silently ignored forever.
    mockStsSend.mockResolvedValue({
      Credentials: {
        AccessKeyId: "AKIA-test",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date("2099-01-01"),
      },
    });
    mockSesSend.mockResolvedValue({
      SendingEnabled: true,
      EnforcementStatus: "HEALTHY",
      SendQuota: { Max24HourSend: 50_000, SentLast24Hours: 10 },
    });
    mockCloudWatchSend.mockResolvedValue({ MetricDataResults: [] });

    await invoke();

    const stamped = mockDbSet.mock.calls.find(
      (call) => call[0]?.roleLastReachableAt instanceof Date
    );
    expect(stamped).toBeDefined();
    expect(mockNotifyOrg).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("does not stamp reachability when the role is unusable", async () => {
    mockStsSend.mockRejectedValue(accessDeniedError());

    await invoke();

    const stamped = mockDbSet.mock.calls.find(
      (call) => call[0]?.roleLastReachableAt !== undefined
    );
    expect(stamped).toBeUndefined();
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

  describe("internal signal for a paying customer", () => {
    it("fires a Sentry warning message for a paying org", async () => {
      SUBSCRIPTION_STATE.row = { plan: "pro" };
      mockStsSend.mockRejectedValue(accessDeniedError());

      await invoke();

      // Customer notification still fires — this signal is additive.
      expect(mockNotifyOrg).toHaveBeenCalledTimes(1);
      expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
      const [message, context] = mockCaptureMessage.mock.calls[0];
      expect(message).toContain("unreachable");
      expect(context.level).toBe("warning");
      expect(
        `${JSON.stringify(context.tags)} ${JSON.stringify(context.extra)}`
      ).toContain("org-1");
      expect(
        `${JSON.stringify(context.tags)} ${JSON.stringify(context.extra)}`
      ).toContain(ACCOUNT_ROW.accountId);
      // Not an exception — a customer misconfiguration is not a Wraps defect.
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it("stays silent for a free-tier org", async () => {
      // The common case per subscription-gate.ts: a free-tier org carries an
      // active `free` subscription row, not the absence of one.
      SUBSCRIPTION_STATE.row = { plan: "free" };
      mockStsSend.mockRejectedValue(accessDeniedError());

      await invoke();

      expect(mockNotifyOrg).toHaveBeenCalledTimes(1);
      expect(mockCaptureMessage).not.toHaveBeenCalled();
    });

    it("stays silent when the customer notification was deduped", async () => {
      SUBSCRIPTION_STATE.row = { plan: "pro" };
      mockStsSend.mockRejectedValue(accessDeniedError());
      mockHasRecentNotification.mockResolvedValue(true);

      await invoke();

      // Proves the internal signal inherits notifyOnce's real return value —
      // not a mocked boolean that would pass regardless — because dedupe is
      // driven here through hasRecentNotification, the actual dedupe check.
      expect(mockNotifyOrg).not.toHaveBeenCalled();
      expect(mockCaptureMessage).not.toHaveBeenCalled();
    });

    it("stays silent when the role has never once been reachable, even for a paying org", async () => {
      SUBSCRIPTION_STATE.row = { plan: "pro" };
      ACCOUNT_ROW.roleLastReachableAt = null;
      mockStsSend.mockRejectedValue(accessDeniedError());

      await invoke();

      expect(mockNotifyOrg).not.toHaveBeenCalled();
      expect(mockCaptureMessage).not.toHaveBeenCalled();
    });

    it("never includes the external id or webhook secret in the captured payload", async () => {
      SUBSCRIPTION_STATE.row = { plan: "pro" };
      mockStsSend.mockRejectedValue(accessDeniedError());

      await invoke();

      expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
      const [, context] = mockCaptureMessage.mock.calls[0];
      const serialized = JSON.stringify(context);
      expect(serialized).not.toContain("externalId");
      expect(serialized).not.toContain("ext-1");
      expect(serialized).not.toContain("webhookSecret");
    });
  });
});
