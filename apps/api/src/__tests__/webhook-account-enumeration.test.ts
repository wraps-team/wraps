/**
 * Webhook — Account Enumeration Prevention
 *
 * Verifies that the webhook endpoint returns 401 (not 404) when an
 * AWS account is not found, preventing account existence enumeration.
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("Webhook — account enumeration prevention", () => {
  beforeEach(() => {
    mockSelectWhere.mockReset();
  });

  it("returns 401 (not 404) when AWS account is not found", async () => {
    // Account lookup returns empty — account doesn't exist
    mockSelectWhere.mockResolvedValueOnce([]);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/webhooks/ses/999999999999", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": "some-api-key",
        },
        body: JSON.stringify({
          version: "0",
          id: "evt-1",
          "detail-type": "Email Delivery",
          source: "aws.ses",
          account: "999999999999",
          time: new Date().toISOString(),
          region: "us-east-1",
          detail: {
            eventType: "Delivery",
            mail: { messageId: "msg-1" },
          },
        }),
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    // Must NOT reveal whether the account exists
    expect(body.error).not.toContain("not found");
    expect(body.error).not.toContain("account");
  });

  it("returns same 401 for invalid API key and missing account", async () => {
    // Account exists but wrong key
    mockSelectWhere.mockResolvedValueOnce([
      {
        id: "aws-1",
        webhookSecret: "correct-secret-key-1234567890",
        organizationId: "org-1",
      },
    ]);

    const app = createApp();
    const wrongKeyResponse = await app.handle(
      new Request("http://localhost/webhooks/ses/123456789012", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": "wrong-key",
        },
        body: JSON.stringify({
          version: "0",
          id: "evt-2",
          "detail-type": "Email Delivery",
          source: "aws.ses",
          account: "123456789012",
          time: new Date().toISOString(),
          region: "us-east-1",
          detail: {
            eventType: "Delivery",
            mail: { messageId: "msg-2" },
          },
        }),
      })
    );

    // Account doesn't exist
    mockSelectWhere.mockResolvedValueOnce([]);
    const noAccountResponse = await app.handle(
      new Request("http://localhost/webhooks/ses/999999999999", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wraps-api-key": "any-key",
        },
        body: JSON.stringify({
          version: "0",
          id: "evt-3",
          "detail-type": "Email Delivery",
          source: "aws.ses",
          account: "999999999999",
          time: new Date().toISOString(),
          region: "us-east-1",
          detail: {
            eventType: "Delivery",
            mail: { messageId: "msg-3" },
          },
        }),
      })
    );

    // Both should return 401 with identical error structure
    expect(wrongKeyResponse.status).toBe(401);
    expect(noAccountResponse.status).toBe(401);

    const wrongKeyBody = await wrongKeyResponse.json();
    const noAccountBody = await noAccountResponse.json();
    expect(wrongKeyBody.error).toBe(noAccountBody.error);
  });
});
