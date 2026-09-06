/**
 * GET /v1/account/health and /v1/account/health/:awsAccountId — real DB.
 *
 * Serves the verdict plan 205's hourly sweep persists on `aws_account`
 * (healthStatus/healthCheckedAt/healthDetail). This route is Postgres-only —
 * no AWS SDK call, no credential resolution — so the only boundaries worth
 * mocking are the ones that would prove a regression: getCredentials and the
 * AWS SDK client constructors, asserted never called.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 */

import { awsAccount, db, eq } from "@wraps/db";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { createErrorHarness } from "./error-handler-harness";

const mockSesConstructor = vi.fn();
const mockCloudWatchConstructor = vi.fn();
const mockStsConstructor = vi.fn();

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    constructor(...args: unknown[]) {
      mockSesConstructor(...args);
    }
  },
  GetAccountCommand: class {},
}));

vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: class {
    constructor(...args: unknown[]) {
      mockCloudWatchConstructor(...args);
    }
  },
  GetMetricDataCommand: class {},
}));

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: class {
    constructor(...args: unknown[]) {
      mockStsConstructor(...args);
    }
  },
  AssumeRoleCommand: class {},
}));

vi.mock("../services/credentials", () => ({
  getCredentials: vi.fn(async () => {
    throw new Error(
      "getCredentials should never be called by the health route — it is Postgres-only"
    );
  }),
}));

const { accountRoutes } = await import("../routes/account");
const { SES_THRESHOLDS } = await import("../lib/ses-health");

const TEST_PREFIX = "acct-health-api";
const SECOND_ACCOUNT_ID = `${TEST_PREFIX}-aws-second`;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

function appFor(organizationId: string) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: {
        apiKeyId: "key-1",
        organizationId,
        userId: null,
        planId: "pro",
      },
    }))
    .use(accountRoutes);
}

function unauthedApp() {
  const { app } = createErrorHarness();
  return app.use(accountRoutes);
}

type HealthDetailShape = NonNullable<
  typeof awsAccount.$inferSelect.healthDetail
>;

function detail(overrides: Partial<HealthDetailShape> = {}): HealthDetailShape {
  return {
    bounceRate: null,
    complaintRate: null,
    quotaUsedRatio: null,
    sendingEnabled: null,
    enforcementStatus: null,
    productionAccessEnabled: null,
    max24HourSend: null,
    sentLast24Hours: null,
    maxSendRate: null,
    reasons: [],
    ...overrides,
  };
}

async function resetPrimaryAccountToNeverSwept() {
  await db
    .update(awsAccount)
    .set({ healthStatus: null, healthCheckedAt: null, healthDetail: null })
    .where(eq(awsAccount.id, ids.awsAccount));
}

async function removeSecondAccount() {
  await db.delete(awsAccount).where(eq(awsAccount.id, SECOND_ACCOUNT_ID));
}

async function insertSecondAccount(overrides: {
  healthStatus?: "healthy" | "at_risk" | "in_danger" | null;
  healthCheckedAt?: Date | null;
  healthDetail?: HealthDetailShape | null;
}) {
  const now = new Date();
  await db.insert(awsAccount).values({
    id: SECOND_ACCOUNT_ID,
    organizationId: ids.org,
    name: "Second AWS",
    accountId: "999999999999",
    region: "us-east-1",
    roleArn: "arn:aws:iam::999999999999:role/wraps",
    externalId: `${TEST_PREFIX}-ext-second`,
    webhookSecret: "secret",
    isVerified: true,
    healthStatus: overrides.healthStatus ?? null,
    healthCheckedAt: overrides.healthCheckedAt ?? null,
    healthDetail: overrides.healthDetail ?? null,
    createdAt: now,
    updatedAt: now,
  } as typeof awsAccount.$inferInsert);
}

function findAllSecretLikeKeys(value: unknown, path = ""): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) {
      hits.push(...findAllSecretLikeKeys(v, `${path}[${i}]`));
    }
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (/secret/i.test(k) || k === "roleArn" || k === "externalId") {
        hits.push(`${path}.${k}`);
      }
      hits.push(...findAllSecretLikeKeys(v, `${path}.${k}`));
    }
  }
  return hits;
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(TEST_PREFIX);
  ids = fixture.ids;
});

afterEach(async () => {
  await resetPrimaryAccountToNeverSwept();
  await removeSecondAccount();
  mockSesConstructor.mockClear();
  mockCloudWatchConstructor.mockClear();
  mockStsConstructor.mockClear();
});

afterAll(async () => {
  await removeSecondAccount();
  await cleanupBaseOrg(TEST_PREFIX);
});

describe("GET /v1/account/health — auth", () => {
  it("returns 401 with no auth header", async () => {
    const app = unauthedApp();
    const res = await app.handle(
      new Request("http://localhost/v1/account/health")
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/account/health — cross-org isolation", () => {
  it("an org sees only its own accounts, never another org's", async () => {
    const app = appFor(ids.org);
    const res = await app.handle(
      new Request("http://localhost/v1/account/health")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const returnedIds = body.accounts.map((a: { id: string }) => a.id);
    expect(returnedIds).toContain(ids.awsAccount);
    expect(returnedIds).not.toContain(ids.otherAwsAccount);
  });

  it("404s when :awsAccountId names another org's account", async () => {
    const app = appFor(ids.org);
    const res = await app.handle(
      new Request(`http://localhost/v1/account/health/${ids.otherAwsAccount}`)
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /v1/account/health/:awsAccountId — never-swept account", () => {
  it("reports unknown status and null checkedAt, not healthy", async () => {
    const app = appFor(ids.org);
    const res = await app.handle(
      new Request(`http://localhost/v1/account/health/${ids.awsAccount}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("unknown");
    expect(body.checkedAt).toBeNull();
  });

  it("emits null, not 0/false, for quota/reputation/sandbox fields", async () => {
    const app = appFor(ids.org);
    const res = await app.handle(
      new Request(`http://localhost/v1/account/health/${ids.awsAccount}`)
    );
    const body = await res.json();
    expect(body.quota.usedRatio).toBeNull();
    expect(body.reputation.bounceRate).toBeNull();
    expect(body.sandbox).toBeNull();
  });
});

describe("GET /v1/account/health — rollup", () => {
  it("rolls healthy + unknown (never-swept) up to unknown at the top level", async () => {
    const now = new Date();
    await db
      .update(awsAccount)
      .set({
        healthStatus: "healthy",
        healthCheckedAt: now,
        healthDetail: detail(),
      })
      .where(eq(awsAccount.id, ids.awsAccount));
    await insertSecondAccount({
      healthStatus: null,
      healthCheckedAt: null,
      healthDetail: null,
    });

    const app = appFor(ids.org);
    const res = await app.handle(
      new Request("http://localhost/v1/account/health")
    );
    const body = await res.json();
    expect(body.status).toBe("unknown");
  });

  it("rolls in_danger + healthy up to in_danger at the top level", async () => {
    const now = new Date();
    await db
      .update(awsAccount)
      .set({
        healthStatus: "healthy",
        healthCheckedAt: now,
        healthDetail: detail(),
      })
      .where(eq(awsAccount.id, ids.awsAccount));
    await insertSecondAccount({
      healthStatus: "in_danger",
      healthCheckedAt: now,
      healthDetail: detail({
        sendingEnabled: false,
        reasons: ["sending_disabled"],
      }),
    });

    const app = appFor(ids.org);
    const res = await app.handle(
      new Request("http://localhost/v1/account/health")
    );
    const body = await res.json();
    expect(body.status).toBe("in_danger");
  });
});

describe("GET /v1/account/health — response shape", () => {
  it("never leaks roleArn, externalId, or any secret-like key", async () => {
    const now = new Date();
    await db
      .update(awsAccount)
      .set({
        healthStatus: "at_risk",
        healthCheckedAt: now,
        healthDetail: detail({
          bounceRate: 0.06,
          reasons: ["bounce_review"],
        }),
      })
      .where(eq(awsAccount.id, ids.awsAccount));

    const app = appFor(ids.org);
    const res = await app.handle(
      new Request("http://localhost/v1/account/health")
    );
    const body = await res.json();
    expect(findAllSecretLikeKeys(body)).toEqual([]);
  });

  it("flattens thresholds from SES_THRESHOLDS by reference, not literals", async () => {
    const app = appFor(ids.org);
    const res = await app.handle(
      new Request(`http://localhost/v1/account/health/${ids.awsAccount}`)
    );
    const body = await res.json();
    expect(body.thresholds.bounceReview).toBe(SES_THRESHOLDS.bounce.review);
    expect(body.thresholds.bouncePause).toBe(SES_THRESHOLDS.bounce.pause);
    expect(body.thresholds.complaintReview).toBe(
      SES_THRESHOLDS.complaint.review
    );
    expect(body.thresholds.complaintPause).toBe(SES_THRESHOLDS.complaint.pause);
    expect(body.thresholds.quotaWarn).toBe(SES_THRESHOLDS.quotaWarnRatio);
  });

  it("never constructs an AWS SDK client while answering the request", async () => {
    const app = appFor(ids.org);
    const res = await app.handle(
      new Request("http://localhost/v1/account/health")
    );
    expect(res.status).toBe(200);
    expect(mockSesConstructor).not.toHaveBeenCalled();
    expect(mockCloudWatchConstructor).not.toHaveBeenCalled();
    expect(mockStsConstructor).not.toHaveBeenCalled();
  });
});
