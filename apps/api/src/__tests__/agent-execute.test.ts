/**
 * Approval execution — POST /v1/agents/approvals/:id/approve (real DB, AWS mocked)
 *
 * Unit 7: approving a PENDING send assumes the customer role and invokes the
 * enforcer Lambda with `{action:"execute"}`. A `sent` verdict marks the row
 * SENT with the messageId; a `failed` verdict marks it FAILED with the reason.
 *
 * DB is real (never mock @wraps/db). STS + Lambda are mocked at the SDK level.
 */

import { agent, agentApprovalQueue, db, member, user } from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
import { Elysia } from "elysia";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";

// ── AWS boundary mocks ───────────────────────────────────────────────────────

const lambdaInvokeInputs: Array<{
  FunctionName?: string;
  Payload?: Uint8Array;
}> = [];
let lambdaResponse: unknown = null;
let lambdaError: Error | null = null;

vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: class {
    send = vi
      .fn()
      .mockImplementation(
        (cmd: { input: { FunctionName?: string; Payload?: Uint8Array } }) => {
          lambdaInvokeInputs.push(cmd.input);
          if (lambdaError) {
            return Promise.reject(lambdaError);
          }
          return Promise.resolve(lambdaResponse);
        }
      );
  },
  InvokeCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: class {
    send = vi.fn().mockResolvedValue({
      Credentials: {
        AccessKeyId: "AKIATEST",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date(Date.now() + 3_600_000),
      },
    });
  },
  AssumeRoleCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

// Import AFTER mocks so the route's enforcer service picks up mocked clients.
const { agentsRoutes } = await import("../routes/agents");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PREFIX = `agent-exec-${crypto.randomUUID().slice(0, 8)}`;
const ENFORCER_ARN =
  "arn:aws:lambda:us-east-1:100000000001:function:wraps-agent-enforcer";
let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];
let agentRowId: string;

function app() {
  return new Elysia()
    .derive(() => ({
      auth: {
        apiKeyId: null,
        organizationId: ids.org,
        userId: ids.user,
        planId: "pro",
      },
    }))
    .use(agentsRoutes);
}

// A session for a plain member (role="member") of the same org — used to prove
// mutating routes require owner/admin (SEC-7).
const MEMBER_USER_ID = `${PREFIX}-member-user`;
function appAsMember() {
  return new Elysia()
    .derive(() => ({
      auth: {
        apiKeyId: null,
        organizationId: ids.org,
        userId: MEMBER_USER_ID,
        planId: "pro",
      },
    }))
    .use(agentsRoutes);
}

// An API key minted by that same plain member (userId = key.createdBy).
function appAsMemberApiKey() {
  return new Elysia()
    .derive(() => ({
      auth: {
        apiKeyId: `${PREFIX}-key`,
        organizationId: ids.org,
        userId: MEMBER_USER_ID,
        planId: "pro",
      },
    }))
    .use(agentsRoutes);
}

async function seedPendingApproval(payloadOverrides?: Record<string, unknown>) {
  const [row] = await db
    .insert(agentApprovalQueue)
    .values({
      organizationId: ids.org,
      agentId: agentRowId,
      payload: {
        from: `bot@${PREFIX}.example.com`,
        to: "someone@external.com",
        subject: "Hi",
        html: "<p>hi</p>",
        text: "hi",
        ...payloadOverrides,
      },
      reason: "recipient not on allowlist",
      status: "PENDING",
    })
    .returning();
  return row;
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
  const [a] = await db
    .insert(agent)
    .values({
      organizationId: ids.org,
      name: "exec-bot",
      emailAddress: `bot@${PREFIX}.example.com`,
      domain: `${PREFIX}.example.com`,
      policy: {
        maxPerHour: 20,
        maxPerDay: 100,
        allowedRecipients: [],
        allowedRecipientDomains: [],
      },
      awsAccountId: ids.awsAccount,
      enforcerFunctionArn: ENFORCER_ARN,
    })
    .returning();
  agentRowId = a.id;

  // A plain member of the same org (for RBAC assertions).
  const now = new Date();
  await db
    .insert(user)
    .values({
      id: MEMBER_USER_ID,
      email: `${PREFIX}-member@example.com`,
      name: "Plain Member",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      image: null,
    } as typeof user.$inferInsert)
    .onConflictDoNothing();
  await db
    .insert(member)
    .values({
      id: `${PREFIX}-member-row`,
      organizationId: ids.org,
      userId: MEMBER_USER_ID,
      role: "member",
      createdAt: now,
    } as typeof member.$inferInsert)
    .onConflictDoNothing();
});

beforeEach(async () => {
  lambdaInvokeInputs.length = 0;
  lambdaResponse = null;
  lambdaError = null;
  await db
    .delete(agentApprovalQueue)
    .where(inArray(agentApprovalQueue.organizationId, [ids.org, ids.otherOrg]));
});

afterAll(async () => {
  await db
    .delete(agentApprovalQueue)
    .where(inArray(agentApprovalQueue.organizationId, [ids.org, ids.otherOrg]));
  await db
    .delete(agent)
    .where(inArray(agent.organizationId, [ids.org, ids.otherOrg]));
  await db.delete(member).where(eq(member.id, `${PREFIX}-member-row`));
  await db.delete(user).where(eq(user.id, MEMBER_USER_ID));
  await cleanupBaseOrg(PREFIX);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /v1/agents/approvals/:id/approve", () => {
  it("invokes the enforcer with action=execute and marks the row SENT", async () => {
    lambdaResponse = {
      Payload: new TextEncoder().encode(
        JSON.stringify({ status: "sent", messageId: "ses-msg-abc" })
      ),
    };
    const approval = await seedPendingApproval({
      replyTo: "human@example.com",
      inReplyTo: "<abc@mail.example.com>",
      references: "<abc@mail.example.com> <def@mail.example.com>",
    });

    const res = await app().handle(
      new Request(
        `http://localhost/v1/agents/approvals/${approval.id}/approve`,
        { method: "POST" }
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("SENT");
    expect(body.messageId).toBe("ses-msg-abc");

    // Lambda was invoked once with the execute action + this approval id.
    expect(lambdaInvokeInputs).toHaveLength(1);
    expect(lambdaInvokeInputs[0].FunctionName).toBe(ENFORCER_ARN);
    const sent = JSON.parse(
      Buffer.from(lambdaInvokeInputs[0].Payload as Uint8Array).toString()
    );
    expect(sent.action).toBe("execute");
    expect(sent.approvalId).toBe(approval.id);
    expect(sent.agentId).toBe(agentRowId);
    // The reply-to and threading fields round-trip through Neon → approve → Lambda invoke.
    expect(sent.payload.replyTo).toBe("human@example.com");
    expect(sent.payload.inReplyTo).toBe("<abc@mail.example.com>");
    expect(sent.payload.references).toBe(
      "<abc@mail.example.com> <def@mail.example.com>"
    );

    // Row is durably SENT with the messageId.
    const [rowAfter] = await db
      .select()
      .from(agentApprovalQueue)
      .where(eq(agentApprovalQueue.id, approval.id));
    expect(rowAfter.status).toBe("SENT");
    expect(rowAfter.messageId).toBe("ses-msg-abc");
  });

  it("marks the row FAILED with the errorMessage when the enforcer refuses", async () => {
    lambdaResponse = {
      Payload: new TextEncoder().encode(
        JSON.stringify({ status: "failed", reason: "kill switch is on" })
      ),
    };
    const approval = await seedPendingApproval();

    const res = await app().handle(
      new Request(
        `http://localhost/v1/agents/approvals/${approval.id}/approve`,
        { method: "POST" }
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("FAILED");
    expect(body.errorMessage).toBe("kill switch is on");

    const [rowAfter] = await db
      .select()
      .from(agentApprovalQueue)
      .where(eq(agentApprovalQueue.id, approval.id));
    expect(rowAfter.status).toBe("FAILED");
    expect(rowAfter.errorMessage).toBe("kill switch is on");
  });

  it("invokes the enforcer with the UNQUALIFIED function ARN (no alias qualifier)", async () => {
    lambdaResponse = {
      Payload: new TextEncoder().encode(
        JSON.stringify({ status: "sent", messageId: "ses-unqualified" })
      ),
    };
    const approval = await seedPendingApproval();

    await app().handle(
      new Request(
        `http://localhost/v1/agents/approvals/${approval.id}/approve`,
        { method: "POST" }
      )
    );

    expect(lambdaInvokeInputs).toHaveLength(1);
    const fnName = lambdaInvokeInputs[0].FunctionName as string;
    // An alias-qualified invoke (…:function:name:agent-<id>) would be treated as
    // an agent caller and blocked; execute MUST hit the bare function ARN.
    expect(fnName).toBe(ENFORCER_ARN);
    expect(fnName).not.toContain(":agent-");
    expect(fnName).not.toMatch(/:function:[^:]+:.+/);
  });

  it("treats a malformed enforcer response as a failure (SEC-10)", async () => {
    lambdaResponse = {
      Payload: new TextEncoder().encode(
        JSON.stringify({ status: "not-a-real-status", messageId: 42 })
      ),
    };
    const approval = await seedPendingApproval();

    const res = await app().handle(
      new Request(
        `http://localhost/v1/agents/approvals/${approval.id}/approve`,
        { method: "POST" }
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("FAILED");
    expect(body.errorMessage).toContain("malformed");

    const [rowAfter] = await db
      .select()
      .from(agentApprovalQueue)
      .where(eq(agentApprovalQueue.id, approval.id));
    expect(rowAfter.status).toBe("FAILED");
    expect(rowAfter.messageId).toBeNull();
  });

  it("executes exactly once under two concurrent approves (SEC-4/COR-1)", async () => {
    lambdaResponse = {
      Payload: new TextEncoder().encode(
        JSON.stringify({ status: "sent", messageId: "ses-once" })
      ),
    };
    const approval = await seedPendingApproval();

    const [resA, resB] = await Promise.all([
      app().handle(
        new Request(
          `http://localhost/v1/agents/approvals/${approval.id}/approve`,
          { method: "POST" }
        )
      ),
      app().handle(
        new Request(
          `http://localhost/v1/agents/approvals/${approval.id}/approve`,
          { method: "POST" }
        )
      ),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // Exactly one winner (200 SENT); the loser 409s (never a double-send).
    expect(statuses).toEqual([200, 409]);

    // The enforcer Lambda was invoked exactly once — no double-send.
    expect(lambdaInvokeInputs).toHaveLength(1);

    const [rowAfter] = await db
      .select()
      .from(agentApprovalQueue)
      .where(eq(agentApprovalQueue.id, approval.id));
    expect(rowAfter.status).toBe("SENT");
    expect(rowAfter.messageId).toBe("ses-once");
  });

  it("refuses to approve a send for a KILLED agent and never invokes the enforcer (SEC-5)", async () => {
    const approval = await seedPendingApproval();
    await db
      .update(agent)
      .set({ status: "KILLED" })
      .where(eq(agent.id, agentRowId));

    try {
      const res = await app().handle(
        new Request(
          `http://localhost/v1/agents/approvals/${approval.id}/approve`,
          { method: "POST" }
        )
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("killed");
      expect(lambdaInvokeInputs).toHaveLength(0);

      // The row stays PENDING — it was never decided.
      const [rowAfter] = await db
        .select()
        .from(agentApprovalQueue)
        .where(eq(agentApprovalQueue.id, approval.id));
      expect(rowAfter.status).toBe("PENDING");
    } finally {
      await db
        .update(agent)
        .set({ status: "ACTIVE" })
        .where(eq(agent.id, agentRowId));
    }
  });
});

describe("POST /v1/agents/approvals/:id/reject", () => {
  it("rejects a PENDING send and 409s on a re-reject", async () => {
    const approval = await seedPendingApproval();

    const first = await app().handle(
      new Request(
        `http://localhost/v1/agents/approvals/${approval.id}/reject`,
        { method: "POST" }
      )
    );
    expect(first.status).toBe(200);
    expect((await first.json()).status).toBe("REJECTED");

    const second = await app().handle(
      new Request(
        `http://localhost/v1/agents/approvals/${approval.id}/reject`,
        { method: "POST" }
      )
    );
    expect(second.status).toBe(409);
    expect((await second.json()).error).toContain("REJECTED");

    // No send ever happened on a reject.
    expect(lambdaInvokeInputs).toHaveLength(0);
  });
});

describe("RBAC on approval mutations (SEC-7)", () => {
  it("403s a plain-member session on approve; owner succeeds", async () => {
    lambdaResponse = {
      Payload: new TextEncoder().encode(
        JSON.stringify({ status: "sent", messageId: "ses-rbac" })
      ),
    };
    const approval = await seedPendingApproval();

    const denied = await appAsMember().handle(
      new Request(
        `http://localhost/v1/agents/approvals/${approval.id}/approve`,
        { method: "POST" }
      )
    );
    expect(denied.status).toBe(403);
    expect(lambdaInvokeInputs).toHaveLength(0);

    // Owner can still approve the untouched row.
    const allowed = await app().handle(
      new Request(
        `http://localhost/v1/agents/approvals/${approval.id}/approve`,
        { method: "POST" }
      )
    );
    expect(allowed.status).toBe(200);
    expect(lambdaInvokeInputs).toHaveLength(1);
  });

  it("403s an API key minted by a plain member (SEC-7)", async () => {
    const approval = await seedPendingApproval();
    const res = await appAsMemberApiKey().handle(
      new Request(
        `http://localhost/v1/agents/approvals/${approval.id}/reject`,
        { method: "POST" }
      )
    );
    expect(res.status).toBe(403);
  });
});
