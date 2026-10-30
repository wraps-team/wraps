/**
 * Batch Sender — Reputation Pause (real DB)
 *
 * A running broadcast must pause, not keep sending, once the hourly
 * account-health sweep (plan 205) has persisted a fresh `in_danger` verdict
 * on the sending account. `batch-sender.ts` already has two pause branches
 * (`quota_reserve`, `daily_quota`) built on the same `pausedReason` column,
 * the same 900s re-enqueue of the unchanged chunk, and the same clear site;
 * this plan adds a third, gated on `aws_account.healthStatus` instead of a
 * quota calculation.
 *
 * BEHAVIOR under test (survives the eventual fix — asserts outcomes, not
 * code):
 *   A fresh `in_danger` verdict pauses the chain: zero SES sends, zero
 *   `messageSend` claims, the same chunk re-enqueued at a 900s SQS delay, and
 *   a deduplicated org notification. `healthy`, `at_risk`, a NULL (never
 *   swept) verdict, and a stale `in_danger` verdict must all fail OPEN.
 *   Recovery (verdict no longer `in_danger`) clears the pause on the next
 *   cycle via the existing clear site.
 *
 * Boundary mocks only:
 *   - SES SDK client → GetAccount returns a fixed rate; SendBulkEmail always
 *     succeeds (system boundary)
 *   - SQS client → records outgoing messages instead of touching AWS
 *   - getCredentials → fake STS creds (system boundary)
 *   - activation-tracking → no-op (analytics side-effect boundary / PostHog)
 * No internal function of batch-sender is mocked; `aws_account.healthStatus`
 * is read through the real DB.
 *
 * Pattern: beforeAll seed → beforeEach reset → afterAll cleanup.
 * TEST_PREFIX: bs-reputation-pause-db (unique across all *-db.test.ts files)
 */

import {
  and,
  awsAccount,
  batchSend,
  contact,
  db,
  eq,
  messageSend,
  notification,
  template,
} from "@wraps/db";
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

const TEST_PREFIX = "bs-reputation-pause-db";
const BATCH_ID = `${TEST_PREFIX}-batch`;
const TEMPLATE_ID = `${TEST_PREFIX}-template`;
const CONTACT_IDS = [
  `${TEST_PREFIX}-c1`,
  `${TEST_PREFIX}-c2`,
  `${TEST_PREFIX}-c3`,
];

// ─────────────────────────────────────────────────────────────────────────────
// Hoisted recorders — shared with the vi.mock factories below.
// ─────────────────────────────────────────────────────────────────────────────
const sesState = vi.hoisted(() => ({
  bulkSendCalls: [] as string[][],
  messageIdCounter: 0,
}));
const sqsState = vi.hoisted(() => ({
  sendCalls: [] as Array<{ MessageBody: string; DelaySeconds?: number }>,
}));

// SES SDK boundary: fixed rate limit, accept every bulk send.
vi.mock("@aws-sdk/client-sesv2", () => {
  class GetAccountCommand {
    input: unknown;
    readonly __type = "GetAccount";
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class SendBulkEmailCommand {
    input: {
      BulkEmailEntries?: Array<{ Destination?: { ToAddresses?: string[] } }>;
    };
    readonly __type = "SendBulkEmail";
    constructor(input: {
      BulkEmailEntries?: Array<{ Destination?: { ToAddresses?: string[] } }>;
    }) {
      this.input = input;
    }
  }
  class SESv2Client {
    // biome-ignore lint/suspicious/noExplicitAny: test double
    async send(command: any) {
      if (command?.__type === "GetAccount") {
        return { SendQuota: { MaxSendRate: 14 } };
      }
      if (command?.__type === "SendBulkEmail") {
        const entries = command.input?.BulkEmailEntries ?? [];
        sesState.bulkSendCalls.push(
          entries.map(
            (e: { Destination?: { ToAddresses?: string[] } }) =>
              e.Destination?.ToAddresses?.[0] ?? ""
          )
        );
        return {
          BulkEmailEntryResults: entries.map(() => ({
            Status: "SUCCESS",
            MessageId: `${TEST_PREFIX}-ses-${sesState.messageIdCounter++}`,
          })),
        };
      }
      return {};
    }
  }
  return { SESv2Client, GetAccountCommand, SendBulkEmailCommand };
});

// SQS boundary: record what would have been enqueued instead of touching AWS.
vi.mock("@aws-sdk/client-sqs", () => {
  class SendMessageCommand {
    input: { MessageBody: string; DelaySeconds?: number };
    constructor(input: { MessageBody: string; DelaySeconds?: number }) {
      this.input = input;
    }
  }
  class SQSClient {
    // biome-ignore lint/suspicious/noExplicitAny: test double
    async send(command: any) {
      sqsState.sendCalls.push(command.input);
      return {};
    }
  }
  return { SQSClient, SendMessageCommand };
});

// Email-send boundary: raw-HTML path is unused by this test (the template has
// an sesTemplateName), but mock it anyway so an accidental path change fails
// loudly rather than hitting AWS.
vi.mock("@wraps/email-send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wraps/email-send")>();
  return {
    ...actual,
    sendEmail: vi.fn(async () => {
      throw new Error("reputation-pause test expected the SES-template path");
    }),
  };
});

// Credentials boundary: fake STS assume-role result.
vi.mock("../services/credentials", () => ({
  getCredentials: vi.fn(async () => ({
    accessKeyId: "AKIA-test",
    secretAccessKey: "secret",
    sessionToken: "token",
    expiration: new Date(Date.now() + 3_600_000),
    region: "us-east-1",
  })),
}));

// Analytics boundary: PostHog / platform emit — irrelevant to this behavior.
vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailSent: vi.fn(async () => {}),
}));

let fixture: BaseOrgFixture;
// biome-ignore lint/suspicious/noExplicitAny: SQSHandler loaded via dynamic import
let handler: any;

// ─────────────────────────────────────────────────────────────────────────────
// healthDetail is a 12-field required shape — copied verbatim from
// account-health-api-db.test.ts:95-114 (out of scope; read-only) so this test
// cannot drift from the schema.
// ─────────────────────────────────────────────────────────────────────────────
type HealthDetailShape = NonNullable<
  typeof awsAccount.$inferSelect.healthDetail
>;

function detail(overrides: Partial<HealthDetailShape> = {}): HealthDetailShape {
  return {
    bounceRate: null,
    complaintRate: null,
    quotaUsedRatio: null,
    sendingEnabled: null,
    enforcementStatus: null,
    productionAccessEnabled: null,
    reviewStatus: null,
    reviewCaseId: null,
    max24HourSend: null,
    sentLast24Hours: null,
    maxSendRate: null,
    reasons: [],
    ...overrides,
  };
}

async function setVerdict(
  status: "healthy" | "at_risk" | "in_danger" | null,
  checkedAt: Date | null,
  reasons: string[] = []
): Promise<void> {
  await db
    .update(awsAccount)
    .set({
      healthStatus: status,
      healthCheckedAt: checkedAt,
      healthDetail: status === null ? null : detail({ reasons }),
    })
    .where(
      and(
        eq(awsAccount.id, fixture.ids.awsAccount),
        eq(awsAccount.organizationId, fixture.ids.org)
      )
    );
}

async function resetBatch(): Promise<void> {
  await db
    .update(batchSend)
    .set({
      status: "processing",
      totalRecipients: CONTACT_IDS.length,
      processedRecipients: 0,
      sent: 0,
      failed: 0,
      delivered: 0,
      startedAt: null,
      completedAt: null,
      audienceSnapshotAt: null,
      lastChunkIndex: null,
      lastCursor: null,
      pausedReason: null,
      pausedAt: null,
      errorMessage: null,
      errorDetails: null,
    })
    .where(eq(batchSend.id, BATCH_ID));
}

async function runWorker(chunkIndex = 0): Promise<void> {
  const job = {
    batchId: BATCH_ID,
    organizationId: fixture.ids.org,
    awsAccountId: fixture.ids.awsAccount,
    channel: "email",
    chunkIndex,
  };
  const event = {
    Records: [
      {
        body: JSON.stringify(job),
        attributes: { ApproximateReceiveCount: "1" },
      },
    ],
  };
  const context = { getRemainingTimeInMillis: () => 300_000 };
  await handler(event, context, () => {
    // noop callback
  });
}

async function loadBatch() {
  const [row] = await db
    .select()
    .from(batchSend)
    .where(eq(batchSend.id, BATCH_ID));
  return row;
}

async function loadReputationNotifications() {
  return db
    .select()
    .from(notification)
    .where(
      and(
        eq(notification.organizationId, fixture.ids.org),
        eq(notification.type, "broadcast.reputation_paused")
      )
    );
}

async function countMessageSendRows() {
  const rows = await db
    .select({ contactId: messageSend.contactId })
    .from(messageSend)
    .where(eq(messageSend.batchSendId, BATCH_ID));
  return rows.length;
}

beforeAll(async () => {
  // Point the worker's module-scoped QUEUE_URL at a dummy before importing it.
  process.env.BATCH_QUEUE_URL = "https://sqs.test.local/queue";
  // Recipient-facing link bases have no platform fallback — the worker throws
  // unless the deployment configures its own URLs.
  process.env.API_BASE_URL = "https://api.test.local";

  fixture = await seedBaseOrg(TEST_PREFIX);
  const orgId = fixture.ids.org;
  const now = new Date();

  // Remove the fixture's base contact so getContactsChunk / the audience
  // snapshot recount return ONLY our three deterministic recipients.
  await db.delete(contact).where(eq(contact.organizationId, orgId));

  await db
    .insert(contact)
    .values(
      CONTACT_IDS.map((id, i) => ({
        id,
        organizationId: orgId,
        email: `${id}@example.com`,
        emailHash: `${TEST_PREFIX}-hash-${i}`,
        firstName: `Recipient${i}`,
        emailStatus: "active",
        status: "active",
        createdAt: now,
        updatedAt: now,
      })) as (typeof contact.$inferInsert)[]
    )
    .onConflictDoNothing();

  // SES-template path is selected when the template has a sesTemplateName.
  await db
    .insert(template)
    .values({
      id: TEMPLATE_ID,
      organizationId: orgId,
      name: "Reputation Pause Test Template",
      content: {},
      channel: "email",
      emailType: "transactional",
      compiledHtml: "<p>Hello</p>",
      sesTemplateName: `${TEST_PREFIX}-ses-template`,
      status: "PUBLISHED",
      createdAt: now,
      updatedAt: now,
    } as typeof template.$inferInsert)
    .onConflictDoNothing();

  await db
    .insert(batchSend)
    .values({
      id: BATCH_ID,
      organizationId: orgId,
      awsAccountId: fixture.ids.awsAccount,
      channel: "email",
      status: "processing",
      subject: "Reputation pause test",
      from: `${TEST_PREFIX}-sender@example.com`,
      fromName: "Reputation Pause Test",
      emailTemplateId: TEMPLATE_ID,
      audienceType: "all",
      totalRecipients: CONTACT_IDS.length,
    } as typeof batchSend.$inferInsert)
    .onConflictDoNothing();

  const mod = await import("../workers/batch-sender");
  handler = mod.handler;
});

beforeEach(async () => {
  await clearWorkflowState(fixture.ids.org);
  await db.delete(messageSend).where(eq(messageSend.batchSendId, BATCH_ID));
  await db
    .delete(notification)
    .where(eq(notification.organizationId, fixture.ids.org));
  await resetBatch();
  sesState.bulkSendCalls = [];
  sesState.messageIdCounter = 0;
  sqsState.sendCalls = [];
});

afterAll(async () => {
  await db.delete(batchSend).where(eq(batchSend.id, BATCH_ID));
  await db.delete(template).where(eq(template.id, TEMPLATE_ID));
  await cleanupBaseOrg(TEST_PREFIX);
});

describe("Batch sender reputation pause (real DB)", () => {
  it("fresh in_danger pauses and sends nothing", async () => {
    await setVerdict("in_danger", new Date(), [
      "bounce_pause",
      "bounce_review",
    ]);

    await runWorker(0);

    expect(sesState.bulkSendCalls).toHaveLength(0);

    const batch = await loadBatch();
    expect(batch.pausedReason).toBe("reputation");
    expect(batch.status).toBe("processing");
    expect(batch.pausedAt).not.toBeNull();
    expect(Date.now() - (batch.pausedAt as Date).getTime()).toBeLessThan(
      60_000
    );

    expect(await countMessageSendRows()).toBe(0);

    expect(sqsState.sendCalls).toHaveLength(1);
    expect(sqsState.sendCalls[0].DelaySeconds).toBe(900);
    const requeued = JSON.parse(sqsState.sendCalls[0].MessageBody);
    expect(requeued.chunkIndex).toBe(0);

    const notifications = await loadReputationNotifications();
    expect(notifications).toHaveLength(1);
    expect(
      (notifications[0].data as { batchId?: string } | null)?.batchId
    ).toBe(BATCH_ID);
    expect(notifications[0].body).toContain("10% pause line");
    expect(notifications[0].body).not.toContain("review");
  });

  it("second cycle while still paused does not duplicate the notification", async () => {
    await setVerdict("in_danger", new Date(), ["bounce_pause"]);

    await runWorker(0);
    await runWorker(0);

    const notifications = await loadReputationNotifications();
    expect(notifications).toHaveLength(1);
    expect(sqsState.sendCalls).toHaveLength(2);
  });

  it("a pause that outlasts the 24h dedupe window still notifies only once", async () => {
    // The per-batch 24h notification check used to be the only guard, so a
    // pause lasting days re-alerted daily. Deleting the first notification
    // stands in for that window lapsing: only the pausedReason transition
    // check is left to keep the second cycle quiet.
    await setVerdict("in_danger", new Date(), ["bounce_pause"]);

    await runWorker(0);
    expect(await loadReputationNotifications()).toHaveLength(1);
    await db
      .delete(notification)
      .where(eq(notification.organizationId, fixture.ids.org));

    await runWorker(0);

    expect(await loadReputationNotifications()).toHaveLength(0);
    expect((await loadBatch()).pausedReason).toBe("reputation");
  });

  it("stale in_danger falls through and sends", async () => {
    await setVerdict("in_danger", new Date(Date.now() - 4 * 60 * 60 * 1000), [
      "bounce_pause",
    ]);

    await runWorker(0);

    expect(sesState.bulkSendCalls).toHaveLength(1);
    expect(sesState.bulkSendCalls[0]).toHaveLength(CONTACT_IDS.length);

    const batch = await loadBatch();
    expect(batch.pausedReason).toBeNull();

    expect(await loadReputationNotifications()).toHaveLength(0);
  });

  it("at_risk does not pause", async () => {
    await setVerdict("at_risk", new Date(), ["bounce_review"]);

    await runWorker(0);

    expect(sesState.bulkSendCalls).toHaveLength(1);
    const batch = await loadBatch();
    expect(batch.pausedReason).toBeNull();
  });

  it("NULL verdict (never swept) does not pause", async () => {
    await setVerdict(null, null);

    await runWorker(0);

    expect(sesState.bulkSendCalls).toHaveLength(1);
    const batch = await loadBatch();
    expect(batch.pausedReason).toBeNull();
  });

  it("recovery clears the pause", async () => {
    await setVerdict("in_danger", new Date());
    await runWorker(0);
    expect((await loadBatch()).pausedReason).toBe("reputation");

    await setVerdict("healthy", new Date());
    await runWorker(0);

    expect(sesState.bulkSendCalls).toHaveLength(1);
    const batch = await loadBatch();
    expect(batch.pausedReason).toBeNull();
    expect(batch.pausedAt).toBeNull();
    expect(batch.sent).toBe(CONTACT_IDS.length);
  });

  it("repeated chunk-0 pause cycles do not move the audience snapshot", async () => {
    await setVerdict("in_danger", new Date());

    await runWorker(0);
    const firstSnapshot = (await loadBatch()).audienceSnapshotAt;
    expect(firstSnapshot).not.toBeNull();

    await runWorker(0);
    await runWorker(0);

    const finalBatch = await loadBatch();
    expect(finalBatch.audienceSnapshotAt?.getTime()).toBe(
      (firstSnapshot as Date).getTime()
    );
    expect(finalBatch.totalRecipients).toBe(CONTACT_IDS.length);
  });
});
