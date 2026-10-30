/**
 * Webhook send-failure alert — once per episode per reason (real DB)
 *
 * `notifySendFailures` (routes/webhooks.ts) used to alert once per org per
 * 24h on any Reject or Rendering Failure, with no reason in the dedupe key:
 * a reject storm re-alerted every day it lasted, and a rendering failure in
 * the same 24h as a reject was never reported at all. It now alerts once per
 * episode per reason, where an episode is a run of failures with no gap
 * longer than 24h, read off the failed `message_send` rows themselves.
 *
 * `notifyOrg` is mocked so the calls can be counted; that also means no
 * notification row is written, so the 24h notification floor never trips
 * here and every case exercises the message_send episode check. Everything
 * else (`@wraps/db`, the route, the message_send writes) is real.
 */

import { db, messageSend } from "@wraps/db";
import { Elysia } from "elysia";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  type BaseOrgFixture,
  cleanupBaseOrg,
  clearWorkflowState,
  messageSendRow,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import {
  buildRejectEvent,
  buildRenderingFailureEvent,
} from "./fixtures/ses-events";

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: vi.fn().mockResolvedValue(undefined),
}));

const mockNotifyOrg = vi.fn().mockResolvedValue([]);
vi.mock("@wraps/auth/notify", () => ({
  notifyOrg: (...args: unknown[]) => mockNotifyOrg(...args),
}));

const { webhooksRoutes } = await import("../routes/webhooks");

const TEST_PREFIX = "wh-send-fail-db";
const HOUR_MS = 60 * 60 * 1000;

let fixture: BaseOrgFixture;

function post(event: unknown) {
  return new Elysia().use(webhooksRoutes).handle(
    new Request(`http://localhost/webhooks/ses/${fixture.accountNumber}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wraps-api-key": fixture.secret,
      },
      body: JSON.stringify(event),
    })
  );
}

async function seedMessage(
  name: string,
  overrides: Partial<typeof messageSend.$inferInsert> = {}
) {
  const messageId = `${TEST_PREFIX}-mid-${name}`;
  await db.insert(messageSend).values(
    messageSendRow(fixture.ids, {
      id: `${TEST_PREFIX}-msg-${name}`,
      messageId,
      ...overrides,
    })
  );
  return messageId;
}

const reject = (messageId: string) =>
  post(buildRejectEvent({ mail: { messageId } }));

const renderingFailure = (messageId: string) =>
  post(buildRenderingFailureEvent({ mail: { messageId } }));

const notifiedReasons = () =>
  mockNotifyOrg.mock.calls
    .filter((call) => call[0].type === "ses.send_failures")
    .map((call) => call[0].data.reason as string);

describe("webhook ses.send_failures alerts once per episode (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearWorkflowState(fixture.ids.org, fixture.ids.otherOrg);
  });

  afterAll(async () => {
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("alerts on the first reject", async () => {
    const messageId = await seedMessage("first");

    expect((await reject(messageId)).status).toBe(200);

    expect(notifiedReasons()).toEqual(["reject"]);
  });

  it("stays quiet for later rejects in the same episode", async () => {
    const first = await seedMessage("a", {
      sentAt: new Date(Date.now() - 2 * HOUR_MS),
    });
    const second = await seedMessage("b", {
      sentAt: new Date(Date.now() - HOUR_MS),
    });
    const third = await seedMessage("c");

    await reject(first);
    await reject(second);
    await reject(third);

    expect(notifiedReasons()).toEqual(["reject"]);
  });

  it("alerts a rendering failure even inside a reject episode", async () => {
    // Different reasons are different problems with different fixes.
    const rejected = await seedMessage("rejected", {
      sentAt: new Date(Date.now() - HOUR_MS),
    });
    const unrendered = await seedMessage("unrendered");

    await reject(rejected);
    await renderingFailure(unrendered);

    expect(notifiedReasons()).toEqual(["reject", "rendering_failure"]);
  });

  it("starts a new episode after a quiet gap longer than 24h", async () => {
    await seedMessage("old", {
      sentAt: new Date(Date.now() - 30 * HOUR_MS),
      status: "failed",
      error: "Rejected by SES",
    });
    const fresh = await seedMessage("fresh");

    await reject(fresh);

    expect(notifiedReasons()).toEqual(["reject"]);
  });

  it("does not let a later-sent failure hide the first one in an episode", async () => {
    // Events can arrive out of order: the later send was already marked
    // failed when the earlier one's event lands. Only earlier sends count.
    await seedMessage("later", {
      sentAt: new Date(Date.now() - HOUR_MS),
      status: "failed",
      error: "Rejected by SES",
    });
    const earlierSend = await seedMessage("earlier", {
      sentAt: new Date(Date.now() - 2 * HOUR_MS),
    });

    await reject(earlierSend);

    expect(notifiedReasons()).toEqual(["reject"]);
  });
});
