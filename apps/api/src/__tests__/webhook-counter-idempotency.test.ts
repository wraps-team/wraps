/**
 * Webhook Counter Idempotency Tests
 *
 * SES -> EventBridge delivery is at-least-once: the same lifecycle event can
 * be redelivered. The Delivery/Bounce/Complaint/Suppressed handlers must only
 * increment batchSend lifecycle counters and messageUsageMonthly billing
 * counts when the underlying messageSend row genuinely transitions status —
 * a redelivered event for an already-transitioned row must not double-count,
 * and a late Delivery must not regress an opened/clicked/bounced row back to
 * "delivered".
 *
 * The mock below is a small in-memory table: it evaluates the ACTUAL WHERE
 * conditions and SET clauses the route issues (via drizzle's SQL token tree)
 * against harness state, rather than hardcoding a copy of the expected guard
 * logic. If the production guards weaken, the mock's behavior weakens with
 * them and the assertions catch it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBounceEvent,
  buildComplaintEvent,
  buildDeliveryEvent,
  buildOpenEvent,
  buildSuppressionEvent,
} from "./fixtures/ses-events";

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
// Real drizzle table objects (vi.mock spreads importActual) — used to
// dispatch update() calls onto the right in-memory row by table identity.
const { batchSend, contact, messageSend } = await import("@wraps/db");
const { Elysia } = await import("elysia");

const TEST_AWS_ACCOUNT_NUMBER = "123456789012";
const TEST_WEBHOOK_SECRET = "test-secret-key";
const ORG_ID = "org-1";

function createTestApp() {
  return new Elysia().use(webhooksRoutes);
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
  organizationId: ORG_ID,
};

type MessageState = {
  id: string;
  status: string;
  batchSendId: string | null;
  contactId: string | null;
  openedAt: Date | null;
  clickedAt: Date | null;
};

// Dual-shape select mock: works whether a select's terminal call awaits at
// .limit() (current code for both account + message lookups) or at .where()
// directly (plan 086's rewrite of the account lookup only). Using the same
// shape for every select in this file keeps it correct under both versions.
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

// ─── Drizzle SQL token-tree evaluation ─────────────────────────────────────
// Flattens a drizzle condition / sql fragment into a linear token stream of
// columns, operator text, and bound params, then evaluates it against a row.

type Tok =
  | { t: "col"; name: string }
  | { t: "txt"; s: string }
  | { t: "param"; v: unknown };

function flatten(node: unknown, out: Tok[] = []): Tok[] {
  if (node === null || typeof node !== "object") {
    return out;
  }
  if (Array.isArray(node)) {
    for (const n of node) {
      flatten(n, out);
    }
    return out;
  }
  const rec = node as Record<string, unknown>;
  if ("queryChunks" in rec) {
    flatten(rec.queryChunks, out);
    return out;
  }
  if ("columnType" in rec) {
    out.push({ t: "col", name: rec.name as string });
    return out;
  }
  if ("encoder" in rec) {
    out.push({ t: "param", v: rec.value });
    return out;
  }
  if ("value" in rec && Array.isArray(rec.value)) {
    out.push({ t: "txt", s: (rec.value as string[]).join("") });
    return out;
  }
  return out;
}

const snakeToCamel = (name: string) =>
  name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * Evaluates a WHERE condition (conjunction of simple predicates: =, <>,
 * IN, IS NULL) against a row keyed by camelCase field names.
 */
function evalWhere(cond: unknown, row: Record<string, unknown>): boolean {
  const toks = flatten(cond);
  let i = 0;
  while (i < toks.length) {
    const tok = toks[i];
    if (tok.t !== "col") {
      i++;
      continue;
    }
    const colVal = row[snakeToCamel(tok.name)];
    let j = i + 1;
    while (j < toks.length) {
      const t = toks[j];
      if (t.t === "txt" && t.s.trim()) {
        break;
      }
      j++;
    }
    const opTok = toks[j];
    const op = opTok?.t === "txt" ? opTok.s.trim() : "";
    const params: unknown[] = [];
    let k = j + 1;
    while (k < toks.length && toks[k].t === "param") {
      params.push((toks[k] as { t: "param"; v: unknown }).v);
      k++;
    }
    let ok = true;
    if (op === "=") {
      ok = colVal === params[0];
    } else if (op === "<>") {
      ok = colVal !== params[0];
    } else if (op === "in") {
      ok = params.includes(colVal);
    } else if (op === "is null") {
      ok = colVal === null || colVal === undefined;
    }
    if (!ok) {
      return false;
    }
    i = k;
  }
  return true;
}

/**
 * Applies a SET clause to a row: literal values are assigned directly; SQL
 * fragments (`col + 1`, `greatest(col - 1, 0)`) are executed numerically.
 */
function applySet(data: Record<string, unknown>, row: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === "object" && "queryChunks" in value) {
      const toks = flatten(value);
      const col = toks.find((t) => t.t === "col") as
        | { t: "col"; name: string }
        | undefined;
      if (!col) {
        continue;
      }
      const text = toks
        .map((t) => (t.t === "txt" ? t.s : ""))
        .join("")
        .trim();
      const field = snakeToCamel(col.name);
      const current =
        typeof row[field] === "number" ? (row[field] as number) : 0;
      if (text.includes("+ 1")) {
        row[field] = current + 1;
      } else if (text.includes("- 1")) {
        // greatest(col - 1, 0)
        row[field] = Math.max(0, current - 1);
      }
    } else {
      row[key] = value;
    }
  }
}

type BatchState = {
  id: string;
  delivered: number;
  bounced: number;
  complained: number;
  suppressed: number;
  failed: number;
  opened: number;
  clicked: number;
};

type HarnessOpts = {
  batch?: Partial<BatchState>;
};

/**
 * Minimal stateful harness: in-memory messageSend + batchSend rows updated by
 * evaluating the actual queries the route issues, plus a messageUsageMonthly
 * count driven by the incrementDeliveryCount upsert.
 */
function createHarness(initialMessage: MessageState, opts: HarnessOpts = {}) {
  const message: Record<string, unknown> = { ...initialMessage };
  const batch: Record<string, unknown> = {
    id: initialMessage.batchSendId ?? "batch-1",
    delivered: 0,
    bounced: 0,
    complained: 0,
    suppressed: 0,
    failed: 0,
    opened: 0,
    clicked: 0,
    ...opts.batch,
  };
  const usage = { messageCount: 0 };

  mockDbUpdate.mockImplementation((table: unknown) => ({
    set: (data: Record<string, unknown>) => ({
      where: (cond: unknown) => {
        let row: Record<string, unknown> | null = null;
        if (table === messageSend) {
          row = message;
        } else if (table === batchSend) {
          row = batch;
        } else if (table === contact) {
          row = null; // contact engagement is not under test here
        }
        if (!row) {
          return Object.assign(Promise.resolve({ rowCount: 1 }), {
            returning: vi.fn().mockResolvedValue([]),
          });
        }
        const matches = evalWhere(cond, row);
        if (matches) {
          applySet(data, row);
        }
        return Object.assign(Promise.resolve({ rowCount: matches ? 1 : 0 }), {
          returning: vi.fn().mockResolvedValue(matches ? [{ id: row.id }] : []),
        });
      },
    }),
  }));

  mockDbInsert.mockImplementation(() => ({
    values: () => ({
      onConflictDoUpdate: () => {
        usage.messageCount++;
        return Promise.resolve(undefined);
      },
      onConflictDoNothing: () => ({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  }));

  /** Queue the account + message selects for exactly one HTTP request. */
  function queueRequest() {
    mockDbSelect.mockReturnValueOnce(selectChain([mockAwsAccount]));
    mockDbSelect.mockReturnValueOnce(selectChain([{ ...message }]));
  }

  return { message, batch, usage, queueRequest };
}

describe("Webhook: lifecycle counter idempotency", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("duplicate Delivery bumps batchSend.delivered exactly once", async () => {
    const harness = createHarness({
      id: "msg-1",
      status: "sent",
      batchSendId: "batch-1",
      contactId: null,
      openedAt: null,
      clickedAt: null,
    });

    const event = buildDeliveryEvent();

    harness.queueRequest();
    const res1 = await sendWebhookEvent(app, event);
    expect(res1.status).toBe(200);
    expect((await res1.json()).status).toBe("processed");

    harness.queueRequest();
    const res2 = await sendWebhookEvent(app, event);
    expect(res2.status).toBe(200);

    expect(harness.batch.delivered).toBe(1);
    expect(harness.message.status).toBe("delivered");
  });

  it("duplicate Delivery bumps messageUsageMonthly exactly once (matched path)", async () => {
    const harness = createHarness({
      id: "msg-1",
      status: "sent",
      batchSendId: null,
      contactId: null,
      openedAt: null,
      clickedAt: null,
    });

    const event = buildDeliveryEvent();

    harness.queueRequest();
    await sendWebhookEvent(app, event);
    harness.queueRequest();
    await sendWebhookEvent(app, event);

    expect(harness.usage.messageCount).toBe(1);
  });

  it("duplicate Bounce bumps batchSend.bounced exactly once", async () => {
    const harness = createHarness({
      id: "msg-1",
      status: "sent",
      batchSendId: "batch-1",
      contactId: null,
      openedAt: null,
      clickedAt: null,
    });

    const event = buildBounceEvent({
      bounceType: "Permanent",
      bounceSubType: "General",
    });

    harness.queueRequest();
    await sendWebhookEvent(app, event);
    harness.queueRequest();
    await sendWebhookEvent(app, event);

    expect(harness.batch.bounced).toBe(1);
    expect(harness.message.status).toBe("bounced");
  });

  it("duplicate Complaint bumps batchSend.complained exactly once", async () => {
    const harness = createHarness({
      id: "msg-1",
      status: "sent",
      batchSendId: "batch-1",
      contactId: null,
      openedAt: null,
      clickedAt: null,
    });

    const event = buildComplaintEvent();

    harness.queueRequest();
    await sendWebhookEvent(app, event);
    harness.queueRequest();
    await sendWebhookEvent(app, event);

    expect(harness.batch.complained).toBe(1);
    expect(harness.message.status).toBe("complained");
  });

  it("duplicate Suppressed bumps batchSend.suppressed exactly once", async () => {
    const harness = createHarness({
      id: "msg-1",
      status: "sent",
      batchSendId: "batch-1",
      contactId: null,
      openedAt: null,
      clickedAt: null,
    });

    const event = buildSuppressionEvent();

    harness.queueRequest();
    await sendWebhookEvent(app, event);
    harness.queueRequest();
    await sendWebhookEvent(app, event);

    expect(harness.batch.suppressed).toBe(1);
    expect(harness.message.status).toBe("suppressed");
  });

  it("first delivery still counts (regression)", async () => {
    const harness = createHarness({
      id: "msg-1",
      status: "sent",
      batchSendId: "batch-1",
      contactId: null,
      openedAt: null,
      clickedAt: null,
    });

    const event = buildDeliveryEvent();
    harness.queueRequest();
    const res = await sendWebhookEvent(app, event);

    expect(res.status).toBe(200);
    expect(harness.batch.delivered).toBe(1);
    expect(harness.usage.messageCount).toBe(1);
  });

  it("failed->delivered heal still counts once; a duplicate leaves counters unchanged", async () => {
    const harness = createHarness(
      {
        id: "msg-1",
        status: "failed",
        batchSendId: "batch-1",
        contactId: null,
        openedAt: null,
        clickedAt: null,
      },
      { batch: { failed: 1 } }
    );

    const event = buildDeliveryEvent();

    harness.queueRequest();
    const res1 = await sendWebhookEvent(app, event);
    expect(res1.status).toBe(200);
    expect(harness.batch.delivered).toBe(1);
    expect(harness.batch.failed).toBe(0);
    expect(harness.message.status).toBe("delivered");

    harness.queueRequest();
    const res2 = await sendWebhookEvent(app, event);
    expect(res2.status).toBe(200);

    // Duplicate delivery for an already-delivered row must not re-count.
    expect(harness.batch.delivered).toBe(1);
    expect(harness.batch.failed).toBe(0);
  });

  it("Delivery -> Open -> duplicate Delivery: no re-count and no status regression", async () => {
    const harness = createHarness({
      id: "msg-1",
      status: "sent",
      batchSendId: "batch-1",
      contactId: null,
      openedAt: null,
      clickedAt: null,
    });

    // 1. Delivery — genuine transition
    harness.queueRequest();
    const res1 = await sendWebhookEvent(app, buildDeliveryEvent());
    expect(res1.status).toBe(200);
    expect(harness.message.status).toBe("delivered");
    expect(harness.batch.delivered).toBe(1);
    expect(harness.usage.messageCount).toBe(1);

    // 2. Open — row moves to "opened" (a post-delivery status)
    harness.queueRequest();
    const res2 = await sendWebhookEvent(app, buildOpenEvent());
    expect(res2.status).toBe(200);
    expect(harness.message.status).toBe("opened");
    expect(harness.batch.opened).toBe(1);

    // 3. Duplicate Delivery — must NOT regress the status back to
    //    "delivered" and must NOT re-count.
    harness.queueRequest();
    const res3 = await sendWebhookEvent(app, buildDeliveryEvent());
    expect(res3.status).toBe(200);

    expect(harness.message.status).toBe("opened");
    expect(harness.batch.delivered).toBe(1);
    expect(harness.usage.messageCount).toBe(1);
  });

  it("late Delivery for a bounced row changes nothing", async () => {
    const harness = createHarness(
      {
        id: "msg-1",
        status: "bounced",
        batchSendId: "batch-1",
        contactId: null,
        openedAt: null,
        clickedAt: null,
      },
      { batch: { bounced: 1 } }
    );

    harness.queueRequest();
    const res = await sendWebhookEvent(app, buildDeliveryEvent());
    expect(res.status).toBe(200);

    expect(harness.message.status).toBe("bounced");
    expect(harness.batch.bounced).toBe(1);
    expect(harness.batch.delivered).toBe(0);
    expect(harness.usage.messageCount).toBe(0);
  });
});
