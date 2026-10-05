import { Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock setup (mirrors connection-limit-race.test.ts) ---

const mockTx = {
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

// Helper: create a chainable + thenable mock (mirrors Drizzle query builder)
function chain(value: unknown) {
  const c: Record<string, any> = {};
  const thenable = {
    limit: vi.fn().mockResolvedValue(value),
    // biome-ignore lint/suspicious/noThenProperty: Drizzle queries are thenable by design
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) =>
      Promise.resolve(value).then(res, rej),
  };
  c.from = vi.fn().mockReturnValue(c);
  c.where = vi.fn().mockReturnValue(thenable);
  c.values = vi.fn().mockResolvedValue(undefined);
  c.set = vi.fn().mockReturnValue(c);
  return c;
}

vi.mock("@wraps/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx)
    ),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  awsAccount: {
    id: "id",
    organizationId: "organization_id",
    accountId: "account_id",
    region: "region",
    name: "name",
    roleArn: "role_arn",
    externalId: "external_id",
    webhookSecret: "webhook_secret",
    isVerified: "is_verified",
    lastVerifiedAt: "last_verified_at",
    emailEnabled: "email_enabled",
    smsEnabled: "sms_enabled",
    features: "features",
    createdBy: "created_by",
    updatedAt: "updated_at",
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  sqlExpr: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.join("?"),
      values,
    }),
    { raw: (s: string) => s }
  ),
}));

vi.mock("drizzle-orm", () => ({
  count: vi.fn(() => "count(*)"),
}));

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/activation-tracking", () => ({
  trackAwsConnected: vi.fn(),
}));

// --- Import after mocks ---
const { connectionsRoutes } = await import("../routes/connections");

// --- Test helpers ---
const mockAuth = {
  apiKeyId: "key-test",
  organizationId: "org-test-123",
  userId: "user-test",
  planId: "free",
};

function createTestApp(authOverrides?: Partial<typeof mockAuth>) {
  return new Elysia()
    .derive(() => ({ auth: { ...mockAuth, ...authOverrides } }))
    .use(connectionsRoutes);
}

function postConnection(
  app: ReturnType<typeof createTestApp>,
  body: Record<string, unknown> = {}
) {
  return app.handle(
    new Request("http://localhost/v1/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: "123456789012",
        region: "us-east-1",
        ...body,
      }),
    })
  );
}

// --- Tests ---

describe("Connections role-name derivation (WRAPS_CONSOLE_ROLE_NAME)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.select
      .mockReturnValueOnce(chain([{ count: 0 }])) // count query
      .mockReturnValueOnce(chain([])); // existing lookup
    mockTx.insert.mockReturnValue(chain(undefined));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the platform role when WRAPS_CONSOLE_ROLE_NAME is unset", async () => {
    vi.stubEnv("WRAPS_CONSOLE_ROLE_NAME", undefined);
    const app = createTestApp();

    const response = await postConnection(app);
    const body = await response.json();

    expect(body.roleArn).toBe(
      "arn:aws:iam::123456789012:role/wraps-console-access-role"
    );
  });

  it("uses WRAPS_CONSOLE_ROLE_NAME when set to the self-hosted role name", async () => {
    vi.stubEnv("WRAPS_CONSOLE_ROLE_NAME", "wraps-selfhost-console-access-role");
    const app = createTestApp();

    const response = await postConnection(app);
    const body = await response.json();

    expect(body.roleArn).toBe(
      "arn:aws:iam::123456789012:role/wraps-selfhost-console-access-role"
    );
  });

  it("falls back to the platform role when WRAPS_CONSOLE_ROLE_NAME is empty string (SST unset-var injection)", async () => {
    // This is the specific bug the `||`-vs-`??` choice exists to prevent: SST
    // injects "" for unset env vars, and `??` would leave it malformed as
    // `arn:aws:iam::123456789012:role/` instead of falling back.
    vi.stubEnv("WRAPS_CONSOLE_ROLE_NAME", "");
    const app = createTestApp();

    const response = await postConnection(app);
    const body = await response.json();

    expect(body.roleArn).toBe(
      "arn:aws:iam::123456789012:role/wraps-console-access-role"
    );
  });
});
