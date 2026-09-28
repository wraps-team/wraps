/**
 * Account Health — VDM state and advisor recommendations (plan 373)
 *
 * The sweep already holds `GetAccount`'s `VdmAttributes` for free; this test
 * covers persisting it into `healthDetail.vdm`, plus the one extra call
 * (`ListRecommendations`) made only when VDM is enabled.
 *
 * Boundaries mocked: STS/SESv2/CloudWatch (AWS), the database, Sentry, and
 * the logger — same pattern as account-health-policy-stale.test.ts.
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
  ListRecommendationsCommand: class {
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

const mockLogWarn = vi.fn();
vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: mockLogWarn, debug: vi.fn() },
  flushLogger: vi.fn().mockResolvedValue(undefined),
}));

// Real probe against the mocked SES client — every case here sets
// consolePolicyCheckedAt inside the 24h window so it is skipped, keeping the
// SESv2 mock's call list focused on GetAccount / ListRecommendations.
const mockNotifyOrg = vi.fn().mockResolvedValue([]);
const mockHasRecentNotification = vi.fn().mockResolvedValue(false);
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

function baseAccountInfo(overrides: Record<string, unknown> = {}) {
  return {
    SendingEnabled: true,
    EnforcementStatus: "HEALTHY",
    SendQuota: { Max24HourSend: 50_000, SentLast24Hours: 10 },
    ProductionAccessEnabled: false,
    ...overrides,
  };
}

let accountCounter = 0;

describe("account-health VDM state and recommendations", () => {
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
    mockCloudWatchSend.mockResolvedValue({ MetricDataResults: [] });
    ACCOUNT_ROW.roleLastReachableAt = new Date("2026-07-01T00:00:00Z");
    // Inside the 24h window so the console-policy probe is skipped — this
    // file has nothing to do with that feature and should not send extra
    // SESv2 commands the fixture doesn't account for.
    ACCOUNT_ROW.consolePolicyVersion = 6;
    ACCOUNT_ROW.consolePolicyCheckedAt = new Date(Date.now() - 60_000);
    accountCounter += 1;
    ACCOUNT_ROW.id = `acct-row-${accountCounter}`;
  });

  it("persists vdm_disabled and sends no ListRecommendations call when VDM is off", async () => {
    mockSesSend.mockImplementation(
      (command: { constructor: { name: string } }) => {
        if (command.constructor.name === "GetAccountCommand") {
          return Promise.resolve(
            baseAccountInfo({ VdmAttributes: { VdmEnabled: "DISABLED" } })
          );
        }
        throw new Error(`unexpected command: ${command.constructor.name}`);
      }
    );

    await invoke();

    const write = mockDbSet.mock.calls.find(
      (call) => call[0]?.healthStatus !== undefined
    );
    expect(write).toBeDefined();
    expect(write?.[0].healthDetail.vdm).toEqual({
      enabled: false,
      engagementMetrics: false,
      optimizedSharedDelivery: false,
      recommendations: { status: "vdm_disabled" },
    });
  });

  it("sorts HIGH impact first and reports status ok when VDM is enabled", async () => {
    mockSesSend.mockImplementation(
      (command: { constructor: { name: string } }) => {
        if (command.constructor.name === "GetAccountCommand") {
          return Promise.resolve(
            baseAccountInfo({
              VdmAttributes: {
                VdmEnabled: "ENABLED",
                DashboardAttributes: { EngagementMetrics: "ENABLED" },
                GuardianAttributes: { OptimizedSharedDelivery: "ENABLED" },
              },
            })
          );
        }
        if (command.constructor.name === "ListRecommendationsCommand") {
          return Promise.resolve({
            Recommendations: [
              {
                Type: "SPF",
                Impact: "LOW",
                Description: "low impact",
                ResourceArn: "arn:aws:ses:us-east-1:123:identity/x",
                Status: "OPEN",
              },
              {
                Type: "DMARC",
                Impact: "HIGH",
                Description: "high impact",
                ResourceArn: "arn:aws:ses:us-east-1:123:identity/y",
                Status: "OPEN",
              },
            ],
          });
        }
        throw new Error(`unexpected command: ${command.constructor.name}`);
      }
    );

    await invoke();

    const write = mockDbSet.mock.calls.find(
      (call) => call[0]?.healthStatus !== undefined
    );
    expect(write).toBeDefined();
    const vdm = write?.[0].healthDetail.vdm;
    expect(vdm.enabled).toBe(true);
    expect(vdm.recommendations.status).toBe("ok");
    expect(vdm.recommendations.open).toHaveLength(2);
    expect(vdm.recommendations.open[0].type).toBe("DMARC");
    expect(vdm.recommendations.open[0].impact).toBe("HIGH");
    expect(vdm.recommendations.truncated).toBe(false);
  });

  it("stores only the 20 highest-impact recommendations and marks truncated", async () => {
    const twentyFive = Array.from({ length: 25 }, (_, i) => ({
      Type: `TYPE_${i}`,
      Impact: i === 0 ? "HIGH" : "LOW",
      Description: `rec ${i}`,
      Status: "OPEN",
    }));

    mockSesSend.mockImplementation(
      (command: { constructor: { name: string } }) => {
        if (command.constructor.name === "GetAccountCommand") {
          return Promise.resolve(
            baseAccountInfo({ VdmAttributes: { VdmEnabled: "ENABLED" } })
          );
        }
        if (command.constructor.name === "ListRecommendationsCommand") {
          return Promise.resolve({ Recommendations: twentyFive });
        }
        throw new Error(`unexpected command: ${command.constructor.name}`);
      }
    );

    await invoke();

    const write = mockDbSet.mock.calls.find(
      (call) => call[0]?.healthStatus !== undefined
    );
    const vdm = write?.[0].healthDetail.vdm;
    expect(vdm.recommendations.status).toBe("ok");
    expect(vdm.recommendations.open).toHaveLength(20);
    expect(vdm.recommendations.truncated).toBe(true);
  });

  it("reports permission_missing on an AccessDenied ListRecommendations error, without dropping the rest of healthDetail", async () => {
    const denied = new Error("User is not authorized to perform this action");
    denied.name = "AccessDeniedException";

    mockSesSend.mockImplementation(
      (command: { constructor: { name: string } }) => {
        if (command.constructor.name === "GetAccountCommand") {
          return Promise.resolve(
            baseAccountInfo({ VdmAttributes: { VdmEnabled: "ENABLED" } })
          );
        }
        if (command.constructor.name === "ListRecommendationsCommand") {
          return Promise.reject(denied);
        }
        throw new Error(`unexpected command: ${command.constructor.name}`);
      }
    );

    await invoke();

    const write = mockDbSet.mock.calls.find(
      (call) => call[0]?.healthStatus !== undefined
    );
    expect(write).toBeDefined();
    expect(write?.[0].healthDetail.vdm.recommendations).toEqual({
      status: "permission_missing",
    });
    // The rest of healthDetail (e.g. sendingEnabled) is still present.
    expect(write?.[0].healthDetail.sendingEnabled).toBe(true);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("reports unavailable on a BadRequestException, with no Sentry capture", async () => {
    const badRequest = new Error("BadRequestException: something went wrong");
    badRequest.name = "BadRequestException";

    mockSesSend.mockImplementation(
      (command: { constructor: { name: string } }) => {
        if (command.constructor.name === "GetAccountCommand") {
          return Promise.resolve(
            baseAccountInfo({ VdmAttributes: { VdmEnabled: "ENABLED" } })
          );
        }
        if (command.constructor.name === "ListRecommendationsCommand") {
          return Promise.reject(badRequest);
        }
        throw new Error(`unexpected command: ${command.constructor.name}`);
      }
    );

    await invoke();

    const write = mockDbSet.mock.calls.find(
      (call) => call[0]?.healthStatus !== undefined
    );
    expect(write).toBeDefined();
    expect(write?.[0].healthDetail.vdm.recommendations).toEqual({
      status: "unavailable",
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockLogWarn).toHaveBeenCalled();
  });
});
