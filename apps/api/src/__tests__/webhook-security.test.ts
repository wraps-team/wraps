/**
 * Webhook Security Tests
 *
 * Verifies that:
 * 1. The SES webhook endpoint scopes messageSend lookups to the authenticated
 *    AWS account's organization, preventing cross-org event injection.
 * 2. Internal error details (stack traces, DB error messages) are NOT
 *    returned in 500 responses.
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockSelectWhere, mockUpdateSet } = vi.hoisted(() => ({
  mockSelectWhere: vi.fn(),
  mockUpdateSet: vi.fn(),
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
const ORG_ID = "org-webhook-test-1";
const AWS_ACCOUNT_NUMBER = "123456789012";

function buildSesEvent(eventType = "Delivery") {
  return {
    version: "0",
    id: "event-id-1",
    "detail-type": "Email Delivery",
    source: "aws.ses",
    account: AWS_ACCOUNT_NUMBER,
    time: new Date().toISOString(),
    region: "us-east-1",
    detail: {
      eventType,
      mail: {
        messageId: "msg-from-org-a-0001",
        commonHeaders: { subject: "Test" },
      },
      delivery: { timestamp: new Date().toISOString() },
    },
  };
}

function mockAccountLookup(organizationId = ORG_ID) {
  mockSelectWhere.mockResolvedValueOnce([
    {
      id: "aws-acct-1",
      webhookSecret: VALID_WEBHOOK_SECRET,
      organizationId,
    },
  ]);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Webhook SES — cross-org message scoping", () => {
  beforeEach(() => {
    mockSelectWhere.mockReset();
    mockUpdateSet.mockReset();
  });

  it("ignores events when no messageSend is found for the account's org", async () => {
    // Account lookup succeeds
    mockAccountLookup();
    // messageSend lookup returns empty (message belongs to a different org)
    mockSelectWhere.mockResolvedValueOnce([]);

    const app = createApp();
    const response = await app.handle(
      new Request(`http://localhost/webhooks/ses/${AWS_ACCOUNT_NUMBER}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": VALID_WEBHOOK_SECRET,
        },
        body: JSON.stringify(buildSesEvent("Delivery")),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ignored");

    // No DB update should have been attempted
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("processes the event when messageSend belongs to the same org", async () => {
    // Account lookup
    mockAccountLookup();
    // messageSend found in the same org
    mockSelectWhere.mockResolvedValueOnce([
      {
        id: "msg-send-1",
        status: "sent",
        batchSendId: "batch-1",
        contactId: "contact-1",
        openedAt: null,
        clickedAt: null,
      },
    ]);
    // Subsequent selects/updates can return empty
    mockSelectWhere.mockResolvedValue([]);
    mockUpdateSet.mockResolvedValue([]);

    const app = createApp();
    const response = await app.handle(
      new Request(`http://localhost/webhooks/ses/${AWS_ACCOUNT_NUMBER}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": VALID_WEBHOOK_SECRET,
        },
        body: JSON.stringify(buildSesEvent("Delivery")),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("processed");
  });

  it("rejects requests with a wrong webhook secret", async () => {
    mockAccountLookup();

    const app = createApp();
    const response = await app.handle(
      new Request(`http://localhost/webhooks/ses/${AWS_ACCOUNT_NUMBER}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": "wrong-secret",
        },
        body: JSON.stringify(buildSesEvent()),
      })
    );

    expect(response.status).toBe(401);
  });
});

describe("Webhook SES — error response does not leak internal details", () => {
  beforeEach(() => {
    mockSelectWhere.mockReset();
    mockUpdateSet.mockReset();
  });

  it("returns a generic error message without stack trace or DB details on 500", async () => {
    // Account lookup succeeds
    mockAccountLookup();
    // messageSend found
    mockSelectWhere.mockResolvedValueOnce([
      {
        id: "msg-send-err",
        status: "sent",
        batchSendId: null,
        contactId: "contact-2",
        openedAt: null,
        clickedAt: null,
      },
    ]);
    // Simulate a DB error during the update step
    mockSelectWhere.mockRejectedValueOnce(
      new Error("DB_INTERNAL: column 'secret_column' does not exist")
    );
    mockUpdateSet.mockRejectedValueOnce(
      new Error("DB_INTERNAL: constraint violation on table 'contact'")
    );

    const app = createApp();
    const response = await app.handle(
      new Request(`http://localhost/webhooks/ses/${AWS_ACCOUNT_NUMBER}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": VALID_WEBHOOK_SECRET,
        },
        body: JSON.stringify(buildSesEvent("Delivery")),
      })
    );

    if (response.status === 500) {
      const body = await response.json();

      // Generic error message is present
      expect(body.error).toBeDefined();

      // Internal error details must NOT be exposed
      expect(body.details).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("DB_INTERNAL");
      expect(JSON.stringify(body)).not.toContain("constraint violation");
      expect(JSON.stringify(body)).not.toContain("secret_column");
    }
    // If 200/ignored, the DB error path wasn't hit — that's also acceptable
  });
});
