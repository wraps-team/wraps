// Agent types and result shapes - shared between server actions and client components

import type { AgentPolicy } from "@wraps/db";

export type { AgentPolicy } from "@wraps/db";

// Serialized agent as returned to the dashboard
export type AgentWithMeta = {
  id: string;
  name: string;
  emailAddress: string;
  domain: string;
  status: "ACTIVE" | "KILLED";
  policy: AgentPolicy;
  createdAt: Date;
  // The creating user's id (the agent row only carries the FK, not a joined
  // user). Passed through so creator attribution isn't dropped (COR-12).
  createdBy: string | null;
};

export type AgentApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "SENT"
  | "FAILED";

export type AgentSendPayload = {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
};

// Serialized approval-queue row as returned to the dashboard
export type ApprovalWithMeta = {
  id: string;
  agentId: string;
  agentName: string | null;
  payload: AgentSendPayload;
  reason: string | null;
  status: AgentApprovalStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  messageId: string | null;
  errorMessage: string | null;
  createdAt: Date;
};

// Result types
export type ListAgentsResult =
  | { success: true; agents: AgentWithMeta[] }
  | { success: false; error: string };

// Reflects the API kill route: the Neon kill is durable, but syncing the kill
// flag to the customer-side enforcer can fail independently.
export type KillSyncStatus = "synced" | "skipped" | "failed";

export type KillAgentResult =
  | {
      success: true;
      agent: AgentWithMeta;
      syncStatus: KillSyncStatus;
      warning?: string;
    }
  | { success: false; error: string };

export type ListApprovalsResult =
  | { success: true; approvals: ApprovalWithMeta[] }
  | { success: false; error: string };

export type ApproveSendResult =
  | { success: true; approval: ApprovalWithMeta }
  | { success: false; error: string };

export type RejectSendResult =
  | { success: true; approval: ApprovalWithMeta }
  | { success: false; error: string };
