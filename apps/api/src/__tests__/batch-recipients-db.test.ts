/**
 * GET /v1/batch/:id/recipients and GET /v1/batch/:id/clicks (real DB)
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 * Only the DynamoDB-backed module middlewares (rate limit, plan gate) are
 * stubbed — see the plan-gate/rate-limit mocks below.
 */

import { batchSend, db, messageSend } from "@wraps/db";
import { inArray } from "drizzle-orm";
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
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { createErrorHarness } from "./error-handler-harness";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));
vi.mock("../middleware/plan-gate", () => ({
  planGateMiddleware: vi.fn(() => new Elysia()),
}));

const { batchRoutes } = await import("../routes/batch");

// Batch and message ids double as route params (`id: t.String({ maxLength: 36 })`
// on GET /v1/batch/:id/recipients and /:id/clicks), so the prefix must stay
// short enough that "<PREFIX>-foreign-batch" fits under that ceiling.
const PREFIX = `brdb-${crypto.randomUUID().slice(0, 8)}`;
const BATCH_ID = `${PREFIX}-batch`;
const FOREIGN_BATCH_ID = `${PREFIX}-foreign-batch`;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

function appFor(organizationId: string, userId: string) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId: "pro" },
    }))
    .use(batchRoutes);
}

async function clearRows() {
  await db
    .delete(messageSend)
    .where(inArray(messageSend.organizationId, [ids.org, ids.otherOrg]));
  await db
    .delete(batchSend)
    .where(inArray(batchSend.organizationId, [ids.org, ids.otherOrg]));
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
});

beforeEach(async () => {
  await clearRows();

  const now = new Date();
  await db.insert(batchSend).values([
    {
      id: BATCH_ID,
      organizationId: ids.org,
      awsAccountId: ids.awsAccount,
      channel: "email",
      status: "completed",
      name: "Recipients Test Batch",
      audienceType: "all",
      totalRecipients: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: FOREIGN_BATCH_ID,
      organizationId: ids.otherOrg,
      awsAccountId: ids.otherAwsAccount,
      channel: "email",
      status: "completed",
      name: "Foreign Batch",
      audienceType: "all",
      totalRecipients: 0,
      createdAt: now,
      updatedAt: now,
    },
  ] as (typeof batchSend.$inferInsert)[]);
});

afterAll(async () => {
  await clearRows();
  await cleanupBaseOrg(PREFIX);
});

function recipientRow(
  id: string,
  overrides: Partial<typeof messageSend.$inferInsert> = {}
): typeof messageSend.$inferInsert {
  const now = new Date();
  return {
    id,
    organizationId: ids.org,
    awsAccountId: ids.awsAccount,
    channel: "email",
    sourceType: "batch",
    batchSendId: BATCH_ID,
    recipient: `${id}@example.com`,
    messageId: `${id}-ses-id`,
    status: "sent",
    sentAt: now,
    createdAt: now,
    ...overrides,
  } as typeof messageSend.$inferInsert;
}

describe("GET /v1/batch/:id/recipients", () => {
  it("returns 404 (not an empty list) for a batch belonging to another org", async () => {
    await db.insert(messageSend).values(
      recipientRow(`${PREFIX}-rcpt-foreign`, {
        organizationId: ids.otherOrg,
        awsAccountId: ids.otherAwsAccount,
        batchSendId: FOREIGN_BATCH_ID,
      })
    );

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request(`http://localhost/v1/batch/${FOREIGN_BATCH_ID}/recipients`)
    );
    expect(res.status).toBe(404);
  });

  it("status filter returns only matching rows, with bounce fields populated", async () => {
    await db.insert(messageSend).values([
      recipientRow(`${PREFIX}-rcpt-sent`, { status: "sent" }),
      recipientRow(`${PREFIX}-rcpt-bounced`, {
        status: "bounced",
        bounceType: "Permanent",
        bounceSubType: "General",
      }),
    ]);

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request(
        `http://localhost/v1/batch/${BATCH_ID}/recipients?status=bounced`
      )
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(`${PREFIX}-rcpt-bounced`);
    expect(body.data[0].bounceType).toBe("Permanent");
    expect(body.data[0].bounceSubType).toBe("General");
  });

  it("returns 422 with VALIDATION_FAILED when limit exceeds the max", async () => {
    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request(`http://localhost/v1/batch/${BATCH_ID}/recipients?limit=1001`)
    );
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.code).toBe("VALIDATION_FAILED");
  });
});

describe("GET /v1/batch/:id/clicks", () => {
  it("aggregates repeated clicked URLs and reports truncated:false under the cap", async () => {
    const repeatedUrl = "https://example.com/repeated";
    const otherUrl = "https://example.com/other";
    await db
      .insert(messageSend)
      .values([
        recipientRow(`${PREFIX}-click-1`, { clickedUrl: repeatedUrl }),
        recipientRow(`${PREFIX}-click-2`, { clickedUrl: repeatedUrl }),
        recipientRow(`${PREFIX}-click-3`, { clickedUrl: repeatedUrl }),
        recipientRow(`${PREFIX}-click-4`, { clickedUrl: otherUrl }),
      ]);

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request(`http://localhost/v1/batch/${BATCH_ID}/clicks`)
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    const byUrl = new Map(
      body.data.map((row: { url: string; count: number }) => [
        row.url,
        row.count,
      ])
    );
    expect(byUrl.get(repeatedUrl)).toBe(3);
    expect(byUrl.get(otherUrl)).toBe(1);
    expect(body.truncated).toBe(false);
  });

  it("returns 404 for a batch belonging to another org", async () => {
    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request(`http://localhost/v1/batch/${FOREIGN_BATCH_ID}/clicks`)
    );
    expect(res.status).toBe(404);
  });
});
