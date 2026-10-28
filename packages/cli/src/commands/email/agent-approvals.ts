import * as clack from "@clack/prompts";
import pc from "picocolors";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../utils/shared/api-target.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../utils/shared/json-output.js";

type AgentApprovalsListOptions = {
  status?: string;
  json?: boolean;
  token?: string;
  region?: string;
};

type AgentApprovalsDecisionOptions = {
  id?: string;
  yes?: boolean;
  json?: boolean;
  token?: string;
  region?: string;
};

type Failure = { code: string; message: string; suggestion: string };

const TRAILING_PERIOD = /\.$/;

type ApprovalRecord = {
  id: string;
  organizationId: string | null;
  agentId: string | null;
  status: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  decidedBy: string | null;
  decidedAt: string | null;
  messageId: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const LIST_COMMAND = "email.agent.approvals.list";
const APPROVE_COMMAND = "email.agent.approvals.approve";
const REJECT_COMMAND = "email.agent.approvals.reject";

const APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SENT",
  "FAILED",
] as const;

// Pagination: GET /v1/agents/approvals takes only `status` and returns the whole
// org queue in one response (routes/agents.ts, listApprovalsQuerySchema). It has
// no limit or cursor, so this command has no --limit/--cursor flags; accepting
// them would be silently ignored. `nextCursor` is still emitted as null so the
// list envelope matches the other list commands (graph A1).

/** Print a failure (JSON envelope or human line) and mark the process as failed. */
function fail(command: string, failure: Failure): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(command, failure);
    return;
  }
  clack.log.error(
    `${failure.message.replace(TRAILING_PERIOD, "")}. ${failure.suggestion}`
  );
}

function invalidResponse(): Failure {
  return {
    code: "INVALID_RESPONSE",
    message: "The Wraps API returned a response this CLI does not understand",
    suggestion: "Retry. If it keeps failing, run: wraps support",
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Project a raw approval onto the fixed field set this command publishes, so
 * the JSON keys never change with whatever the server sends.
 */
function toApproval(raw: Record<string, unknown>, fallbackId: string) {
  const str = (value: unknown): string | null =>
    typeof value === "string" ? value : null;
  return {
    id: str(raw.id) ?? fallbackId,
    organizationId: str(raw.organizationId),
    agentId: str(raw.agentId),
    status: str(raw.status),
    reason: str(raw.reason),
    payload: isPlainObject(raw.payload) ? raw.payload : null,
    decidedBy: str(raw.decidedBy),
    decidedAt: str(raw.decidedAt),
    messageId: str(raw.messageId),
    errorMessage: str(raw.errorMessage),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
  } satisfies ApprovalRecord;
}

/** The server's text for an error body: `message` first, then `error`. */
function errorDetail(
  body: { message?: unknown; error?: unknown },
  status: number
): string {
  if (typeof body.message === "string") {
    return body.message;
  }
  if (typeof body.error === "string") {
    return body.error;
  }
  return `HTTP ${status}`;
}

/** Map a non-2xx API response to a stable error code. `message` is read before `error`. */
async function apiFailure(resp: Response): Promise<Failure> {
  const body = (await resp.json().catch(() => ({}))) as {
    message?: unknown;
    error?: unknown;
  };
  const detail = errorDetail(body, resp.status);

  if (resp.status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message: `The Wraps API rejected the credentials (${detail})`,
      suggestion:
        "Sign in again with: wraps auth login, or pass a valid key with --token or WRAPS_API_KEY",
    };
  }
  if (resp.status === 403) {
    return {
      code: "FORBIDDEN_ROLE",
      message: detail,
      suggestion:
        "Approve and reject need an API key created by an organization owner or admin. Use a key from an owner or admin, or decide the approval in the dashboard",
    };
  }
  if (resp.status === 404) {
    return {
      code: "NOT_FOUND",
      message: detail,
      suggestion: "Find the right id with: wraps email agent approvals list",
    };
  }
  if (resp.status === 409) {
    return {
      code: "CONFLICT",
      message: detail,
      suggestion:
        "The approval is not in a state that allows this. Check its current status with: wraps email agent approvals list",
    };
  }
  if (resp.status === 400 || resp.status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message: detail,
      suggestion: "Check the flag values and retry",
    };
  }
  if (resp.status === 429) {
    return {
      code: "RATE_LIMITED",
      message: detail,
      suggestion: "Wait a minute, then retry",
    };
  }
  if (resp.status >= 500) {
    return {
      code: "SERVER_ERROR",
      message: detail,
      suggestion:
        "The Wraps API failed. Retry shortly; if it keeps failing, run: wraps support",
    };
  }
  return {
    code: "API_ERROR",
    message: detail,
    suggestion: "Retry, and if it keeps failing, run: wraps support",
  };
}

async function resolveTarget(
  command: string,
  token: string | undefined
): Promise<{ apiBase: string; token: string } | null> {
  const check = checkApiTarget(await resolveApiTarget({ token }));
  if (!check.ok) {
    fail(command, {
      code: "NOT_AUTHENTICATED",
      message: check.reason,
      suggestion: check.suggestion,
    });
    return null;
  }
  return check.target;
}

async function send(
  command: string,
  url: string,
  token: string,
  method: "GET" | "POST"
): Promise<Response | null> {
  try {
    return await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    fail(command, {
      code: "NETWORK_ERROR",
      message: `Could not reach the Wraps API (${error instanceof Error ? error.message : String(error)})`,
      suggestion: "Check your network connection and WRAPS_API_URL, then retry",
    });
    return null;
  }
}

/** `wraps email agent approvals list [--status <s>]` */
export async function agentApprovalsList(
  options: AgentApprovalsListOptions
): Promise<void> {
  let status: string | undefined;
  if (options.status !== undefined) {
    const normalized = options.status.toUpperCase();
    if (!(APPROVAL_STATUSES as readonly string[]).includes(normalized)) {
      fail(LIST_COMMAND, {
        code: "VALIDATION",
        message: `--status must be one of ${APPROVAL_STATUSES.join(", ")}`,
        suggestion: `Re-run with one of: ${APPROVAL_STATUSES.map((s) => s.toLowerCase()).join(", ")}`,
      });
      return;
    }
    status = normalized;
  }

  const target = await resolveTarget(LIST_COMMAND, options.token);
  if (!target) {
    return;
  }

  const query = status ? `?${new URLSearchParams({ status })}` : "";
  const resp = await send(
    LIST_COMMAND,
    `${target.apiBase}/v1/agents/approvals${query}`,
    target.token,
    "GET"
  );
  if (!resp) {
    return;
  }
  if (!resp.ok) {
    fail(LIST_COMMAND, await apiFailure(resp));
    return;
  }

  const body: unknown = await resp.json().catch(() => null);
  const rawApprovals = isPlainObject(body) ? body.approvals : undefined;
  if (!Array.isArray(rawApprovals)) {
    fail(LIST_COMMAND, invalidResponse());
    return;
  }
  const approvals = rawApprovals
    .filter(isPlainObject)
    .map((raw) => toApproval(raw, ""));

  if (isJsonMode()) {
    jsonSuccess(LIST_COMMAND, { approvals, nextCursor: null });
    return;
  }

  if (approvals.length === 0) {
    clack.log.info(
      status
        ? `No ${status.toLowerCase()} approvals.`
        : "The approval queue is empty."
    );
    return;
  }

  const rows = approvals.map((a) => {
    const to = String(a.payload?.to ?? "—");
    const subject = String(a.payload?.subject ?? "—");
    return `${pc.cyan(a.id)}  ${(a.status ?? "—").padEnd(9)}  ${to}  ${pc.dim(subject)}`;
  });
  clack.note(rows.join("\n"), `Approvals — ${approvals.length}`);
}

/**
 * The outcome of a 200 from approve or reject. Approve returns 200 even when
 * the send itself failed, so the status field decides: SENT (or REJECTED for
 * reject) is success, FAILED is SEND_FAILED, anything else is unexpected.
 */
function decisionOutcomeFailure(
  action: "approve" | "reject",
  id: string,
  approval: ApprovalRecord
): Failure | null {
  if (approval.status === "FAILED") {
    return {
      code: "SEND_FAILED",
      message: `Approval ${id} was approved, but the send failed${approval.errorMessage ? `: ${approval.errorMessage}` : ""}`,
      suggestion:
        "Check the queue with: wraps email agent approvals list --status FAILED, and the delivery with: wraps email logs list. Do not assume the email went out",
    };
  }
  const expected = action === "approve" ? "SENT" : "REJECTED";
  if (approval.status !== expected) {
    return {
      code: "UNEXPECTED_STATUS",
      message: `Approval ${id} came back with status ${approval.status ?? "unknown"}, expected ${expected}`,
      suggestion:
        "Check the current state with: wraps email agent approvals list",
    };
  }
  return null;
}

/**
 * Shared body for approve and reject. Both need --id and --yes, and both make
 * zero requests until the two checks pass.
 */
async function decideApproval(
  command: string,
  action: "approve" | "reject",
  options: AgentApprovalsDecisionOptions
): Promise<void> {
  const id = options.id;
  if (!id) {
    fail(command, {
      code: "MISSING_REQUIRED_FLAG",
      message: "--id is required",
      suggestion: `Find the approval id with: wraps email agent approvals list, then: wraps email agent approvals ${action} --id <id> --yes`,
    });
    return;
  }
  if (!options.yes) {
    fail(command, {
      code: "CONFIRMATION_REQUIRED",
      message:
        action === "approve"
          ? `Approving ${id} sends the held email now`
          : `Rejecting ${id} is final and the send will not go out`,
      suggestion: `Re-run with --yes to confirm: wraps email agent approvals ${action} --id ${id} --yes`,
    });
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }

  const resp = await send(
    command,
    `${target.apiBase}/v1/agents/approvals/${encodeURIComponent(id)}/${action}`,
    target.token,
    "POST"
  );
  if (!resp) {
    return;
  }
  if (!resp.ok) {
    fail(command, await apiFailure(resp));
    return;
  }

  const raw: unknown = await resp.json().catch(() => null);
  if (!isPlainObject(raw)) {
    fail(command, invalidResponse());
    return;
  }
  const approval = toApproval(raw, id);

  const outcome = decisionOutcomeFailure(action, id, approval);
  if (outcome) {
    fail(command, outcome);
    return;
  }

  if (isJsonMode()) {
    jsonSuccess(command, approval as unknown as Record<string, unknown>);
    return;
  }

  if (action === "approve") {
    clack.log.success(
      `Sent approval ${pc.cyan(id)}${approval.messageId ? ` (message ${approval.messageId})` : ""}.`
    );
  } else {
    clack.log.success(`Rejected approval ${pc.cyan(id)}.`);
  }
}

/** `wraps email agent approvals approve --id <id> --yes` (executes the send) */
export async function agentApprovalsApprove(
  options: AgentApprovalsDecisionOptions
): Promise<void> {
  await decideApproval(APPROVE_COMMAND, "approve", options);
}

/** `wraps email agent approvals reject --id <id> --yes` */
export async function agentApprovalsReject(
  options: AgentApprovalsDecisionOptions
): Promise<void> {
  await decideApproval(REJECT_COMMAND, "reject", options);
}
