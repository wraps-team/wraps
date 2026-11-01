/**
 * Agent-surface contract tests
 *
 * The per-command test files each assert their own error codes, which is how
 * three commands once returned UNAUTHORIZED for a rejected key while the rest
 * returned NOT_AUTHENTICATED. This file drives every network command through
 * the same four failure modes and checks they all answer the same way:
 *
 *   - the API answers 401            -> NOT_AUTHENTICATED
 *   - no API target is configured    -> NOT_AUTHENTICATED, and no request is made
 *   - the request cannot be sent     -> NETWORK_ERROR
 *   - the id is hostile ("../x?y=1") -> the id stays one encoded path segment
 *
 * Each run must print exactly one --json envelope with a message and a
 * suggestion, and set process.exitCode = 1.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../utils/shared/json-output.js";

vi.mock("@clack/prompts", () => ({
  log: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
  note: vi.fn(),
}));
vi.mock("../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

import {
  checkApiTarget,
  resolveApiTarget,
} from "../../utils/shared/api-target.js";
import {
  apiKeysCreate,
  apiKeysList,
  apiKeysRevoke,
} from "../api-keys/api-keys.js";
import { auditLogsExport, auditLogsList } from "../audit-logs/audit-logs.js";
import {
  brandKitsCreate,
  brandKitsDelete,
  brandKitsGet,
  brandKitsList,
  brandKitsSetDefault,
  brandKitsUpdate,
} from "../brand-kits/brand-kits.js";
import {
  broadcastsRecipients,
  broadcastsStatus,
} from "../broadcasts/broadcasts.js";
import { broadcastsDraft } from "../broadcasts/draft.js";
import {
  broadcastsCancel,
  broadcastsDuplicate,
  broadcastsUpdate,
} from "../broadcasts/lifecycle.js";
import {
  contactsExport,
  contactsImport,
  contactsValidate,
} from "../contacts/bulk.js";
import {
  contactsDelete,
  contactsGet,
  contactsList,
  contactsUpdate,
} from "../contacts/contacts.js";
import {
  agentApprovalsApprove,
  agentApprovalsList,
  agentApprovalsReject,
} from "../email/agent-approvals.js";
import { emailHealth } from "../email/health.js";
import {
  inboundEmailsGet,
  inboundEmailsList,
} from "../email/inbound-emails.js";
import { emailMetrics } from "../email/metrics.js";
import {
  suppressionsAdd,
  suppressionsList,
  suppressionsRemove,
} from "../email/suppressions.js";
import {
  templatesDelete,
  templatesDuplicate,
  templatesGet,
  templatesList,
  templatesPublish,
} from "../email/templates/remote.js";
import {
  eventsAnalytics,
  eventsGet,
  eventsList,
  eventsNames,
} from "../events/events.js";
import {
  segmentsDelete,
  segmentsGet,
  segmentsList,
  segmentsPreview,
  segmentsUpdate,
} from "../segments/segments.js";
import {
  topicsCreate,
  topicsDelete,
  topicsGet,
  topicsList,
  topicsSubscribers,
  topicsUpdate,
} from "../topics/topics.js";
import {
  workflowsExecution,
  workflowsExecutions,
  workflowsGet,
  workflowsList,
} from "../workflows/read.js";
import {
  workflowsCancel,
  workflowsDisable,
  workflowsRetry,
} from "../workflows/runtime.js";

const TARGET = { apiBase: "https://api.test", token: "wraps_test" };
const HOSTILE = "../x/y?z=1";

type Case = {
  name: string;
  run: (id?: string) => Promise<void>;
  /** Present when the command puts a caller-supplied id into the request path. */
  takesId?: boolean;
};

let contractImport: string | undefined;

/** A one-row CSV, created once per run, so the import case parses before it reaches the target check. */
function contractImportFile(): string {
  if (contractImport === undefined) {
    const file = join(
      mkdtempSync(join(tmpdir(), "contract-import-")),
      "contacts.csv"
    );
    writeFileSync(file, "email\na@example.com\n", "utf8");
    contractImport = file;
  }
  return contractImport;
}

const CASES: Case[] = [
  { name: "api-keys list", run: () => apiKeysList({ json: true }) },
  {
    name: "api-keys create",
    run: () => apiKeysCreate({ name: "ci", json: true }),
  },
  {
    name: "api-keys revoke",
    takesId: true,
    run: (id = "key_1") => apiKeysRevoke({ id, yes: true, json: true }),
  },
  { name: "contacts list", run: () => contactsList({ json: true }) },
  {
    name: "contacts get",
    takesId: true,
    run: (id = "c_1") => contactsGet({ id, json: true }),
  },
  {
    name: "contacts update",
    takesId: true,
    run: (id = "c_1") => contactsUpdate({ id, firstName: "Ada", json: true }),
  },
  {
    name: "contacts delete",
    takesId: true,
    run: (id = "c_1") => contactsDelete({ id, yes: true, json: true }),
  },
  { name: "events list", run: () => eventsList({ json: true }) },
  { name: "events analytics", run: () => eventsAnalytics({ json: true }) },
  { name: "events names", run: () => eventsNames({ json: true }) },
  {
    name: "events get",
    takesId: true,
    run: (id = "evt_1") => eventsGet({ id, json: true }),
  },
  {
    name: "contacts import",
    run: () => contactsImport({ file: contractImportFile(), json: true }),
  },
  { name: "contacts export", run: () => contactsExport({ json: true }) },
  {
    name: "contacts validate",
    run: () =>
      contactsValidate({
        emails: "a@example.com",
        awsAccountId: "acct_1",
        yes: true,
        json: true,
      }),
  },
  { name: "segments list", run: () => segmentsList({ json: true }) },
  {
    name: "segments get",
    takesId: true,
    run: (id = "seg_1") => segmentsGet({ id, json: true }),
  },
  {
    name: "segments update",
    takesId: true,
    run: (id = "seg_1") => segmentsUpdate({ id, name: "n", json: true }),
  },
  {
    name: "segments delete",
    takesId: true,
    run: (id = "seg_1") => segmentsDelete({ id, yes: true, json: true }),
  },
  {
    name: "segments preview",
    takesId: true,
    run: (id = "seg_1") => segmentsPreview({ id, json: true }),
  },
  {
    name: "broadcasts status",
    takesId: true,
    run: (id = "bc_1") => broadcastsStatus({ id, json: true }),
  },
  {
    name: "broadcasts recipients",
    takesId: true,
    run: (id = "bc_1") => broadcastsRecipients({ id, json: true }),
  },
  {
    name: "broadcasts cancel",
    takesId: true,
    run: (id = "bc_1") => broadcastsCancel({ id, yes: true, json: true }),
  },
  {
    name: "broadcasts duplicate",
    takesId: true,
    run: (id = "bc_1") => broadcastsDuplicate({ id, json: true }),
  },
  {
    name: "broadcasts update",
    takesId: true,
    run: (id = "bc_1") => broadcastsUpdate({ id, subject: "n", json: true }),
  },
  {
    name: "broadcasts draft",
    run: () => broadcastsDraft({ name: "Spring sale", json: true }),
  },
  { name: "email templates list", run: () => templatesList({ json: true }) },
  {
    name: "email templates get",
    takesId: true,
    run: (id = "tpl_1") => templatesGet({ id, json: true }),
  },
  {
    name: "email templates duplicate",
    takesId: true,
    run: (id = "tpl_1") => templatesDuplicate({ id, json: true }),
  },
  {
    name: "email templates publish",
    takesId: true,
    run: (id = "tpl_1") =>
      templatesPublish({ id, yes: true, awsAccountId: "acct_1", json: true }),
  },
  {
    name: "email templates delete",
    takesId: true,
    run: (id = "tpl_1") =>
      templatesDelete({ ids: [id], yes: true, json: true }),
  },
  {
    name: "email templates delete (bulk)",
    run: (id = "tpl_1") =>
      templatesDelete({ ids: [id, "tpl_2"], yes: true, json: true }),
  },
  {
    name: "workflows disable",
    takesId: true,
    run: (id = "wf_1") => workflowsDisable({ workflowId: id, json: true }),
  },
  {
    name: "workflows retry",
    takesId: true,
    run: (id = "ex_1") =>
      workflowsRetry({ executionId: id, yes: true, json: true }),
  },
  {
    name: "workflows cancel",
    takesId: true,
    run: (id = "ex_1") =>
      workflowsCancel({ executionId: id, yes: true, json: true }),
  },
  { name: "workflows list", run: () => workflowsList({ json: true }) },
  {
    name: "workflows get",
    takesId: true,
    run: (id = "wf_1") => workflowsGet({ workflowId: id, json: true }),
  },
  {
    name: "workflows executions",
    takesId: true,
    run: (id = "wf_1") => workflowsExecutions({ workflowId: id, json: true }),
  },
  {
    name: "workflows execution",
    takesId: true,
    run: (id = "ex_1") => workflowsExecution({ executionId: id, json: true }),
  },
  { name: "email metrics", run: () => emailMetrics({ json: true }) },
  {
    name: "email inbound list",
    run: () => inboundEmailsList({ json: true }),
  },
  {
    name: "email inbound get",
    takesId: true,
    run: (id = "em_1") => inboundEmailsGet({ emailId: id, json: true }),
  },
  { name: "audit-logs list", run: () => auditLogsList({ json: true }) },
  { name: "audit-logs export", run: () => auditLogsExport({ json: true }) },
  {
    name: "email suppressions list",
    run: () => suppressionsList({ json: true }),
  },
  {
    name: "email suppressions remove",
    run: () =>
      suppressionsRemove({
        email: "a@example.com",
        account: "acc_1",
        yes: true,
        json: true,
      }),
  },
  {
    name: "email suppressions add",
    run: () =>
      suppressionsAdd({
        emails: ["a@example.com"],
        account: "acc_1",
        reason: "bounce",
        yes: true,
        json: true,
      }),
  },
  { name: "email health", run: () => emailHealth({ json: true }) },
  { name: "brand-kits list", run: () => brandKitsList({ json: true }) },
  {
    name: "brand-kits get",
    takesId: true,
    run: (id = "bk_1") => brandKitsGet({ id, json: true }),
  },
  {
    name: "brand-kits create",
    run: () => brandKitsCreate({ name: "Acme", json: true }),
  },
  {
    name: "brand-kits update",
    takesId: true,
    run: (id = "bk_1") => brandKitsUpdate({ id, name: "Acme", json: true }),
  },
  {
    name: "brand-kits delete",
    takesId: true,
    run: (id = "bk_1") => brandKitsDelete({ id, yes: true, json: true }),
  },
  {
    name: "brand-kits set-default",
    takesId: true,
    run: (id = "bk_1") => brandKitsSetDefault({ id, json: true }),
  },
  { name: "topics list", run: () => topicsList({ json: true }) },
  {
    name: "topics get",
    takesId: true,
    run: (id = "topic_1") => topicsGet({ id, json: true }),
  },
  {
    name: "topics create",
    run: () => topicsCreate({ name: "News", json: true }),
  },
  {
    name: "topics update",
    takesId: true,
    run: (id = "topic_1") => topicsUpdate({ id, name: "News", json: true }),
  },
  {
    name: "topics delete",
    takesId: true,
    run: (id = "topic_1") => topicsDelete({ id, yes: true, json: true }),
  },
  {
    name: "topics subscribers",
    takesId: true,
    run: (id = "topic_1") => topicsSubscribers({ id, json: true }),
  },
  { name: "email agent approvals list", run: () => agentApprovalsList({}) },
  {
    name: "email agent approvals approve",
    takesId: true,
    run: (id = "apr_1") => agentApprovalsApprove({ id, yes: true }),
  },
  {
    name: "email agent approvals reject",
    takesId: true,
    run: (id = "apr_1") => agentApprovalsReject({ id, yes: true }),
  },
];

describe("agent-surface contract: every command fails the same way", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    process.exitCode = undefined;
    setJsonMode(true);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(resolveApiTarget).mockResolvedValue({} as never);
    vi.mocked(checkApiTarget).mockReturnValue({
      ok: true,
      target: TARGET,
    } as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    setJsonMode(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The single envelope printed, which must be an error with an actionable suggestion. */
  function failure(): { code: string; message: string; suggestion: string } {
    expect(logSpy).toHaveBeenCalledTimes(1);
    const env = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(env.success).toBe(false);
    expect(typeof env.command).toBe("string");
    expect(env.error.message).toBeTruthy();
    expect(env.error.suggestion).toBeTruthy();
    expect(process.exitCode).toBe(1);
    return env.error;
  }

  describe.each(CASES)("$name", ({ run, takesId }) => {
    it("a 401 from the API is NOT_AUTHENTICATED", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      });

      await run();

      expect(failure().code).toBe("NOT_AUTHENTICATED");
    });

    it("no API target is NOT_AUTHENTICATED and sends no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await run();

      expect(failure().code).toBe("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a request that cannot be sent is NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await run();

      expect(failure().code).toBe("NETWORK_ERROR");
    });

    if (takesId) {
      it("a hostile id stays one encoded path segment", async () => {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 404,
          json: async () => ({ error: "Not found" }),
        });
        const clean = new Set<string>();
        await run("clean");
        for (const call of fetchMock.mock.calls) {
          clean.add(new URL(String(call[0])).pathname);
        }
        fetchMock.mockClear();
        logSpy.mockClear();
        process.exitCode = undefined;

        await run(HOSTILE);

        expect(fetchMock).toHaveBeenCalled();
        for (const call of fetchMock.mock.calls) {
          const url = new URL(String(call[0]));
          // Same path shape as a clean id: the hostile id did not add segments or a query.
          const segments = (path: string) => path.split("/").length;
          expect(
            [...clean].some((p) => segments(p) === segments(url.pathname))
          ).toBe(true);
          expect(url.search).not.toContain("z=1");
          expect(url.pathname).toContain(encodeURIComponent(HOSTILE));
        }
      });
    }
  });
});
