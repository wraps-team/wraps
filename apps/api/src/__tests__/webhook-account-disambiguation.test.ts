/**
 * Webhook — Account Disambiguation by Secret
 *
 * account_id on aws_account is NOT unique: two orgs can register the same AWS
 * account number (legitimately, or maliciously — a victim's real account
 * number with no proof of ownership required). The webhook must resolve the
 * correct row by matching the inbound secret against every candidate row, not
 * by picking an arbitrary row and comparing against it.
 *
 * These tests seed two aws_account rows sharing one accountId (victim +
 * attacker) and confirm each secret resolves to its own org — the victim's
 * events are never misattributed to the attacker's org (or dropped with a
 * spurious 401), and vice versa.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeliveryEvent } from "./fixtures/ses-events";

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
      select: mockDbSelect,
      update: mockDbUpdate,
      insert: mockDbInsert,
    },
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");
const { errorContract } = await import("../middleware/error-contract");
const { Elysia } = await import("elysia");

const AWS_ACCOUNT_NUMBER = "123456789012";
const VICTIM_SECRET = "victim-secret-32-bytes-of-entropy00";
const ATTACKER_SECRET = "attacker-secret-different-value0000";

const VICTIM_ROW = {
  id: "aws-victim",
  webhookSecret: VICTIM_SECRET,
  organizationId: "org-victim",
};

const ATTACKER_ROW = {
  id: "aws-attacker",
  webhookSecret: ATTACKER_SECRET,
  organizationId: "org-attacker",
};

function createTestApp() {
  // Mount the real error-contract plugin: these assertions are about the body
  // a caller actually receives, and that plugin is what puts `code` in it.
  return new Elysia().use(errorContract).use(webhooksRoutes);
}

// Matches the account lookup: .from(awsAccount).where(eq(...)) — no .limit().
function selectChainUnlimited(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

// Matches the messageSend lookup: .from(messageSend).where(and(...)).limit(1).
function selectChainLimited(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function insertChain() {
  const values = vi.fn().mockReturnValue({
    // The messageSend insert now calls .onConflictDoNothing().returning(...)
    // to tell whether THIS call created the row (see webhooks.ts). These
    // tests exercise a fresh Delivery event for a brand-new messageId, so the
    // insert must read as "row created" — a non-empty array — for billing to
    // fire as expected. Mirrors webhook-delivery-counting.test.ts.
    onConflictDoNothing: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "sdk-msg-1" }]),
    }),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  });
  return { values };
}

async function sendWebhookEvent(
  app: ReturnType<typeof createTestApp>,
  body: Record<string, unknown>,
  apiKey: string,
  accountNumber = AWS_ACCOUNT_NUMBER
) {
  return app.handle(
    new Request(`http://localhost/webhooks/ses/${accountNumber}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wraps-api-key": apiKey,
      },
      body: JSON.stringify(body),
    })
  );
}

// Sets up: 1st select() call = account candidates lookup, 2nd = messageSend
// lookup (returns [] so the handler falls through to the SDK-fallback insert,
// letting us inspect which org/account the insert was scoped to).
function setupSelects(candidateRows: unknown[]) {
  let selectCallCount = 0;
  mockDbSelect.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) {
      return selectChainUnlimited(candidateRows);
    }
    return selectChainLimited([]);
  });
}

function setupInsertCapture() {
  const insertCalls: ReturnType<typeof insertChain>[] = [];
  mockDbInsert.mockImplementation(() => {
    const chain = insertChain();
    insertCalls.push(chain);
    return chain;
  });
  return insertCalls;
}

describe("Webhook: account disambiguation by secret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the victim's row (never the attacker's) when both share an accountId", async () => {
    setupSelects([VICTIM_ROW, ATTACKER_ROW]);
    const insertCalls = setupInsertCapture();

    const app = createTestApp();
    const event = buildDeliveryEvent({ account: AWS_ACCOUNT_NUMBER });
    const response = await sendWebhookEvent(app, event, VICTIM_SECRET);

    expect(response.status).toBe(200);
    // The messageSend insert (SDK-fallback path) must be scoped to the
    // victim's org — never the attacker's — even though the attacker's row
    // was returned alongside the victim's from the account lookup.
    expect(insertCalls[0].values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: VICTIM_ROW.organizationId,
        awsAccountId: VICTIM_ROW.id,
      })
    );
    expect(insertCalls[0].values).not.toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ATTACKER_ROW.organizationId })
    );
  });

  it("resolves the attacker's own row when the attacker's own secret is used", async () => {
    setupSelects([VICTIM_ROW, ATTACKER_ROW]);
    const insertCalls = setupInsertCapture();

    const app = createTestApp();
    const event = buildDeliveryEvent({ account: AWS_ACCOUNT_NUMBER });
    const response = await sendWebhookEvent(app, event, ATTACKER_SECRET);

    expect(response.status).toBe(200);
    expect(insertCalls[0].values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ATTACKER_ROW.organizationId,
        awsAccountId: ATTACKER_ROW.id,
      })
    );
    expect(insertCalls[0].values).not.toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: VICTIM_ROW.organizationId })
    );
  });

  it("returns 401 when the account number has no registered rows", async () => {
    setupSelects([]);

    const app = createTestApp();
    const event = buildDeliveryEvent({ account: "999999999999" });
    const response = await sendWebhookEvent(
      app,
      event,
      "any-key",
      "999999999999"
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });

  it("returns 401 when the key doesn't match any registered secret", async () => {
    setupSelects([VICTIM_ROW]);

    const app = createTestApp();
    const event = buildDeliveryEvent({ account: AWS_ACCOUNT_NUMBER });
    const response = await sendWebhookEvent(app, event, "wrong-secret-value");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });

  it("happy path: single registered row + correct secret processes the event", async () => {
    setupSelects([VICTIM_ROW]);
    const insertCalls = setupInsertCapture();

    const app = createTestApp();
    const event = buildDeliveryEvent({ account: AWS_ACCOUNT_NUMBER });
    const response = await sendWebhookEvent(app, event, VICTIM_SECRET);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ignored");
    expect(insertCalls[0].values).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: VICTIM_ROW.organizationId })
    );
  });
});
