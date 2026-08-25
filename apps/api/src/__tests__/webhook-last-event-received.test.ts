/**
 * Webhook — last_event_received_at Liveness Tracking
 *
 * The SES webhook route bumps aws_account.last_event_received_at for every
 * authenticated, well-formed SES event (throttled to ~1 write/min). This is
 * the ground-truth signal that the SES event feed is alive — plan 113 builds
 * staleness alerting on top of it. These tests confirm:
 *   1. an authenticated well-formed event issues an update scoped to the
 *      resolved account
 *   2. the update failing is swallowed (best-effort) and never fails the webhook
 *   3. an unauthenticated (401) request never touches aws_account
 *   4. an authenticated but malformed payload (no mail.messageId) never
 *      stamps liveness — it is EventBridge noise, not feed evidence. One
 *      such stamp promoted a never-connected account into a false "feed
 *      stalled" alert (SHC, 2026-08-25).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn(),
  deleteScheduledStep: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");
  return {
    ...actual,
    db: {
      select: mockDbSelect,
      update: mockDbUpdate,
      insert: mockDbInsert,
    },
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");
const { Elysia } = await import("elysia");

const AWS_ACCOUNT_NUMBER = "123456789012";
const WEBHOOK_SECRET = "test-secret-32-bytes-of-entropy0000";

const ACCOUNT_ROW = {
  id: "aws-account-1",
  webhookSecret: WEBHOOK_SECRET,
  organizationId: "org-1",
};

function createTestApp() {
  return new Elysia().use(webhooksRoutes);
}

// Serves both select shapes in the route. The first select is the account
// lookup, awaited directly off .where() (no .limit()); every later select is
// the messageSend lookup, which chains .limit(1) and resolves empty here so a
// well-formed event exits through the "message not found" branch without ever
// reaching the insert path (its event carries no destination, so no row is
// materialized either).
function setupSelects(accountRows: unknown[]) {
  let selectCall = 0;
  mockDbSelect.mockImplementation(() => {
    const rows = selectCall++ === 0 ? accountRows : [];
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
          // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock
          then: (
            resolve: (v: unknown) => void,
            reject?: (e: unknown) => void
          ) => Promise.resolve(rows).then(resolve, reject),
        }),
      }),
    };
  });
}

// ─── Drizzle SQL token-tree flattening ─────────────────────────────────────
// Walks the SQL fragment tree produced by and()/eq()/or()/isNull()/lt() into
// a flat list of bound parameter values, so we can confirm the WHERE clause
// actually references the resolved account's id without hardcoding a copy of
// drizzle's internal shape.
function flattenParamValues(node: unknown, out: unknown[] = []): unknown[] {
  if (node === null || typeof node !== "object") {
    return out;
  }
  if (Array.isArray(node)) {
    for (const n of node) {
      flattenParamValues(n, out);
    }
    return out;
  }
  const rec = node as Record<string, unknown>;
  if ("queryChunks" in rec) {
    flattenParamValues(rec.queryChunks, out);
    return out;
  }
  if ("encoder" in rec) {
    out.push((rec as { value?: unknown }).value);
    return out;
  }
  return out;
}

type UpdateChain = {
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
};

function updateChain(shouldThrow = false): UpdateChain {
  const where = shouldThrow
    ? vi.fn().mockRejectedValue(new Error("update failed"))
    : vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { set, where };
}

function setupUpdateCapture(shouldThrow = false) {
  const calls: UpdateChain[] = [];
  mockDbUpdate.mockImplementation(() => {
    const chain = updateChain(shouldThrow);
    calls.push(chain);
    return chain;
  });
  return calls;
}

// Minimal *well-formed* SES event: mail.messageId present (the liveness
// stamp sits below that guard), no destination (so the SDK-sender branch
// never materializes a row), and no matching messageSend row mocked — the
// route exits via "ignored" / "message not found" right after the stamp.
function buildWellFormedEvent() {
  return {
    version: "0",
    id: "event-1",
    "detail-type": "Email Sending Events",
    source: "aws.ses",
    account: AWS_ACCOUNT_NUMBER,
    time: new Date().toISOString(),
    region: "us-east-1",
    detail: { eventType: "Delivery", mail: { messageId: "ses-message-1" } },
  };
}

// The malformed shape from the 2026-08-25 incident: authenticated POST,
// parseable JSON, but nothing SES about it — no eventType, no mail.
function buildMalformedEvent() {
  return {
    version: "0",
    id: "event-junk",
    "detail-type": "Something Else Entirely",
    source: "custom.app",
    account: AWS_ACCOUNT_NUMBER,
    time: new Date().toISOString(),
    region: "us-east-1",
    detail: {},
  };
}

async function sendWebhookEvent(
  app: ReturnType<typeof createTestApp>,
  apiKey: string,
  event: Record<string, unknown> = buildWellFormedEvent()
) {
  return app.handle(
    new Request(`http://localhost/webhooks/ses/${AWS_ACCOUNT_NUMBER}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wraps-api-key": apiKey,
      },
      body: JSON.stringify(event),
    })
  );
}

describe("Webhook: last_event_received_at liveness tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticated well-formed event issues an update on aws_account scoped to the resolved account", async () => {
    setupSelects([ACCOUNT_ROW]);
    const updateCalls = setupUpdateCapture();

    const app = createTestApp();
    const response = await sendWebhookEvent(app, WEBHOOK_SECRET);

    expect(response.status).toBe(200);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({ lastEventReceivedAt: expect.any(Date) })
    );

    const whereArg = updateCalls[0].where.mock.calls[0]?.[0];
    const paramValues = flattenParamValues(whereArg);
    expect(paramValues).toContain(ACCOUNT_ROW.id);
  });

  it("update failure is swallowed — the webhook still returns its normal response", async () => {
    setupSelects([ACCOUNT_ROW]);
    setupUpdateCapture(true);

    const app = createTestApp();
    const response = await sendWebhookEvent(app, WEBHOOK_SECRET);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ignored");
  });

  it("unauthenticated (401) request never issues an aws_account update", async () => {
    setupSelects([ACCOUNT_ROW]);
    setupUpdateCapture();

    const app = createTestApp();
    const response = await sendWebhookEvent(app, "wrong-secret");

    expect(response.status).toBe(401);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("[2026-08-25 SHC] authenticated but malformed payload never stamps liveness", async () => {
    // Exactly what promoted SHC's never-connected account into a false
    // "feed stalled" alert: one authenticated POST whose detail carried no
    // eventType and no mail. Accepting it as feed evidence is what every
    // consumer of lastEventReceivedAt gets wrong-footed by; the route must
    // treat it as noise.
    setupSelects([ACCOUNT_ROW]);
    setupUpdateCapture();

    const app = createTestApp();
    const response = await sendWebhookEvent(
      app,
      WEBHOOK_SECRET,
      buildMalformedEvent()
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ignored");
    expect(body.reason).toBe("missing mail.messageId");
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
