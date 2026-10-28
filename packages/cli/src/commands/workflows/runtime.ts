/**
 * Workflow runtime control: `wraps workflows trigger|enable|disable|retry|cancel`.
 *
 * Calls routes that already exist in the API:
 *   trigger  POST /v1/workflows/:workflowId/trigger             (enqueues real sends: --yes)
 *   retry    POST /v1/workflows/executions/:executionId/retry   (re-runs a failed run: --yes)
 *   cancel   POST /v1/workflows/executions/:executionId/cancel  (stops a run: --yes)
 *   enable   POST /v1/workflow-schedules/:workflowId/enable     (needs --cron; sends later: --yes)
 *   disable  POST /v1/workflow-schedules/:workflowId/disable
 *
 * Decision on enable/disable: the API's only enable/disable routes are the
 * workflow-schedules routes. They create or delete the one-time EventBridge
 * schedule that runs a schedule-triggered workflow. No API route changes the
 * workflow's `enabled` status, so these commands do not flip that status.
 * `enable` therefore requires a cron expression.
 *
 * Failure signalling: the workflow routes answer HTTP 200 with
 * `{ success: false, error }` for most failures. A response counts as a
 * failure when the HTTP status is not 2xx OR `body.success === false`.
 *
 * Envelope command names are dotted (`workflows.trigger`). Every error path
 * prints one error envelope (or a clack error in human mode), sets
 * process.exitCode = 1, and returns. Nothing in this file raises exceptions
 * to the dispatcher.
 */

import { log, note } from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../utils/shared/api-target.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../utils/shared/json-output.js";

type CommonOptions = {
  token?: string;
  json?: boolean;
  region?: string;
};

export type WorkflowsTriggerOptions = CommonOptions & {
  workflowId?: string;
  contactId?: string;
  contactEmail?: string;
  data?: string;
  dryRun?: boolean;
  yes?: boolean;
};

export type WorkflowsEnableOptions = CommonOptions & {
  workflowId?: string;
  cron?: string;
  timezone?: string;
  yes?: boolean;
};

export type WorkflowsDisableOptions = CommonOptions & {
  workflowId?: string;
};

export type WorkflowsRetryOptions = CommonOptions & {
  executionId?: string;
  yes?: boolean;
};

export type WorkflowsCancelOptions = CommonOptions & {
  executionId?: string;
  yes?: boolean;
};

type Failure = { code: string; message: string; suggestion: string };

type ApiBody = {
  success?: unknown;
  message?: unknown;
  error?: unknown;
  [key: string]: unknown;
};

type PostResult = { ok: true; body: ApiBody } | { ok: false; failure: Failure };

type Target =
  | { ok: true; apiBase: string; token: string }
  | { ok: false; failure: Failure };

const HINT_TRIGGER =
  "Check that the workflow ID exists in this organization, that the workflow is enabled with trigger type api, and that the contact exists here. Nothing was re-sent; run wraps workflows trigger --dry-run to check the input.";
const HINT_RETRY =
  "Only failed executions with a retryable error step can be retried. Check the execution ID and its current status.";
const HINT_CANCEL =
  "Only pending, active, paused or waiting executions can be cancelled. Check the execution ID and its current status.";
const HINT_ENABLE =
  "Check the workflow ID belongs to this organization and that --cron is a valid EventBridge expression, for example cron(0 9 * * ? *).";
const HINT_DISABLE = "Check the workflow ID belongs to this organization.";

/** Print one failure: a JSON error envelope, or a clack error in human mode. Always sets exitCode. */
function reportFailure(command: string, failure: Failure): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(command, {
      code: failure.code,
      message: failure.message,
      suggestion: failure.suggestion,
    });
    return;
  }
  log.error(failure.message);
  log.info(failure.suggestion);
}

/** Print success: a JSON envelope in JSON mode, otherwise the human view. */
function reportSuccess(
  command: string,
  data: Record<string, unknown>,
  human: () => void
): void {
  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }
  human();
}

function missingFailure(what: string, usage: string): Failure {
  return {
    code: "MISSING_REQUIRED_FLAG",
    message: `Missing ${what}.`,
    suggestion: `Usage: ${usage}`,
  };
}

function reportMissing(command: string, what: string, usage: string): void {
  reportFailure(command, missingFailure(what, usage));
}

/** Required-input checks for trigger. Runs before any parsing, dry run, or request. */
function triggerInputFailure(
  options: WorkflowsTriggerOptions,
  usage: string
): Failure | null {
  if (!options.workflowId) {
    return missingFailure("workflow ID", usage);
  }
  if (options.contactId && options.contactEmail) {
    return {
      code: "INVALID_FLAG_USAGE",
      message: "Pass either --contact-id or --contact-email, not both.",
      suggestion: "Keep the flag that identifies the contact you mean.",
    };
  }
  if (!(options.contactId || options.contactEmail)) {
    return missingFailure("contact (--contact-id or --contact-email)", usage);
  }
  return null;
}

function reportNeedsConfirmation(command: string, reason: string): void {
  reportFailure(command, {
    code: "CONFIRMATION_REQUIRED",
    message: `${reason} Pass --yes to confirm.`,
    suggestion:
      "Re-run the same command with --yes once you have checked the IDs.",
  });
}

async function resolveTarget(token: string | undefined): Promise<Target> {
  const check = checkApiTarget(await resolveApiTarget({ token }));
  if (!check.ok) {
    return {
      ok: false,
      failure: {
        code: "NOT_AUTHENTICATED",
        message: check.reason,
        suggestion: check.suggestion,
      },
    };
  }
  return {
    ok: true,
    apiBase: check.target.apiBase,
    token: check.target.token,
  };
}

const NOT_FOUND_TEXT = /not found/i;

/** A4: read `message` before `error`. */
function responseText(status: number, body: ApiBody): string {
  if (typeof body.message === "string") {
    return body.message;
  }
  if (typeof body.error === "string") {
    return body.error;
  }
  return `HTTP ${status}`;
}

/** Failure for a non-2xx HTTP status. */
function httpStatusFailure(
  status: number,
  text: string,
  hint: string
): Failure {
  switch (status) {
    case 401:
      return {
        code: "NOT_AUTHENTICATED",
        message: `The API rejected the credentials (${text}).`,
        suggestion:
          "Run wraps auth login, or pass a valid API key with --token or WRAPS_API_KEY.",
      };
    case 402:
      return {
        code: "PLAN_REQUIRED",
        message: text,
        suggestion:
          "This account's plan or license does not include this action. Check the plan in the Wraps dashboard, then retry.",
      };
    case 403:
      return {
        code: "FORBIDDEN",
        message: text,
        suggestion:
          "This API key is not allowed to run this action. Use a key from the organization that owns the workflow.",
      };
    case 404:
      return { code: "NOT_FOUND", message: text, suggestion: hint };
    case 429:
      return {
        code: "RATE_LIMITED",
        message: text,
        suggestion: "The API rate limit was hit. Wait a minute, then retry.",
      };
    case 400:
    case 422:
      return {
        code: "VALIDATION_FAILED",
        message: text,
        suggestion:
          "The API rejected the request values. Check the flags against wraps --help and retry.",
      };
    default:
      if (status >= 500) {
        return {
          code: "SERVER_ERROR",
          message: text,
          suggestion:
            "The Wraps API failed. Retry in a few minutes. A trigger may already be queued, so check the workflow's runs before re-triggering.",
        };
      }
      return { code: "API_ERROR", message: text, suggestion: hint };
  }
}

/** Map an HTTP status and body to a failure, or null when the call succeeded. */
function classifyResponse(
  status: number,
  body: ApiBody,
  hint: string
): Failure | null {
  const text = responseText(status, body);
  const is2xx = status >= 200 && status < 300;

  if (!is2xx) {
    return httpStatusFailure(status, text, hint);
  }
  if (body.success !== false) {
    return null;
  }
  // HTTP 200 with success:false. Some are "not found", the rest are rejections.
  return {
    code: NOT_FOUND_TEXT.test(text) ? "NOT_FOUND" : "WORKFLOW_REJECTED",
    message: text,
    suggestion: hint,
  };
}

/** POST to a workflow route. Path segments must already be encoded by the caller. */
async function postWorkflowApi(
  target: { apiBase: string; token: string },
  path: string,
  payload: Record<string, unknown> | undefined,
  hint: string
): Promise<PostResult> {
  let resp: Response;
  try {
    resp = await fetch(`${target.apiBase}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.token}`,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      failure: {
        code: "NETWORK_ERROR",
        message: `Could not reach the Wraps API (${detail}).`,
        suggestion:
          "Check your network connection and the API URL (WRAPS_API_URL), then retry.",
      },
    };
  }

  const body = (await resp.json().catch(() => ({}))) as ApiBody;
  const failure = classifyResponse(resp.status, body, hint);
  return failure ? { ok: false, failure } : { ok: true, body };
}

/** Read --data as a JSON object. Absent means an empty object. */
function parseDataFlag(
  raw: string | undefined
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; failure: Failure } {
  const usage = `Pass a JSON object, for example --data '{"plan":"pro"}'.`;
  if (raw === undefined) {
    return { ok: true, value: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_USAGE",
        message: `--data is not valid JSON (${detail}).`,
        suggestion: usage,
      },
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_USAGE",
        message: "--data must be a JSON object, not an array or a scalar.",
        suggestion: usage,
      },
    };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

export async function workflowsTrigger(
  options: WorkflowsTriggerOptions
): Promise<void> {
  const command = "workflows.trigger";
  const usage =
    "wraps workflows trigger <workflow-id> (--contact-id <id> | --contact-email <email>) [--data <json>] --yes";

  const inputFailure = triggerInputFailure(options, usage);
  if (inputFailure) {
    reportFailure(command, inputFailure);
    return;
  }
  const parsed = parseDataFlag(options.data);
  if (!parsed.ok) {
    reportFailure(command, parsed.failure);
    return;
  }

  // triggerInputFailure above guarantees a non-empty ID.
  const workflowId = options.workflowId ?? "";
  const contactId = options.contactId ?? null;
  const contactEmail = options.contactEmail ?? null;

  // Dry run validates locally and sends nothing, so it runs before the --yes gate and auth.
  if (options.dryRun) {
    const preview = {
      dryRun: true,
      workflowId,
      workflowName: null,
      contactId,
      contactEmail,
      data: parsed.value,
      message: "Dry run: no request was sent.",
    };
    reportSuccess(command, preview, () => {
      note(
        JSON.stringify(
          { workflowId, contactId, contactEmail, data: parsed.value },
          null,
          2
        ),
        "Dry run: workflow trigger payload (not sent)"
      );
    });
    return;
  }

  if (!options.yes) {
    reportNeedsConfirmation(
      command,
      "Triggering a workflow enqueues real messages to the contact."
    );
    return;
  }

  const target = await resolveTarget(options.token);
  if (!target.ok) {
    reportFailure(command, target.failure);
    return;
  }

  const payload: Record<string, unknown> = { data: parsed.value };
  if (contactId) {
    payload.contactId = contactId;
  } else {
    payload.contactEmail = contactEmail;
  }

  const result = await postWorkflowApi(
    target,
    `/v1/workflows/${encodeURIComponent(workflowId)}/trigger`,
    payload,
    HINT_TRIGGER
  );
  if (!result.ok) {
    reportFailure(command, result.failure);
    return;
  }

  const body = result.body;
  const workflowName =
    typeof body.workflowName === "string" ? body.workflowName : null;
  const resolvedContactId =
    typeof body.contactId === "string" ? body.contactId : contactId;
  const message =
    typeof body.message === "string"
      ? body.message
      : "Workflow triggered successfully";

  reportSuccess(
    command,
    {
      dryRun: false,
      workflowId,
      workflowName,
      contactId: resolvedContactId,
      contactEmail,
      data: parsed.value,
      message,
    },
    () => {
      log.success(
        `${message}${workflowName ? `: ${workflowName}` : ""} (contact ${resolvedContactId ?? contactEmail ?? "unknown"}).`
      );
    }
  );
}

/**
 * enable/disable call the workflow-schedules routes (see the file header for the decision).
 * enable is gated by --yes (A11): it creates a schedule that will send later.
 * disable is not gated: it only stops sends.
 */
export async function workflowsEnable(
  options: WorkflowsEnableOptions
): Promise<void> {
  const command = "workflows.enable";
  const usage =
    "wraps workflows enable <workflow-id> --cron <expression> [--timezone <tz>] --yes";

  if (!options.workflowId) {
    reportMissing(command, "workflow ID", usage);
    return;
  }
  if (!options.cron) {
    reportFailure(command, {
      code: "MISSING_REQUIRED_FLAG",
      message: "Missing --cron expression.",
      suggestion:
        "Pass an EventBridge schedule expression, for example --cron 'cron(0 9 * * ? *)'. Enable schedules the next run of a schedule-triggered workflow.",
    });
    return;
  }

  if (!options.yes) {
    reportNeedsConfirmation(
      command,
      "Enabling creates a schedule that will send messages later."
    );
    return;
  }

  const target = await resolveTarget(options.token);
  if (!target.ok) {
    reportFailure(command, target.failure);
    return;
  }

  const workflowId = options.workflowId;
  const cronExpression = options.cron;
  const timezone = options.timezone ?? null;
  const payload: Record<string, unknown> = { cronExpression };
  if (timezone) {
    payload.timezone = timezone;
  }

  const result = await postWorkflowApi(
    target,
    `/v1/workflow-schedules/${encodeURIComponent(workflowId)}/enable`,
    payload,
    HINT_ENABLE
  );
  if (!result.ok) {
    reportFailure(command, result.failure);
    return;
  }

  const scheduleName =
    typeof result.body.scheduleName === "string"
      ? result.body.scheduleName
      : null;

  reportSuccess(
    command,
    { workflowId, scheduleName, cronExpression, timezone },
    () => {
      log.success(
        `Schedule enabled for workflow ${workflowId}${scheduleName ? ` (${scheduleName})` : ""}.`
      );
    }
  );
}

export async function workflowsDisable(
  options: WorkflowsDisableOptions
): Promise<void> {
  const command = "workflows.disable";
  const usage = "wraps workflows disable <workflow-id>";

  if (!options.workflowId) {
    reportMissing(command, "workflow ID", usage);
    return;
  }

  const target = await resolveTarget(options.token);
  if (!target.ok) {
    reportFailure(command, target.failure);
    return;
  }

  const workflowId = options.workflowId;
  const result = await postWorkflowApi(
    target,
    `/v1/workflow-schedules/${encodeURIComponent(workflowId)}/disable`,
    undefined,
    HINT_DISABLE
  );
  if (!result.ok) {
    reportFailure(command, result.failure);
    return;
  }

  reportSuccess(command, { workflowId, disabled: true }, () => {
    log.success(`Schedule disabled for workflow ${workflowId}.`);
  });
}

export async function workflowsRetry(
  options: WorkflowsRetryOptions
): Promise<void> {
  const command = "workflows.retry";
  const usage = "wraps workflows retry <execution-id> --yes";

  if (!options.executionId) {
    reportMissing(command, "execution ID", usage);
    return;
  }
  if (!options.yes) {
    reportNeedsConfirmation(
      command,
      "Retrying re-runs a failed execution, which can send messages again."
    );
    return;
  }

  const target = await resolveTarget(options.token);
  if (!target.ok) {
    reportFailure(command, target.failure);
    return;
  }

  const executionId = options.executionId;
  const result = await postWorkflowApi(
    target,
    `/v1/workflows/executions/${encodeURIComponent(executionId)}/retry`,
    undefined,
    HINT_RETRY
  );
  if (!result.ok) {
    reportFailure(command, result.failure);
    return;
  }

  const message =
    typeof result.body.message === "string"
      ? result.body.message
      : "Execution retry started";

  reportSuccess(command, { executionId, message }, () => {
    log.success(`${message} (execution ${executionId}).`);
  });
}

export async function workflowsCancel(
  options: WorkflowsCancelOptions
): Promise<void> {
  const command = "workflows.cancel";
  const usage = "wraps workflows cancel <execution-id> --yes";

  if (!options.executionId) {
    reportMissing(command, "execution ID", usage);
    return;
  }
  if (!options.yes) {
    reportNeedsConfirmation(
      command,
      "Cancelling stops a workflow execution that is still in progress."
    );
    return;
  }

  const target = await resolveTarget(options.token);
  if (!target.ok) {
    reportFailure(command, target.failure);
    return;
  }

  const executionId = options.executionId;
  const result = await postWorkflowApi(
    target,
    `/v1/workflows/executions/${encodeURIComponent(executionId)}/cancel`,
    undefined,
    HINT_CANCEL
  );
  if (!result.ok) {
    reportFailure(command, result.failure);
    return;
  }

  reportSuccess(command, { executionId, cancelled: true }, () => {
    log.success(`Execution ${executionId} cancelled.`);
  });
}
