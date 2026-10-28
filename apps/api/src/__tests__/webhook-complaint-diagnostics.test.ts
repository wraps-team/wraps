/**
 * Webhook Complaint Diagnostics Tests (mocked db)
 *
 * A Complaint records the normalised complaint feedback type in
 * message_send_diagnostic. A complaint with no feedback type still writes a
 * recorded marker, with feedback_type null.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildComplaintEvent } from "./fixtures/ses-events";

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
const { Elysia } = await import("elysia");
const { messageSendDiagnostic } = await import("@wraps/db");

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

let diagnosticUpserts: Array<{
  values: Record<string, unknown>;
  config: { set: Record<string, unknown> };
}>;

function setupMocks() {
  diagnosticUpserts = [];
  const message = {
    id: "msg-send-1",
    status: "sent",
    batchSendId: null,
    contactId: null,
    openedAt: null,
    clickedAt: null,
    recipient: "user@example.com",
  };

  let selectCalls = 0;
  mockDbSelect.mockImplementation(() => {
    selectCalls++;
    return selectChain(selectCalls % 2 === 1 ? [mockAwsAccount] : [message]);
  });

  mockDbUpdate.mockImplementation(() => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(
        Object.assign(Promise.resolve(undefined), {
          returning: vi.fn().mockResolvedValue([{ id: "msg-send-1" }]),
        })
      ),
    }),
  }));

  mockDbInsert.mockImplementation((table: unknown) => ({
    values: (row: Record<string, unknown>) => ({
      onConflictDoUpdate: (config: { set: Record<string, unknown> }) => {
        if (table === messageSendDiagnostic) {
          diagnosticUpserts.push({ values: row, config });
        }
        return Promise.resolve(undefined);
      },
      onConflictDoNothing: () => ({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  }));
}

describe("Webhook: Complaint diagnostics", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    setupMocks();
  });

  it("webhook persists complaint feedback type on Complaint", async () => {
    const response = await sendWebhookEvent(
      app,
      buildComplaintEvent({ complaintFeedbackType: "abuse" })
    );

    expect(response.status).toBe(200);
    expect(diagnosticUpserts).toHaveLength(1);
    expect(diagnosticUpserts[0].values).toEqual({
      messageSendId: "msg-send-1",
      organizationId: "org-1",
      eventType: "complaint",
      enhancedStatus: null,
      diagnosticCode: null,
      reasonKey: null,
      feedbackType: "abuse",
    });
  });

  it("complaint without feedback type writes a recorded marker with null feedback_type", async () => {
    const event = buildComplaintEvent({});
    const { complaintFeedbackType: _omitted, ...complaint } =
      event.detail.complaint;
    const withoutType = {
      ...event,
      detail: { ...event.detail, complaint },
    };

    const response = await sendWebhookEvent(app, withoutType);

    expect(response.status).toBe(200);
    expect(diagnosticUpserts).toHaveLength(1);
    expect(diagnosticUpserts[0].values).toEqual(
      expect.objectContaining({
        eventType: "complaint",
        feedbackType: null,
      })
    );
  });

  it("unknown well-formed feedback type is stored lower-cased", async () => {
    const response = await sendWebhookEvent(
      app,
      buildComplaintEvent({ complaintFeedbackType: "X-Vendor-Report" })
    );

    expect(response.status).toBe(200);
    expect(diagnosticUpserts[0].values.feedbackType).toBe("x-vendor-report");
  });

  it("invalid feedback type is stored as null", async () => {
    const response = await sendWebhookEvent(
      app,
      buildComplaintEvent({ complaintFeedbackType: "bad type!" })
    );

    expect(response.status).toBe(200);
    expect(diagnosticUpserts[0].values.feedbackType).toBeNull();
  });
});
