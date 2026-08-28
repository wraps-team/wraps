/**
 * Agent Routes
 *
 * Manage leashed agents (addressable senders) and their approval queue.
 *
 * GET    /v1/agents                    - List agents for the org
 * POST   /v1/agents                    - Create an agent
 * GET    /v1/agents/:id                - Get a single agent
 * POST   /v1/agents/:id/kill           - Kill-switch (status → KILLED + sync-back)
 * POST   /v1/agents/:id/policy-sync    - Store deploy outputs (CLI, post-deploy)
 * GET    /v1/agents/approvals          - List the approval queue
 * POST   /v1/agents/approvals/:id/approve - Approve → execute → SENT/FAILED
 * POST   /v1/agents/approvals/:id/reject  - Reject a pending send
 *
 * Every query is scoped to the authenticated organization.
 */

import {
  type AgentApproval,
  type AgentPolicy,
  and,
  awsAccount,
  db,
  decideApproval,
  eq,
  findAgentByAddress,
  findAgentForOrg,
  findApprovalForOrg,
  insertAgent,
  killAgentForOrg,
  listAgentsForOrg,
  listApprovalQueueForOrg,
  markApprovalFailed,
  markApprovalSent,
  member,
  notifyOrg,
  updateAgentForOrg,
} from "@wraps/db";
import { t } from "elysia";

import { log } from "../lib/logger";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import {
  executeApprovedSend,
  syncAgentPolicy,
} from "../services/agent-enforcer";

// ── Schemas ──────────────────────────────────────────────────────────────────

const errorResponse = t.Object({
  error: t.String({ description: "Error message" }),
});

// COR-7 / convention 6: caps are `minimum: 0` (0 ⇒ every send is flagged, never
// "one free send" — the enforcer treats ≤0 as block). Arrays are bounded so a
// runaway policy can't blow past DynamoDB's 400KB item limit and silently drift.
const policySchema = t.Object({
  maxPerHour: t.Number({
    minimum: 0,
    description: "Max sends per rolling hour (0 flags every send)",
  }),
  maxPerDay: t.Number({
    minimum: 0,
    description: "Max sends per rolling day (0 flags every send)",
  }),
  allowedRecipients: t.Array(t.String({ maxLength: 320 }), {
    maxItems: 100,
    description: "Exact recipient addresses always allowed",
  }),
  allowedRecipientDomains: t.Array(t.String({ maxLength: 320 }), {
    maxItems: 100,
    description: "Recipient domains always allowed",
  }),
});

const agentResponseSchema = t.Object({
  id: t.String(),
  organizationId: t.String(),
  name: t.String(),
  emailAddress: t.String(),
  domain: t.String(),
  status: t.String({ description: "ACTIVE or KILLED" }),
  policy: policySchema,
  credentialUserArn: t.Union([t.String(), t.Null()]),
  enforcerFunctionArn: t.Union([t.String(), t.Null()]),
  awsAccountId: t.Union([t.String(), t.Null()]),
  createdBy: t.Union([t.String(), t.Null()]),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
});

const approvalResponseSchema = t.Object({
  id: t.String(),
  organizationId: t.String(),
  agentId: t.String(),
  payload: t.Object({
    from: t.String(),
    to: t.String(),
    subject: t.String(),
    html: t.Optional(t.String()),
    text: t.Optional(t.String()),
    replyTo: t.Optional(t.String()),
    inReplyTo: t.Optional(t.String()),
    references: t.Optional(t.String()),
  }),
  reason: t.Union([t.String(), t.Null()]),
  status: t.String(),
  decidedBy: t.Union([t.String(), t.Null()]),
  decidedAt: t.Union([t.String(), t.Null()]),
  messageId: t.Union([t.String(), t.Null()]),
  errorMessage: t.Union([t.String(), t.Null()]),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
});

const createAgentSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  emailAddress: t.String({ format: "email", maxLength: 255 }),
  domain: t.String({ minLength: 1, maxLength: 255 }),
  policy: t.Optional(policySchema),
});

const policySyncSchema = t.Object({
  credentialUserArn: t.Optional(t.String({ maxLength: 512 })),
  enforcerFunctionArn: t.Optional(t.String({ maxLength: 512 })),
  awsAccountId: t.Optional(t.String({ maxLength: 255 })),
});

const listApprovalsQuerySchema = t.Object({
  status: t.Optional(
    t.Union([
      t.Literal("PENDING"),
      t.Literal("APPROVED"),
      t.Literal("REJECTED"),
      t.Literal("SENT"),
      t.Literal("FAILED"),
    ])
  ),
});

const DEFAULT_POLICY: AgentPolicy = {
  maxPerHour: 20,
  maxPerDay: 100,
  allowedRecipients: [],
  allowedRecipientDomains: [],
};

// ── Serializers ────────────────────────────────────────────────────────────────

type AgentRow = Awaited<ReturnType<typeof findAgentForOrg>>;

function serializeAgent(row: NonNullable<AgentRow>) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    emailAddress: row.emailAddress,
    domain: row.domain,
    status: row.status,
    policy: row.policy,
    credentialUserArn: row.credentialUserArn,
    enforcerFunctionArn: row.enforcerFunctionArn,
    awsAccountId: row.awsAccountId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeApproval(row: AgentApproval) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    agentId: row.agentId,
    payload: row.payload,
    reason: row.reason,
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    messageId: row.messageId,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── RBAC ───────────────────────────────────────────────────────────────────

const FORBIDDEN_MESSAGE = "This action requires an organization owner or admin";

/**
 * Gate a mutating agent route to org owners/admins (SEC-7, convention 10).
 *
 * `AuthContext` carries no role, so we resolve it from the `member` row for
 * (userId, organizationId). API keys authenticate as their creator
 * (`userId = key.createdBy`), so the creator's role is what's enforced — a key
 * minted by a plain member cannot create/kill/approve. On failure this sets a
 * 403 on `ctx.set` and returns `{ ok: false }`; the caller returns the body.
 */
async function requireOwnerOrAdmin(
  ctx: unknown
): Promise<{ ok: true; userId: string } | { ok: false }> {
  const auth = getAuth(ctx);
  if (!auth.userId) {
    (ctx as { set: { status: number } }).set.status = 403;
    return { ok: false };
  }

  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, auth.userId),
        eq(member.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (!row || (row.role !== "owner" && row.role !== "admin")) {
    (ctx as { set: { status: number } }).set.status = 403;
    return { ok: false };
  }

  return { ok: true, userId: auth.userId };
}

// ── ARN validation (SEC-6) ───────────────────────────────────────────────────

// Unqualified Lambda function ARN only (anchored — an alias-qualified ARN has a
// trailing `:qualifier` and must be rejected: the API executes against the
// UNQUALIFIED function, an alias-qualified invoke is treated as an agent caller
// and blocked by the enforcer).
const LAMBDA_FN_ARN =
  /^arn:aws:lambda:[a-z0-9-]+:(\d{12}):function:[A-Za-z0-9-_]+$/;
const IAM_USER_ARN = /^arn:aws:iam::(\d{12}):user\/[\w+=,.@/-]+$/;
const AWS_ACCOUNT_ID = /^\d{12}$/;

/**
 * Validate the deploy outputs stored by `policy-sync` (SEC-6): each ARN must
 * match its expected shape and every account segment (the ARNs' and the synced
 * `awsAccountId`) must agree. A mismatched/re-pointed ARN is rejected 400 rather
 * than stored as an infra-level field any org member could weaponize.
 */
function validatePolicySyncOutputs(body: {
  credentialUserArn?: string;
  enforcerFunctionArn?: string;
  awsAccountId?: string;
}): { error: string } | null {
  const accounts = new Set<string>();

  if (body.awsAccountId !== undefined) {
    if (!AWS_ACCOUNT_ID.test(body.awsAccountId)) {
      return { error: "awsAccountId must be a 12-digit AWS account id" };
    }
    accounts.add(body.awsAccountId);
  }

  if (body.enforcerFunctionArn !== undefined) {
    const match = LAMBDA_FN_ARN.exec(body.enforcerFunctionArn);
    if (!match) {
      return {
        error: "enforcerFunctionArn must be an unqualified Lambda function ARN",
      };
    }
    accounts.add(match[1]);
  }

  if (body.credentialUserArn !== undefined) {
    const match = IAM_USER_ARN.exec(body.credentialUserArn);
    if (!match) {
      return { error: "credentialUserArn must be a valid IAM user ARN" };
    }
    accounts.add(match[1]);
  }

  if (accounts.size > 1) {
    return {
      error: "ARN account ids must match the synced AWS account",
    };
  }

  return null;
}

/**
 * A stranded APPROVED row (crash between APPROVED and SENT) heals when a later
 * approve re-invokes execute (enforcer idempotency makes it safe). But a
 * concurrent approve loser also observes APPROVED — re-invoking there would
 * double-invoke. We distinguish the two by age: a row decided within this window
 * is assumed to have a live executor (loser 409s, no second invoke); an older
 * one is stranded and is retried. Any real execute finishes in seconds, so this
 * window is comfortably larger without stalling genuine heals.
 */
const STRANDED_RETRY_AFTER_MS = 15_000;

type ApprovalResolution =
  | { kind: "row"; row: AgentApproval }
  | { kind: "error"; status: number; message: string };

/**
 * Resolve which APPROVED row (if any) this approve request should execute.
 * Wins the atomic PENDING→APPROVED transition, or — on a lost transition —
 * re-reads to distinguish a terminal row (409), a live concurrent execute (409,
 * no double-invoke), and a stranded APPROVED row worth healing (COR-4).
 */
async function resolveApprovalForExecute(
  approval: AgentApproval,
  organizationId: string,
  userId: string
): Promise<ApprovalResolution> {
  const decided = await decideApproval(
    approval.id,
    organizationId,
    "APPROVED",
    userId
  );
  if (decided) {
    return { kind: "row", row: decided };
  }

  const current = await findApprovalForOrg(approval.id, organizationId);
  if (!current) {
    return { kind: "error", status: 404, message: "Approval not found" };
  }
  if (current.status !== "APPROVED") {
    // SENT / REJECTED / FAILED — terminal, or PENDING under contention.
    return {
      kind: "error",
      status: 409,
      message: `Approval already ${current.status}`,
    };
  }
  const decidedAtMs = current.decidedAt ? current.decidedAt.getTime() : 0;
  if (Date.now() - decidedAtMs < STRANDED_RETRY_AFTER_MS) {
    return {
      kind: "error",
      status: 409,
      message: "Approval already in progress",
    };
  }
  return { kind: "row", row: current };
}

/**
 * Execute an APPROVED send and record the terminal outcome. `markApprovalSent/
 * Failed` require the row to still be APPROVED, so a concurrent winner that
 * finalized first yields null → we return the durable row instead.
 */
async function finalizeApprovedSend(
  approvedRow: AgentApproval,
  agentRow: NonNullable<AgentRow>,
  organizationId: string
): Promise<AgentApproval> {
  const verdict = await executeApprovedSend(approvedRow, agentRow);

  if (verdict.status === "sent" && verdict.messageId) {
    const sent = await markApprovalSent(
      approvedRow.id,
      organizationId,
      verdict.messageId
    );
    if (sent) {
      return sent;
    }
  } else {
    const errorMessage = verdict.reason ?? `Send ${verdict.status}`;
    const failed = await markApprovalFailed(
      approvedRow.id,
      organizationId,
      errorMessage
    );
    if (failed) {
      return failed;
    }
  }

  const latest = await findApprovalForOrg(approvedRow.id, organizationId);
  return latest ?? approvedRow;
}

// ── Routes ──────────────────────────────────────────────────────────────────

export const agentsRoutes = createAuthenticatedRoutes("/v1/agents")
  // List agents
  .get(
    "/",
    async (ctx) => {
      const auth = getAuth(ctx);
      const agents = await listAgentsForOrg(auth.organizationId);
      return { agents: agents.map(serializeAgent) };
    },
    {
      response: {
        200: t.Object({ agents: t.Array(agentResponseSchema) }),
      },
      detail: { tags: ["agents"], summary: "List agents" },
    }
  )
  // Create agent
  .post(
    "/",
    async (ctx) => {
      const auth = getAuth(ctx);
      const gate = await requireOwnerOrAdmin(ctx);
      if (!gate.ok) {
        return { error: FORBIDDEN_MESSAGE };
      }
      const { body } = ctx;

      const created = await insertAgent({
        organizationId: auth.organizationId,
        name: body.name,
        emailAddress: body.emailAddress,
        domain: body.domain,
        policy: body.policy ?? DEFAULT_POLICY,
        createdBy: gate.userId,
      });

      // Bare onConflictDoNothing → null on ANY unique violation (org+name or
      // org+email). Disambiguate for a useful message (COR-5 / convention 12).
      if (!created) {
        ctx.set.status = 409;
        const emailTaken = await findAgentByAddress(
          auth.organizationId,
          body.emailAddress
        );
        return {
          error: emailTaken
            ? "An agent with this email address already exists"
            : "An agent with this name already exists",
        };
      }

      ctx.set.status = 201;
      return serializeAgent(created);
    },
    {
      body: createAgentSchema,
      response: {
        201: agentResponseSchema,
        403: errorResponse,
        409: errorResponse,
      },
      detail: { tags: ["agents"], summary: "Create an agent" },
    }
  )
  // Get single agent
  .get(
    "/:id",
    async (ctx) => {
      const auth = getAuth(ctx);
      const found = await findAgentForOrg(ctx.params.id, auth.organizationId);
      if (!found) {
        ctx.set.status = 404;
        return { error: "Agent not found" };
      }
      return serializeAgent(found);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 255 }) }),
      response: { 200: agentResponseSchema, 404: errorResponse },
      detail: { tags: ["agents"], summary: "Get an agent" },
    }
  )
  // Kill-switch
  .post(
    "/:id/kill",
    async (ctx) => {
      const auth = getAuth(ctx);
      const gate = await requireOwnerOrAdmin(ctx);
      if (!gate.ok) {
        return { error: FORBIDDEN_MESSAGE };
      }

      const killed = await killAgentForOrg(ctx.params.id, auth.organizationId);
      if (!killed) {
        ctx.set.status = 404;
        return { error: "Agent not found" };
      }

      // Sync-back so the enforcer refuses future sends immediately. The Neon
      // kill is already applied and stays applied; but a silent 200 when the
      // sync-back fails leaves the enforcer reading `killed:false` (SEC-5), so
      // we SURFACE the outcome to the operator instead of swallowing it.
      // A deployed agent has an AWS account; a not-yet-deployed one does not.
      let syncStatus: "synced" | "skipped" | "failed" = "skipped";
      let warning: string | undefined;
      if (killed.awsAccountId) {
        try {
          await syncAgentPolicy(killed);
          syncStatus = "synced";
        } catch (error) {
          syncStatus = "failed";
          warning =
            "Kill applied in Wraps, but syncing it to the enforcer failed — the agent may keep sending until the sync succeeds. Retry the kill.";
          log.error("Kill sync-back failed", error, { agentId: killed.id });
        }
      }

      try {
        await notifyOrg({
          organizationId: auth.organizationId,
          type: "agent.killed",
          title: `Agent ${killed.name} killed`,
          body:
            syncStatus === "failed"
              ? "Kill applied, but enforcer sync failed — retry the kill."
              : "This agent can no longer send email.",
          href: "/emails/agents",
          data: { agentId: killed.id, syncStatus },
        });
      } catch (error) {
        log.error("Kill notify failed", error, { agentId: killed.id });
      }

      return { agent: serializeAgent(killed), syncStatus, warning };
    },
    {
      params: t.Object({ id: t.String({ maxLength: 255 }) }),
      response: {
        200: t.Object({
          agent: agentResponseSchema,
          syncStatus: t.Union([
            t.Literal("synced"),
            t.Literal("skipped"),
            t.Literal("failed"),
          ]),
          warning: t.Optional(t.String()),
        }),
        403: errorResponse,
        404: errorResponse,
      },
      detail: { tags: ["agents"], summary: "Kill an agent" },
    }
  )
  // Store deploy outputs (CLI calls this after `wraps email agent create`)
  .post(
    "/:id/policy-sync",
    async (ctx) => {
      const auth = getAuth(ctx);
      const gate = await requireOwnerOrAdmin(ctx);
      if (!gate.ok) {
        return { error: FORBIDDEN_MESSAGE };
      }
      const { body } = ctx;

      // SEC-6: validate ARN shape + account agreement before storing an
      // infra-level field. A re-pointed ARN is rejected, not persisted.
      const invalid = validatePolicySyncOutputs(body);
      if (invalid) {
        ctx.set.status = 400;
        return invalid;
      }

      // The CLI sends the 12-digit AWS account number, but getCredentials()
      // (and every downstream assume-role) looks up awsAccount by its internal
      // id. Resolve the org's connected account row and store its id — a
      // number with no connected account is a 400, not a silent runtime break.
      let internalAwsAccountId: string | undefined;
      if (body.awsAccountId !== undefined) {
        const [account] = await db
          .select({ id: awsAccount.id })
          .from(awsAccount)
          .where(
            and(
              eq(awsAccount.accountId, body.awsAccountId),
              eq(awsAccount.organizationId, auth.organizationId)
            )
          )
          .limit(1);
        if (!account) {
          ctx.set.status = 400;
          return {
            error: `AWS account ${body.awsAccountId} is not connected to this organization`,
          };
        }
        internalAwsAccountId = account.id;
      }

      const updated = await updateAgentForOrg(
        ctx.params.id,
        auth.organizationId,
        {
          credentialUserArn: body.credentialUserArn,
          enforcerFunctionArn: body.enforcerFunctionArn,
          awsAccountId: internalAwsAccountId,
        }
      );
      if (!updated) {
        ctx.set.status = 404;
        return { error: "Agent not found" };
      }

      // Now that the agent knows its account, push the initial CONFIG item.
      if (updated.awsAccountId) {
        try {
          await syncAgentPolicy(updated);
        } catch (error) {
          log.error("Initial policy sync failed", error, {
            agentId: updated.id,
          });
        }
      }

      return serializeAgent(updated);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 255 }) }),
      body: policySyncSchema,
      response: {
        200: agentResponseSchema,
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
      detail: { tags: ["agents"], summary: "Sync agent deploy outputs" },
    }
  )
  // List approval queue
  .get(
    "/approvals",
    async (ctx) => {
      const auth = getAuth(ctx);
      const approvals = await listApprovalQueueForOrg(
        auth.organizationId,
        ctx.query.status
      );
      return { approvals: approvals.map(serializeApproval) };
    },
    {
      query: listApprovalsQuerySchema,
      response: {
        200: t.Object({ approvals: t.Array(approvalResponseSchema) }),
      },
      detail: { tags: ["agents"], summary: "List the approval queue" },
    }
  )
  // Approve a pending send → execute → SENT/FAILED
  .post(
    "/approvals/:id/approve",
    async (ctx) => {
      const auth = getAuth(ctx);
      const gate = await requireOwnerOrAdmin(ctx);
      if (!gate.ok) {
        return { error: FORBIDDEN_MESSAGE };
      }

      const approval = await findApprovalForOrg(
        ctx.params.id,
        auth.organizationId
      );
      if (!approval) {
        ctx.set.status = 404;
        return { error: "Approval not found" };
      }

      const agentRow = await findAgentForOrg(
        approval.agentId,
        auth.organizationId
      );
      if (!agentRow) {
        ctx.set.status = 404;
        return { error: "Agent not found" };
      }

      // SEC-5: never send for a killed agent. Runs before the transition/retry
      // branch so it guards the fresh-approve AND the stranded-retry path.
      if (agentRow.status === "KILLED") {
        ctx.set.status = 409;
        return { error: "Agent is killed — cannot approve its sends" };
      }

      // Atomic PENDING → APPROVED (SEC-4/COR-1), with the stranded-retry heal
      // (COR-4) folded in. Loser of a live race gets a 409, never a re-invoke.
      const resolution = await resolveApprovalForExecute(
        approval,
        auth.organizationId,
        gate.userId
      );
      if (resolution.kind === "error") {
        ctx.set.status = resolution.status;
        return { error: resolution.message };
      }

      // Execute (idempotent in the enforcer — safe to replay on the retry path).
      const finalRow = await finalizeApprovedSend(
        resolution.row,
        agentRow,
        auth.organizationId
      );
      return serializeApproval(finalRow);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 255 }) }),
      response: {
        200: approvalResponseSchema,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
      detail: { tags: ["agents"], summary: "Approve a pending send" },
    }
  )
  // Reject a pending send
  .post(
    "/approvals/:id/reject",
    async (ctx) => {
      const auth = getAuth(ctx);
      const gate = await requireOwnerOrAdmin(ctx);
      if (!gate.ok) {
        return { error: FORBIDDEN_MESSAGE };
      }

      const approval = await findApprovalForOrg(
        ctx.params.id,
        auth.organizationId
      );
      if (!approval) {
        ctx.set.status = 404;
        return { error: "Approval not found" };
      }

      // Atomic PENDING → REJECTED (SEC-4/COR-1). null → someone already decided
      // it (re-reject, or a concurrent approve/reject won) → 409.
      const rejected = await decideApproval(
        approval.id,
        auth.organizationId,
        "REJECTED",
        gate.userId
      );
      if (!rejected) {
        const current = await findApprovalForOrg(
          approval.id,
          auth.organizationId
        );
        ctx.set.status = 409;
        return { error: `Approval already ${current?.status ?? "decided"}` };
      }
      return serializeApproval(rejected);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 255 }) }),
      response: {
        200: approvalResponseSchema,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
      detail: { tags: ["agents"], summary: "Reject a pending send" },
    }
  );
