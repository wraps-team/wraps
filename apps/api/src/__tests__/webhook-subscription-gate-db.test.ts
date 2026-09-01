/**
 * Webhook Subscription Gate Tests (real DB)
 *
 * The SES webhook materializes a `message_send` row for every SDK send it sees
 * (routes/webhooks.ts). That is the only reason a direct-SES customer costs us
 * storage at all — we are not in their send path, so we cannot and do not stop
 * their mail. What we can stop is ingesting events for an org whose
 * subscription has lapsed.
 *
 * Found in production 2026-09-01: an org whose `scale` subscription was
 * canceled on 2026-08-22 kept ingesting ~22K events/day with no change in
 * volume, because sends are unlimited on every plan and nothing gated on
 * subscription status.
 *
 * The gate keys off "no active/trialing subscription row", NOT off the plan
 * being `free` — free-tier orgs carry an active `free` subscription and must
 * keep working. See extractPlan() in middleware/auth.ts, where the same
 * distinction produces planId === null.
 *
 * Only true boundaries are mocked (SQS, activation tracking). `@wraps/db` is
 * REAL — the subscription lookup under test runs against Neon.
 */

import { db, eq, messageSend, subscription } from "@wraps/db";
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
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { hasActiveSubscription } from "../lib/subscription-gate";
import { buildDeliveryEvent } from "./fixtures/ses-events";

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: vi.fn().mockResolvedValue(undefined),
}));

const { webhooksRoutes } = await import("../routes/webhooks");

const TEST_PREFIX = "wh-subgate-db";

let fixture: BaseOrgFixture;

function postDelivery(messageId: string) {
  const event = buildDeliveryEvent({
    mail: { messageId, destination: [`${TEST_PREFIX}@example.com`] },
  });
  return new Elysia().use(webhooksRoutes).handle(
    new Request(`http://localhost/webhooks/ses/${fixture.accountNumber}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wraps-api-key": fixture.secret,
      },
      body: JSON.stringify(event),
    })
  );
}

async function setSubscriptionStatus(status: string) {
  await db
    .update(subscription)
    .set({ status })
    .where(eq(subscription.id, fixture.ids.subscription));
}

async function rowFor(messageId: string) {
  const [row] = await db
    .select({ id: messageSend.id, status: messageSend.status })
    .from(messageSend)
    .where(eq(messageSend.messageId, messageId))
    .limit(1);
  return row;
}

beforeAll(async () => {
  fixture = await seedBaseOrg(TEST_PREFIX);
});

afterAll(async () => {
  await cleanupBaseOrg(TEST_PREFIX);
});

beforeEach(async () => {
  await clearWorkflowState(fixture.ids.org);
  await setSubscriptionStatus("active");
});

describe("SES webhook — subscription gate", () => {
  it("ingests the event and materializes a row for an active subscription", async () => {
    const messageId = `${TEST_PREFIX}-active-${Date.now()}`;

    const res = await postDelivery(messageId);
    const body = (await res.json()) as { status?: string; reason?: string };

    // An SDK send has no pre-existing row, so the route reports "message not
    // found" and materializes one. That is the pass case — what matters is
    // that it is not the gate's "no active subscription", and that a row lands.
    expect(body.reason).not.toBe("no active subscription");
    const row = await rowFor(messageId);
    expect(row).toBeDefined();
    expect(row?.status).toBe("delivered");
  });

  it("drops the event and writes no row when the subscription is canceled", async () => {
    await setSubscriptionStatus("canceled");
    const messageId = `${TEST_PREFIX}-canceled-${Date.now()}`;

    const res = await postDelivery(messageId);
    const body = (await res.json()) as { status?: string; reason?: string };

    expect(body.status).toBe("ignored");
    expect(body.reason).toBe("no active subscription");
    expect(await rowFor(messageId)).toBeUndefined();
  });

  it("returns 200 on a drop so EventBridge does not retry a permanent condition", async () => {
    await setSubscriptionStatus("canceled");

    const res = await postDelivery(`${TEST_PREFIX}-noretry-${Date.now()}`);

    expect(res.status).toBe(200);
  });

  it("keeps ingesting for a free-tier org — the gate is subscription status, not plan", async () => {
    // Free orgs carry an active `free` subscription; only a lapsed org is gated.
    await db
      .update(subscription)
      .set({ plan: "free", status: "active" })
      .where(eq(subscription.id, fixture.ids.subscription));
    const messageId = `${TEST_PREFIX}-free-${Date.now()}`;

    await postDelivery(messageId);

    expect(await rowFor(messageId)).toBeDefined();
  });

  it("fails OPEN when the subscription lookup itself errors", async () => {
    // Matches enforceEventLimit's posture (middleware/event-limit.ts). The
    // gate runs outside the route's try blocks, so a throw would surface as a
    // 500 and EventBridge would retry-then-DLQ real delivery events. Losing a
    // paying customer's events to a DB blip is far worse than briefly
    // ingesting for a lapsed org.
    //
    // Asserted on the unit rather than through the route: the route's first
    // db.select is the AWS-account auth lookup, so failing "the next select"
    // would test the wrong query and still 500 for an unrelated reason.
    const spy = vi.spyOn(db, "select").mockImplementation(() => {
      throw new Error("connection terminated unexpectedly");
    });

    try {
      await expect(hasActiveSubscription(fixture.ids.org)).resolves.toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("still ingests while a subscription is trialing", async () => {
    await setSubscriptionStatus("trialing");
    const messageId = `${TEST_PREFIX}-trial-${Date.now()}`;

    await postDelivery(messageId);

    expect(await rowFor(messageId)).toBeDefined();
  });
});
