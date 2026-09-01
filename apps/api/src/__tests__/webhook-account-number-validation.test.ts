/**
 * Webhook — AWS Account Number Format Validation (BUG-003)
 *
 * Verifies that the awsAccountNumber path param is validated to be
 * exactly 12 numeric digits. Empty, non-numeric, or short strings
 * must be rejected before any handler logic runs.
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockSelectWhere } = vi.hoisted(() => ({
  mockSelectWhere: vi.fn(),
}));

vi.mock("../lib/subscription-gate", () => ({
  hasActiveSubscription: vi.fn().mockResolvedValue(true),
}));

vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((...args: unknown[]) => {
          // .where() result is BOTH awaitable (the account lookup awaits it
          // directly, no .limit()) and .limit()-capable (other lookups use
          // .limit(1)).
          const rows = Promise.resolve(mockSelectWhere(...args)).then(
            (value) => value ?? []
          );
          return Object.assign(rows, {
            limit: vi.fn(() => rows),
          });
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
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
  },
  batchSend: { id: "id" },
  contact: { id: "id" },
  workflowExecution: { id: "id" },
  workflow: { id: "id" },
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn(),
  deleteScheduledStep: vi.fn(),
}));

const { webhooksRoutes } = await import("../routes/webhooks");

function createApp() {
  return new Elysia().use(webhooksRoutes);
}

const VALID_BODY = JSON.stringify({
  version: "0",
  id: "evt-1",
  "detail-type": "Email Delivery",
  source: "aws.ses",
  account: "123456789012",
  time: new Date().toISOString(),
  region: "us-east-1",
  detail: {
    eventType: "Delivery",
    mail: { messageId: "msg-1" },
  },
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Webhook — AWS account number format validation (BUG-003)", () => {
  beforeEach(() => {
    mockSelectWhere.mockReset();
  });

  it("rejects an empty string account number", async () => {
    const app = createApp();
    // Empty path segment collapses to the parent route — use a space or
    // double-slash variant that still produces an empty param value.
    // Elysia maps "/webhooks/ses/" (trailing slash) to the route with
    // awsAccountNumber = "" when the param is present but empty.
    const response = await app.handle(
      new Request("http://localhost/webhooks/ses/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wraps-api-key": "k" },
        body: VALID_BODY,
      })
    );

    // Empty path segment = no route match (404) or schema validation (422)
    expect(response.status === 404 || response.status === 422).toBe(true);
  });

  it("rejects a non-numeric account number (letters)", async () => {
    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/webhooks/ses/abcdefghijkl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": "any-key",
        },
        body: VALID_BODY,
      })
    );

    expect(response.status).toBe(422);
  });

  it("rejects an account number shorter than 12 digits", async () => {
    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/webhooks/ses/12345", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": "any-key",
        },
        body: VALID_BODY,
      })
    );

    expect(response.status).toBe(422);
  });

  it("rejects an account number with mixed alphanumeric characters", async () => {
    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/webhooks/ses/1234abc89012", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": "any-key",
        },
        body: VALID_BODY,
      })
    );

    expect(response.status).toBe(422);
  });

  it("accepts a valid 12-digit numeric account number and reaches auth logic", async () => {
    // Account lookup returns empty — authentication will fail with 401,
    // which proves validation passed and handler logic was reached.
    mockSelectWhere.mockResolvedValueOnce([]);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/webhooks/ses/123456789012", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": "any-key",
        },
        body: VALID_BODY,
      })
    );

    // 401 means validation passed and handler logic ran (auth rejected it)
    expect(response.status).toBe(401);
  });
});
