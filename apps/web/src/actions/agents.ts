"use server";

import { auth } from "@wraps/auth";
import { notifyOrg } from "@wraps/auth/notify";
import {
  auditLog,
  db,
  findAgentForOrg,
  findApprovalForOrg,
  listAgentsForOrg,
  listApprovalQueueForOrg,
} from "@wraps/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type {
  AgentApprovalStatus,
  AgentWithMeta,
  ApprovalWithMeta,
  ApproveSendResult,
  KillAgentResult,
  KillSyncStatus,
  ListAgentsResult,
  ListApprovalsResult,
  RejectSendResult,
} from "@/lib/agents";
import { auditLogEntry, getAuditContext } from "@/lib/audit";
import { createActionLogger } from "@/lib/logger";
import { checkPermission } from "./shared/permissions";
import { verifyOrgAccess } from "./shared/verify-org-access";

// Re-export types for convenience (types can be re-exported from server files)
export type {
  AgentWithMeta,
  ApprovalWithMeta,
  ApproveSendResult,
  KillAgentResult,
  ListAgentsResult,
  ListApprovalsResult,
  RejectSendResult,
} from "@/lib/agents";

// Agents have no dedicated access-control resource; they are scoped sending
// credentials with a kill switch, so reuse the `apiKeys` resource gradient
// (owner/admin write, everyone reads).
const AGENTS_RESOURCE = "apiKeys" as const;

type AgentRow = Awaited<ReturnType<typeof findAgentForOrg>>;

function serializeAgent(row: NonNullable<AgentRow>): AgentWithMeta {
  return {
    id: row.id,
    name: row.name,
    emailAddress: row.emailAddress,
    domain: row.domain,
    status: row.status,
    policy: row.policy,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

type ApprovalRow = NonNullable<Awaited<ReturnType<typeof findApprovalForOrg>>>;

function serializeApproval(
  row: ApprovalRow,
  agentName: string | null = null
): ApprovalWithMeta {
  return {
    id: row.id,
    agentId: row.agentId,
    agentName,
    payload: row.payload,
    reason: row.reason,
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    messageId: row.messageId,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}

// ── Wraps API bridge ──────────────────────────────────────────────────────────
//
// The customer-side effects (DynamoDB kill-flag sync, enforcer-Lambda execute,
// outcome sync-back) live in apps/api because they assume-role into the
// customer's AWS account. The dashboard reaches them by forwarding the caller's
// better-auth session as a Bearer token — the same mechanism batch/workflow
// actions use. The API re-enforces RBAC (owner/admin) server-side; the web-side
// checkPermission stays for defense-in-depth and faster UX.

type ApiCallResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string };

async function callAgentApi(
  path: string,
  organizationId: string
): Promise<ApiCallResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { ok: false, status: 401, error: "Session not found" };
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return { ok: false, status: 500, error: "API URL not configured" };
  }

  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.session.token}`,
      "X-Organization-Id": organizationId,
    },
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const error =
      (parsed as { error?: string } | null)?.error ||
      text ||
      `Request failed (${response.status})`;
    return { ok: false, status: response.status, error };
  }

  return { ok: true, status: response.status, data: parsed };
}

/**
 * List all agents for an organization.
 */
export async function listAgents(
  organizationId: string
): Promise<ListAgentsResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const permError = checkPermission(access.role, AGENTS_RESOURCE, ["read"]);
    if (permError) return permError;

    const agents = await listAgentsForOrg(organizationId);

    return { success: true, agents: agents.map(serializeAgent) };
  } catch (error) {
    const log = createActionLogger("listAgents", { orgSlug: organizationId });
    log.error({ err: error }, "Failed to list agents");
    return { success: false, error: "Failed to fetch agents" };
  }
}

/**
 * Kill an agent. Delegates the durable state change + enforcer sync to the
 * Wraps API (`POST /v1/agents/:id/kill`, which flips Neon status→KILLED and
 * pushes the kill flag into the customer DynamoDB policy). The web action then
 * writes its own audit row (post-call, single insert — no sibling mutation to
 * be atomic with now that the mutation lives API-side) and notifies the org.
 * The API's `syncStatus`/`warning` are surfaced so the operator learns if the
 * enforcer sync failed (Neon kill applied, but the agent may still send).
 */
export async function killAgent(
  agentId: string,
  organizationId: string
): Promise<KillAgentResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const permError = checkPermission(access.role, AGENTS_RESOURCE, ["write"]);
    if (permError) return permError;

    const existing = await findAgentForOrg(agentId, organizationId);
    if (!existing) {
      return { success: false, error: "Agent not found" };
    }

    const apiResult = await callAgentApi(
      `/v1/agents/${agentId}/kill`,
      organizationId
    );
    if (!apiResult.ok) {
      return { success: false, error: apiResult.error };
    }

    const body = apiResult.data as {
      syncStatus?: KillSyncStatus;
      warning?: string;
    } | null;
    const syncStatus: KillSyncStatus = body?.syncStatus ?? "synced";
    const warning = body?.warning;

    // Audit row (post-call, own insert — documented convention-9 deviation).
    const auditCtx = await getAuditContext();
    await db.insert(auditLog).values(
      auditLogEntry(auditCtx, {
        organizationId,
        actorId: access.userId,
        actorEmail: access.userEmail,
        action: "agent.killed",
        resource: "agent",
        resourceId: agentId,
        metadata: {
          name: existing.name,
          emailAddress: existing.emailAddress,
          syncStatus,
        },
      })
    );

    revalidatePath(`/${access.orgSlug}/automations/agents`, "page");

    const actor = access.userName || access.userEmail;
    const notifyBody =
      syncStatus === "failed"
        ? `${actor} killed this agent. The kill was recorded, but syncing the kill switch to AWS failed — the agent may still send email until the sync is retried.`
        : `${actor} killed this agent. It can no longer send email.`;

    try {
      await notifyOrg({
        organizationId,
        roles: ["owner", "admin"],
        excludeUserIds: [access.userId],
        type: "agent.killed",
        title: `Agent "${existing.name}" killed`,
        body: notifyBody,
        href: `/${access.orgSlug}/automations/agents`,
        data: { agentId },
      });
    } catch (notifyError) {
      const log = createActionLogger("killAgent", { organizationId });
      log.error(
        { err: notifyError },
        "Failed to write agent-killed notification"
      );
    }

    // The Neon kill is durable regardless of sync outcome, so reflect KILLED
    // locally; the operator reads syncStatus/warning to know if enforcement synced.
    return {
      success: true,
      agent: serializeAgent({ ...existing, status: "KILLED" }),
      syncStatus,
      ...(warning ? { warning } : {}),
    };
  } catch (error) {
    const log = createActionLogger("killAgent", { orgSlug: organizationId });
    log.error({ err: error, agentId }, "Failed to kill agent");
    return { success: false, error: "Failed to kill agent" };
  }
}

/**
 * List the approval queue for an organization, optionally filtered by status.
 */
export async function listApprovals(
  organizationId: string,
  status?: AgentApprovalStatus
): Promise<ListApprovalsResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const permError = checkPermission(access.role, AGENTS_RESOURCE, ["read"]);
    if (permError) return permError;

    const rows = await listApprovalQueueForOrg(organizationId, status);

    return {
      success: true,
      approvals: rows.map((row) => serializeApproval(row)),
    };
  } catch (error) {
    const log = createActionLogger("listApprovals", {
      orgSlug: organizationId,
    });
    log.error({ err: error }, "Failed to list approvals");
    return { success: false, error: "Failed to fetch approval queue" };
  }
}

// Merge the fresh, authoritative decision fields from the API response onto the
// Neon row (which carries proper Date types + the immutable payload/reason).
function mergeApprovalDecision(
  existing: ApprovalRow,
  raw: unknown,
  fallbackDecidedBy: string
): ApprovalWithMeta {
  const api = (raw ?? {}) as {
    status?: AgentApprovalStatus;
    messageId?: string | null;
    errorMessage?: string | null;
    decidedBy?: string | null;
    decidedAt?: string | Date | null;
  };
  const base = serializeApproval(existing);
  return {
    ...base,
    status: api.status ?? base.status,
    messageId: api.messageId ?? base.messageId,
    errorMessage: api.errorMessage ?? base.errorMessage,
    decidedBy: api.decidedBy ?? fallbackDecidedBy,
    decidedAt: api.decidedAt ? new Date(api.decidedAt) : new Date(),
  };
}

/**
 * Approve a pending send. Delegates the atomic PENDING→APPROVED transition and
 * the customer enforcer-Lambda execute to the Wraps API
 * (`POST /v1/agents/approvals/:id/approve`). A 200 carries the serialized
 * approval as SENT (delivered) or FAILED (execute failed, `errorMessage` set);
 * a 409 carries the API's concurrency/terminal message verbatim. The web action
 * writes its audit row post-call and notifies the org on a real send.
 */
export async function approveSend(
  approvalId: string,
  organizationId: string
): Promise<ApproveSendResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const permError = checkPermission(access.role, AGENTS_RESOURCE, ["write"]);
    if (permError) return permError;

    const existing = await findApprovalForOrg(approvalId, organizationId);
    if (!existing) {
      return { success: false, error: "Approval not found" };
    }

    const apiResult = await callAgentApi(
      `/v1/agents/approvals/${approvalId}/approve`,
      organizationId
    );
    if (!apiResult.ok) {
      // 409 (already decided / in progress / killed), 403, 404 — surface the
      // API's message so the operator sees the real reason.
      return { success: false, error: apiResult.error };
    }

    const approval = mergeApprovalDecision(
      existing,
      apiResult.data,
      access.userId
    );

    // Audit the operator's approval decision with its outcome (SENT/FAILED).
    const auditCtx = await getAuditContext();
    await db.insert(auditLog).values(
      auditLogEntry(auditCtx, {
        organizationId,
        actorId: access.userId,
        actorEmail: access.userEmail,
        action: "agent.send_approved",
        resource: "agent_approval",
        resourceId: approvalId,
        metadata: {
          agentId: existing.agentId,
          to: existing.payload.to,
          outcome: approval.status,
          ...(approval.errorMessage
            ? { errorMessage: approval.errorMessage }
            : {}),
        },
      })
    );

    revalidatePath(`/${access.orgSlug}/automations/agents/approvals`, "page");

    if (approval.status === "FAILED") {
      // Approved, but the enforcer failed to deliver — surface the reason.
      return {
        success: false,
        error:
          approval.errorMessage ||
          "The send was approved but delivery failed. Check the agent's AWS enforcer.",
      };
    }

    try {
      await notifyOrg({
        organizationId,
        roles: ["owner", "admin"],
        excludeUserIds: [access.userId],
        type: "agent.send_approved",
        title: "Agent send approved",
        body: `${access.userName || access.userEmail} approved a pending agent send to ${existing.payload.to}.`,
        href: `/${access.orgSlug}/automations/agents/approvals`,
        data: { approvalId },
      });
    } catch (notifyError) {
      const log = createActionLogger("approveSend", { organizationId });
      log.error(
        { err: notifyError },
        "Failed to write agent-send-approved notification"
      );
    }

    return { success: true, approval };
  } catch (error) {
    const log = createActionLogger("approveSend", { orgSlug: organizationId });
    log.error({ err: error, approvalId }, "Failed to approve send");
    return { success: false, error: "Failed to approve send" };
  }
}

/**
 * Reject a pending send. Delegates the atomic PENDING→REJECTED transition and
 * the OUTCOME sync-back to the Wraps API
 * (`POST /v1/agents/approvals/:id/reject`). A 409 carries the API's
 * already-decided message. The web action writes its audit row post-call and
 * notifies the org.
 */
export async function rejectSend(
  approvalId: string,
  organizationId: string
): Promise<RejectSendResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const permError = checkPermission(access.role, AGENTS_RESOURCE, ["write"]);
    if (permError) return permError;

    const existing = await findApprovalForOrg(approvalId, organizationId);
    if (!existing) {
      return { success: false, error: "Approval not found" };
    }

    const apiResult = await callAgentApi(
      `/v1/agents/approvals/${approvalId}/reject`,
      organizationId
    );
    if (!apiResult.ok) {
      return { success: false, error: apiResult.error };
    }

    const approval = mergeApprovalDecision(
      existing,
      apiResult.data,
      access.userId
    );

    const auditCtx = await getAuditContext();
    await db.insert(auditLog).values(
      auditLogEntry(auditCtx, {
        organizationId,
        actorId: access.userId,
        actorEmail: access.userEmail,
        action: "agent.send_rejected",
        resource: "agent_approval",
        resourceId: approvalId,
        metadata: { agentId: existing.agentId, to: existing.payload.to },
      })
    );

    revalidatePath(`/${access.orgSlug}/automations/agents/approvals`, "page");

    try {
      await notifyOrg({
        organizationId,
        roles: ["owner", "admin"],
        excludeUserIds: [access.userId],
        type: "agent.send_rejected",
        title: "Agent send rejected",
        body: `${access.userName || access.userEmail} rejected a pending agent send to ${existing.payload.to}.`,
        href: `/${access.orgSlug}/automations/agents/approvals`,
        data: { approvalId },
      });
    } catch (notifyError) {
      const log = createActionLogger("rejectSend", { organizationId });
      log.error(
        { err: notifyError },
        "Failed to write agent-send-rejected notification"
      );
    }

    return { success: true, approval };
  } catch (error) {
    const log = createActionLogger("rejectSend", { orgSlug: organizationId });
    log.error({ err: error, approvalId }, "Failed to reject send");
    return { success: false, error: "Failed to reject send" };
  }
}
