/**
 * Webhook Missing Mail Field Tests
 *
 * Verifies that the SES webhook endpoint handles events where
 * event.detail.mail is undefined without crashing.
 *
 * Bug: https://wraps.sentry.io/issues/7383891047/
 * Some SES EventBridge events arrive without a `mail` object,
 * causing: TypeError: Cannot read properties of undefined (reading 'messageId')
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockSelectWhere, mockUpdateSet } = vi.hoisted(() => ({
  mockSelectWhere: vi.fn(),
  mockUpdateSet: vi.fn(),
}));

vi.mock("../lib/subscription-gate", () => ({
  hasActiveSubscription: vi.fn().mockResolvedValue(true),
}));

vi.mock("@wraps/db", () => {
  const makeWhereResult = (impl: () => unknown) => ({
    limit: vi.fn(() => impl()),
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock
    then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
      return Promise.resolve(impl()).then(resolve, reject);
    },
  });

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((...args: unknown[]) => {
            mockSelectWhere(...args);
            return makeWhereResult(
              () => mockSelectWhere.mock.results.at(-1)?.value ?? []
            );
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn((...args: unknown[]) => mockUpdateSet(...args)),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    },
    awsAccount: {
      id: "id",
      accountId: "account_id",
      webhookSecret: "webhook_secret",
      organizationId: "organization_id",
    },
    messageSend: {
      id: "id",
      messageId: "message_id",
      organizationId: "organization_id",
      status: "status",
      batchSendId: "batch_send_id",
      contactId: "contact_id",
      openedAt: "opened_at",
      clickedAt: "clicked_at",
      deliveredAt: "delivered_at",
      bouncedAt: "bounced_at",
      complainedAt: "complained_at",
    },
    batchSend: { id: "id" },
    contact: {
      id: "id",
      organizationId: "organization_id",
      email: "email",
      emailStatus: "email_status",
      emailHash: "email_hash",
    },
    workflowExecution: {
      id: "id",
      workflowId: "workflow_id",
      contactId: "contact_id",
      status: "status",
    },
    eq: vi.fn((col: unknown, val: unknown) => ({ col, val, op: "eq" })),
    and: vi.fn((...args: unknown[]) => ({ args, op: "and" })),
    sql: vi.fn(),
    inArray: vi.fn(),
  };
});

vi.mock("../lib/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../services/workflow-events", () => ({
  emitContactEvent: vi.fn().mockResolvedValue(undefined),
  checkSegmentEntry: vi.fn().mockResolvedValue({ workflowsTriggered: 0 }),
}));

// Import route after mocks
const { webhooksRoutes } = await import("../routes/webhooks");

function createApp() {
  return new Elysia().use(webhooksRoutes);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_WEBHOOK_SECRET = "a".repeat(64);
const AWS_ACCOUNT_NUMBER = "123456789012";

function mockAccountLookup() {
  mockSelectWhere.mockResolvedValueOnce([
    {
      id: "aws-acct-1",
      webhookSecret: VALID_WEBHOOK_SECRET,
      organizationId: "org-1",
    },
  ]);
}

function buildEventWithoutMail(eventType = "Delivery") {
  return {
    version: "0",
    id: "event-id-no-mail",
    "detail-type": "Email Delivery",
    source: "aws.ses",
    account: AWS_ACCOUNT_NUMBER,
    time: new Date().toISOString(),
    region: "us-east-1",
    detail: {
      eventType,
      // mail field intentionally omitted
    },
  };
}

function buildEventWithNullMail(eventType = "Delivery") {
  return {
    version: "0",
    id: "event-id-null-mail",
    "detail-type": "Email Delivery",
    source: "aws.ses",
    account: AWS_ACCOUNT_NUMBER,
    time: new Date().toISOString(),
    region: "us-east-1",
    detail: {
      eventType,
      mail: null,
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Webhook SES — missing mail field", () => {
  beforeEach(() => {
    mockSelectWhere.mockReset();
    mockUpdateSet.mockReset();
  });

  it("returns 200 with ignored status when mail is undefined", async () => {
    mockAccountLookup();

    const app = createApp();
    const response = await app.handle(
      new Request(`http://localhost/webhooks/ses/${AWS_ACCOUNT_NUMBER}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": VALID_WEBHOOK_SECRET,
        },
        body: JSON.stringify(buildEventWithoutMail()),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ignored");
    expect(body.reason).toContain("missing");
  });

  it("returns 200 with ignored status when mail is null", async () => {
    mockAccountLookup();

    const app = createApp();
    const response = await app.handle(
      new Request(`http://localhost/webhooks/ses/${AWS_ACCOUNT_NUMBER}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": VALID_WEBHOOK_SECRET,
        },
        body: JSON.stringify(buildEventWithNullMail()),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ignored");
    expect(body.reason).toContain("missing");
  });

  it("attempts no DB writes at all when mail is missing — not even the liveness stamp", async () => {
    mockAccountLookup();

    const app = createApp();
    await app.handle(
      new Request(`http://localhost/webhooks/ses/${AWS_ACCOUNT_NUMBER}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": VALID_WEBHOOK_SECRET,
        },
        body: JSON.stringify(buildEventWithoutMail()),
      })
    );

    // Only one select call (account lookup), no message lookups.
    expect(mockSelectWhere).toHaveBeenCalledTimes(1);
    // And no last_event_received_at stamp: every consumer reads that column
    // as "a usable SES event arrived", and a payload without mail.messageId
    // is not one — real SES events, SDK-sender ones included, always carry
    // it. Stamping here once let a single malformed POST promote a
    // never-connected account past the staleness worker's never-connected
    // gate and into a false "feed stalled" alert (SHC, 2026-08-25).
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });
});
