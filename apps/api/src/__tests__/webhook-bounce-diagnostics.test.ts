/**
 * Webhook Bounce Diagnostics Tests (mocked db)
 *
 * A Bounce records the receiver's SMTP diagnostic in message_send_diagnostic:
 * the enhanced status, the redacted diagnostic code and the reason key. A
 * duplicate Bounce does not change the stored value or the counters. Suppression
 * subtypes record nothing.
 */

import { translateDiagnosticCode } from "@wraps/core/email-diagnostics";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBounceEvent } from "./fixtures/ses-events";

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();

vi.mock("../lib/subscription-gate", () => ({
  hasActiveSubscription: vi.fn().mockResolvedValue(true),
}));

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn(),
  deleteScheduledStep: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: vi.fn(),
}));

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");
  return {
    ...actual,
    db: {
      // Runs the callback against this same fake so call recording and order are unchanged.
      transaction: vi.fn(async function (
        this: unknown,
        fn: (tx: unknown) => unknown
      ) {
        return fn(this);
      }),
      select: mockDbSelect,
      update: mockDbUpdate,
      insert: mockDbInsert,
    },
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");
const { Elysia } = await import("elysia");
const { batchSend, messageSend, messageSendDiagnostic } = await import(
  "@wraps/db"
);
const { log } = await import("../lib/logger");

const TEST_AWS_ACCOUNT_NUMBER = "123456789012";
const TEST_WEBHOOK_SECRET = "test-secret-key";

function createTestApp() {
  return new Elysia().use(webhooksRoutes);
}

function selectChain(rows: unknown[]) {
  const whereResult = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
  });
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
    }),
  };
}

async function sendWebhookEvent(
  app: ReturnType<typeof createTestApp>,
  body: Record<string, unknown>
) {
  return app.handle(
    new Request(`http://localhost/webhooks/ses/${TEST_AWS_ACCOUNT_NUMBER}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wraps-api-key": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify(body),
    })
  );
}

const mockAwsAccount = {
  id: "aws-1",
  webhookSecret: TEST_WEBHOOK_SECRET,
  organizationId: "org-1",
};

const RECIPIENT = "user@example.com";

// The row the batch path finds. Tests mutate it between events to model a
// message that is still "sent" before its first bounce.
let currentMessage: Record<string, unknown>;

// Transition result for each messageSend guarded update, in call order.
// true = a genuine transition (the first bounce), false = a duplicate.
let transitionResults: boolean[];
// Rows returned by the SDK-path messageSend insert (onConflictDoNothing).
let sdkInsertRows: Array<{ id: string }>;
// When set, the diagnostic upsert rejects with this error.
let diagnosticUpsertError: Error | null;

let updateTables: unknown[];
let setCalls: Array<{ table: unknown; data: Record<string, unknown> }>;
let diagnosticUpserts: Array<{
  values: Record<string, unknown>;
  config: { set: Record<string, unknown> };
}>;

function setupMocks(opts: {
  message: Record<string, unknown> | null;
  transitions?: boolean[];
  sdkInsertRows?: Array<{ id: string }>;
}) {
  currentMessage = opts.message ?? {};
  transitionResults = [...(opts.transitions ?? [])];
  sdkInsertRows = opts.sdkInsertRows ?? [];
  diagnosticUpsertError = null;
  updateTables = [];
  setCalls = [];
  diagnosticUpserts = [];

  // Odd selects are the account lookup, even selects the message lookup. The
  // route issues exactly these two per event when no waiting execution exists.
  let selectCalls = 0;
  mockDbSelect.mockImplementation(() => {
    selectCalls++;
    if (selectCalls % 2 === 1) {
      return selectChain([mockAwsAccount]);
    }
    return selectChain(opts.message ? [currentMessage] : []);
  });

  mockDbUpdate.mockImplementation((table: unknown) => {
    updateTables.push(table);
    const transitioned =
      table === messageSend ? (transitionResults.shift() ?? true) : true;
    return {
      set: vi.fn((data: Record<string, unknown>) => {
        setCalls.push({ table, data });
        return {
          where: vi.fn().mockReturnValue(
            Object.assign(Promise.resolve(undefined), {
              returning: vi
                .fn()
                .mockResolvedValue(transitioned ? [{ id: "msg-send-1" }] : []),
            })
          ),
        };
      }),
    };
  });

  mockDbInsert.mockImplementation((table: unknown) => ({
    values: (row: Record<string, unknown>) => ({
      onConflictDoUpdate: (config: { set: Record<string, unknown> }) => {
        if (table === messageSendDiagnostic) {
          diagnosticUpserts.push({ values: row, config });
          return diagnosticUpsertError
            ? Promise.reject(diagnosticUpsertError)
            : Promise.resolve(undefined);
        }
        return Promise.resolve(undefined);
      },
      onConflictDoNothing: () => ({
        returning: vi.fn().mockResolvedValue(sdkInsertRows),
      }),
    }),
  }));
}

function expectedReasonKey(status: string, diagnosticCode: string): string {
  const t = translateDiagnosticCode({ status, diagnosticCode });
  if (!t) {
    throw new Error("fixture diagnostic must translate");
  }
  return `${t.provider ?? ""}|${t.code ?? ""}|${t.title}`;
}

describe("Webhook: Bounce diagnostics", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    setupMocks({
      message: {
        id: "msg-send-1",
        status: "sent",
        batchSendId: null,
        contactId: null,
        openedAt: null,
        clickedAt: null,
        recipient: RECIPIENT,
      },
      transitions: [true],
    });
  });

  it("webhook persists enhanced status, redacted diagnostic and reason key on Bounce", async () => {
    const diagnosticCode = "smtp; 550 5.1.1 <user@example.com> user unknown";
    const redacted = "smtp; 550 5.1.1 <[address]> user unknown";

    const response = await sendWebhookEvent(
      app,
      buildBounceEvent({
        bounceType: "Permanent",
        bounceSubType: "NoEmail",
        status: "5.1.1",
        diagnosticCode,
      })
    );

    expect(response.status).toBe(200);
    const upserts = diagnosticUpserts;
    expect(upserts).toHaveLength(1);
    expect(upserts[0].values).toEqual({
      messageSendId: "msg-send-1",
      organizationId: "org-1",
      eventType: "bounce",
      enhancedStatus: "5.1.1",
      diagnosticCode: redacted,
      reasonKey: expectedReasonKey("5.1.1", redacted),
      feedbackType: null,
    });
    expect(JSON.stringify(upserts[0].values)).not.toContain(RECIPIENT);
  });

  it("absent diagnostic fields are tolerated and still write a recorded marker", async () => {
    const response = await sendWebhookEvent(app, buildBounceEvent({}));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("processed");

    expect(diagnosticUpserts).toHaveLength(1);
    expect(diagnosticUpserts[0].values).toEqual({
      messageSendId: "msg-send-1",
      organizationId: "org-1",
      eventType: "bounce",
      enhancedStatus: null,
      diagnosticCode: null,
      reasonKey: null,
      feedbackType: null,
    });
  });

  it("duplicate Bounce event does not double count and keeps the first diagnostic", async () => {
    setupMocks({
      message: {
        id: "msg-send-1",
        status: "sent",
        batchSendId: "batch-1",
        contactId: null,
        openedAt: null,
        clickedAt: null,
        recipient: RECIPIENT,
      },
      transitions: [true, false],
    });

    const first = buildBounceEvent({
      bounceSubType: "General",
      status: "5.1.1",
      diagnosticCode: "smtp; 550 5.1.1 user unknown",
    });
    const second = buildBounceEvent({
      bounceSubType: "General",
      status: "5.7.1",
      diagnosticCode: "smtp; 550 5.7.1 rejected",
    });

    expect((await sendWebhookEvent(app, first)).status).toBe(200);
    expect((await sendWebhookEvent(app, second)).status).toBe(200);

    // The batch counter moves once: only the first event is a transition.
    expect(updateTables.filter((t) => t === batchSend)).toHaveLength(1);

    // Both events upsert with the COALESCE rule, so the database keeps the
    // first stored value. The second write cannot replace it.
    expect(diagnosticUpserts).toHaveLength(2);
    for (const upsert of diagnosticUpserts) {
      expect(upsert.values.messageSendId).toBe("msg-send-1");
      expect(upsert.config.set).toEqual(
        expect.objectContaining({
          enhancedStatus: expect.anything(),
          diagnosticCode: expect.anything(),
          reasonKey: expect.anything(),
          feedbackType: expect.anything(),
        })
      );
    }
    expect(diagnosticUpserts[0].values.enhancedStatus).toBe("5.1.1");
    expect(diagnosticUpserts[1].values.enhancedStatus).toBe("5.7.1");
  });

  it.each([
    "Suppressed",
    "OnAccountSuppressionList",
    "OnTenantSuppressionList",
    "EmailValidationSuppressed",
  ])("%s Bounce writes no diagnostic row", async (bounceSubType) => {
    const response = await sendWebhookEvent(
      app,
      buildBounceEvent({
        bounceSubType,
        status: "5.1.1",
        diagnosticCode: "smtp; 550 5.1.1 user unknown",
      })
    );

    expect(response.status).toBe(200);
    expect(diagnosticUpserts).toHaveLength(0);
  });

  it("SDK-path Bounce-first insert writes a diagnostic row for the inserted id", async () => {
    setupMocks({
      message: null,
      sdkInsertRows: [{ id: "sdk-send-1" }],
    });

    const response = await sendWebhookEvent(
      app,
      buildBounceEvent({
        bounceSubType: "General",
        status: "5.1.1",
        diagnosticCode: "smtp; 550 5.1.1 user unknown",
      })
    );

    expect(response.status).toBe(200);
    expect(diagnosticUpserts).toHaveLength(1);
    expect(diagnosticUpserts[0].values).toEqual(
      expect.objectContaining({
        messageSendId: "sdk-send-1",
        organizationId: "org-1",
        eventType: "bounce",
        enhancedStatus: "5.1.1",
        feedbackType: null,
      })
    );
  });

  it.each([
    "Suppressed",
    "OnAccountSuppressionList",
    "OnTenantSuppressionList",
    "EmailValidationSuppressed",
  ])("SDK-path %s Bounce writes no diagnostic row", async (bounceSubType) => {
    setupMocks({
      message: null,
      sdkInsertRows: [{ id: "sdk-send-2" }],
    });

    const response = await sendWebhookEvent(
      app,
      buildBounceEvent({
        bounceSubType,
        status: "5.1.1",
        diagnosticCode: "smtp; 550 5.1.1 user unknown",
      })
    );

    expect(response.status).toBe(200);
    expect(diagnosticUpserts).toHaveLength(0);
  });

  it("SDK-path diagnostic write failure is logged and the response is not 500", async () => {
    setupMocks({
      message: null,
      sdkInsertRows: [{ id: "sdk-send-3" }],
    });
    diagnosticUpsertError = new Error("upsert failed");

    const response = await sendWebhookEvent(
      app,
      buildBounceEvent({
        bounceSubType: "General",
        status: "5.1.1",
        diagnosticCode: "smtp; 550 5.1.1 user unknown",
      })
    );

    expect(response.status).not.toBe(500);
    expect(log.error).toHaveBeenCalledWith(
      "Webhook: diagnostic write failed",
      expect.any(Error),
      expect.objectContaining({ messageId: expect.any(String) })
    );
    expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain(
      RECIPIENT
    );
  });

  it("batch Bounce diagnostic write failure still runs the status transition and counter", async () => {
    setupMocks({
      message: {
        id: "msg-send-1",
        status: "sent",
        batchSendId: "batch-1",
        contactId: null,
        openedAt: null,
        clickedAt: null,
        recipient: RECIPIENT,
      },
      transitions: [true],
    });
    diagnosticUpsertError = new Error("upsert failed");

    const response = await sendWebhookEvent(
      app,
      buildBounceEvent({
        bounceSubType: "General",
        status: "5.1.1",
        diagnosticCode: "smtp; 550 5.1.1 user unknown",
      })
    );

    expect(response.status).not.toBe(500);
    expect(setCalls).toContainEqual(
      expect.objectContaining({
        table: messageSend,
        data: expect.objectContaining({ status: "bounced" }),
      })
    );
    expect(setCalls.some((c) => c.table === batchSend)).toBe(true);
    expect(log.error).toHaveBeenCalledWith(
      "Webhook: diagnostic write failed",
      expect.any(Error),
      expect.objectContaining({ messageId: expect.any(String) })
    );
  });

  it("writes the diagnostic through the messageSendDiagnostic table", async () => {
    await sendWebhookEvent(app, buildBounceEvent({}));
    expect(mockDbInsert).toHaveBeenCalledWith(messageSendDiagnostic);
  });
});
