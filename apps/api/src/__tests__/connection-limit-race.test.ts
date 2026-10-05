import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock setup ---

// Track all calls through the transaction's tx object
const mockTx = {
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

// Helper: create a chainable + thenable mock (mirrors Drizzle query builder)
// Drizzle queries are thenable — .where() returns an object with both .limit() and .then()
function chain(value: unknown) {
  const c: Record<string, any> = {};
  // Terminal: thenable object returned by .where() — can be awaited or chained with .limit()
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
    // These should NOT be called after the fix (tx should be used instead)
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
const { db } = await import("@wraps/db");
const { trackAwsConnected } = await import("../lib/activation-tracking");

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

describe("Connection plan limit race condition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Unit 1: New connection under limit uses transaction", () => {
    it("wraps count-check-insert in db.transaction()", async () => {
      const app = createTestApp();

      // Configure tx mocks: 0 existing accounts, no existing connection
      mockTx.select
        .mockReturnValueOnce(chain([{ count: 0 }])) // count query
        .mockReturnValueOnce(chain([])); // existing lookup
      mockTx.insert.mockReturnValue(chain(undefined));

      const response = await postConnection(app);
      expect(response.status).toBe(201);

      // The critical assertion: db.transaction was called
      expect(db.transaction).toHaveBeenCalledOnce();

      // Insert went through tx, not db directly
      expect(mockTx.insert).toHaveBeenCalled();

      // A new connection is tracked after the transaction commits
      expect(trackAwsConnected).toHaveBeenCalledWith(
        "org-test-123",
        "user-test",
        { region: "us-east-1", accountId: "123456789012" }
      );
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe("Unit 2: New connection at plan limit returns 403", () => {
    it("rejects new account when free plan limit (1) is reached", async () => {
      const app = createTestApp({ planId: "free" });

      // 1 existing account, no match for this accountId
      mockTx.select
        .mockReturnValueOnce(chain([{ count: 1 }])) // count: already at limit
        .mockReturnValueOnce(chain([])); // no existing match

      const response = await postConnection(app);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("AWS account limit reached");
      expect(body.error).toContain("1");
      // No insert should have happened
      expect(mockTx.insert).not.toHaveBeenCalled();
    });
  });

  describe("Unit 3: Existing account update at limit succeeds", () => {
    it("allows upsert of existing account even when at plan limit", async () => {
      const app = createTestApp({ planId: "free" });

      // At limit (1 account), but this accountId already exists
      mockTx.select
        .mockReturnValueOnce(chain([{ count: 1 }])) // count: at limit
        .mockReturnValueOnce(
          chain([{ id: "existing-conn-id", externalId: "wraps_abc123" }])
        ); // existing match found
      const updateChain = chain(undefined);
      mockTx.update.mockReturnValue(updateChain);

      const response = await postConnection(app);

      expect(response.status).toBe(200); // 200 = update, not 201
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.connectionId).toBe("existing-conn-id");
      expect(body.externalId).toBe("wraps_abc123");
      // Update, not insert
      expect(mockTx.update).toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
      // A reconnect is not a new connection, so activation isn't re-tracked
      expect(trackAwsConnected).not.toHaveBeenCalled();
    });
  });

  describe("Unit 4: Unlimited plan bypasses limit check", () => {
    it("allows new account on scale plan regardless of count", async () => {
      const app = createTestApp({ planId: "scale" });

      // 100 existing accounts, no match — should still succeed
      mockTx.select
        .mockReturnValueOnce(chain([{ count: 100 }])) // count: way over free limit
        .mockReturnValueOnce(chain([])); // no existing match
      mockTx.insert.mockReturnValue(chain(undefined));

      const response = await postConnection(app);

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(mockTx.insert).toHaveBeenCalled();
    });
  });

  describe("Unit 5: FOR UPDATE lock acquired in transaction", () => {
    it("executes SELECT FOR UPDATE on org row before count check", async () => {
      const app = createTestApp();

      mockTx.select
        .mockReturnValueOnce(chain([{ count: 0 }]))
        .mockReturnValueOnce(chain([]));
      mockTx.insert.mockReturnValue(chain(undefined));

      await postConnection(app);

      // tx.execute called with FOR UPDATE lock before any select
      expect(mockTx.execute).toHaveBeenCalledOnce();
      const lockCall = mockTx.execute.mock.calls[0][0];
      expect(lockCall.sql).toContain("FOR UPDATE");
      expect(lockCall.sql).toContain("organization");

      // Lock was called before the first select (count query)
      const executeOrder = mockTx.execute.mock.invocationCallOrder[0];
      const selectOrder = mockTx.select.mock.invocationCallOrder[0];
      expect(executeOrder).toBeLessThan(selectOrder);
    });
  });
});
