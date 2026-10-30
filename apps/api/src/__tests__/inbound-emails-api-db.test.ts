/**
 * GET /v1/email/inbound and GET /v1/email/inbound/:emailId.
 *
 * File suffix `-db.test.ts` = real Neon test branch. The awsAccount rows are
 * real. AWS is faked at the two boundaries the service crosses:
 * `getCredentials` (the role assumption, which is also where the org-scoped
 * account lookup happens) and the S3 client. Both record every call, so the
 * org-isolation tests can prove which accounts, roles and buckets were touched.
 *
 * Read-only routes: there is no write assertion here and no permissions block.
 */

import { swagger } from "@elysiajs/swagger";
import { awsAccount, db, eq } from "@wraps/db";
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
  type BaseOrgIds,
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { INVALID_CURSOR_MESSAGE } from "../lib/cursor";
import { errorContract } from "../middleware/error-contract";
import { inboundEmailsRoutes } from "../routes/inbound-emails";
import { createErrorHarness } from "./error-handler-harness";

const state = vi.hoisted(() => {
  const awsError = (name: string) => {
    const error = new Error(name);
    error.name = name;
    return error;
  };
  return {
    awsError,
    /** bucket -> S3 key -> parsed JSON body */
    buckets: new Map<string, Map<string, unknown>>(),
    /** buckets whose S3 calls fail with AccessDenied */
    denyBuckets: new Set<string>(),
    /** AWS account ids whose role assumption fails with AccessDenied */
    denyAccounts: new Set<string>(),
    /** every getCredentials call, in order */
    credentialCalls: [] as Array<{ accountId: string; organizationId: string }>,
    /** every S3 command, in order */
    s3Calls: [] as Array<{
      op: "list" | "get";
      bucket: string;
      key?: string;
      maxKeys?: number;
      token: string | null;
    }>,
  };
});

vi.mock("../services/credentials", () => ({
  getCredentials: async (accountId: string, organizationId: string) => {
    state.credentialCalls.push({ accountId, organizationId });
    if (state.denyAccounts.has(accountId)) {
      throw state.awsError("AccessDenied");
    }
    return {
      accessKeyId: "AKIATESTONLY",
      secretAccessKey: "test-secret",
      sessionToken: "test-session-token",
      expiration: new Date(Date.now() + 3_600_000),
      region: "us-east-1",
    };
  },
}));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();

  class FakeS3Client {
    async send(command: unknown): Promise<unknown> {
      if (command instanceof actual.ListObjectsV2Command) {
        const input = command.input;
        const bucket = input.Bucket ?? "";
        const token = input.ContinuationToken ?? null;
        state.s3Calls.push({
          op: "list",
          bucket,
          maxKeys: input.MaxKeys,
          token,
        });
        if (state.denyBuckets.has(bucket)) {
          throw state.awsError("AccessDenied");
        }
        const store = state.buckets.get(bucket);
        if (!store) {
          throw state.awsError("NoSuchBucket");
        }
        const prefix = input.Prefix ?? "";
        const keys = [...store.keys()]
          .filter((key) => key.startsWith(prefix))
          .sort();
        const start = token === null ? 0 : Number(token);
        const end = start + (input.MaxKeys ?? 1000);
        const truncated = end < keys.length;
        return {
          Contents: keys.slice(start, end).map((Key) => ({ Key })),
          NextContinuationToken: truncated ? String(end) : undefined,
          IsTruncated: truncated,
        };
      }

      if (command instanceof actual.GetObjectCommand) {
        const input = command.input;
        const bucket = input.Bucket ?? "";
        const key = input.Key ?? "";
        state.s3Calls.push({ op: "get", bucket, key, token: null });
        if (state.denyBuckets.has(bucket)) {
          throw state.awsError("AccessDenied");
        }
        const store = state.buckets.get(bucket);
        if (!store || !store.has(key)) {
          throw state.awsError("NoSuchKey");
        }
        const body = JSON.stringify(store.get(key));
        return { Body: { transformToString: async () => body } };
      }

      throw new Error("Unexpected S3 command in test");
    }
  }

  return { ...actual, S3Client: FakeS3Client };
});

const PREFIX = `t3-a1a-${crypto.randomUUID().slice(0, 8)}`;

// Org A owns two accounts with buckets; org B owns one. Account ids sort as
// `${PREFIX}-aws` < `${PREFIX}-aws-3` < (org B's `${PREFIX}-aws-2`), but B is
// never in org A's walk, so its position does not matter to org A.
const BUCKET_A1 = `${PREFIX}-bucket-a1`;
const BUCKET_A3 = `${PREFIX}-bucket-a3`;
const BUCKET_B = `${PREFIX}-bucket-b`;
const ACCOUNT_A3 = `${PREFIX}-aws-3`;

const A1_IDS = ["inb_a1_001", "inb_a1_002", "inb_a1_003"];
const A3_IDS = ["inb_a3_001", "inb_a3_002"];
const B_IDS = ["inb_b_001"];

let ids: BaseOrgIds;

function parsedEmail(
  emailId: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    emailId,
    messageId: `<${emailId}@example.test>`,
    receivingDomain: "example.test",
    from: { address: "sender@example.test", name: "Sender" },
    to: [{ address: "inbox@example.test", name: "" }],
    cc: [],
    subject: `Subject ${emailId}`,
    date: "2026-10-28T10:00:00.000Z",
    html: "<p>hello</p>",
    htmlTruncated: false,
    text: "hello",
    headers: { "x-ses-spam-verdict": "PASS" },
    attachments: [],
    spamVerdict: "PASS",
    virusVerdict: "PASS",
    rawS3Key: `raw/${emailId}`,
    receivedAt: "2026-10-28T10:00:00.000Z",
    replyToken: null,
    autoReply: false,
    ...overrides,
  };
}

function seedBuckets() {
  state.buckets.set(
    BUCKET_A1,
    new Map<string, unknown>([
      [
        "parsed/inb_a1_001.json",
        parsedEmail("inb_a1_001", {
          attachments: [
            {
              id: "att_0",
              filename: "invoice.pdf",
              contentType: "application/pdf",
              size: 2048,
              s3Key: "attachments/inb_a1_001/att_0-invoice.pdf",
              contentDisposition: "attachment",
              cid: null,
            },
          ],
        }),
      ],
      [
        "parsed/inb_a1_002.json",
        parsedEmail("inb_a1_002", {
          html: "<p>cut",
          htmlTruncated: true,
        }),
      ],
      ["parsed/inb_a1_003.json", parsedEmail("inb_a1_003")],
    ])
  );
  state.buckets.set(
    BUCKET_A3,
    new Map<string, unknown>([
      ["parsed/inb_a3_001.json", parsedEmail("inb_a3_001")],
      ["parsed/inb_a3_002.json", parsedEmail("inb_a3_002")],
    ])
  );
  state.buckets.set(
    BUCKET_B,
    new Map<string, unknown>([
      [
        "parsed/inb_b_001.json",
        parsedEmail("inb_b_001", { subject: "Org B confidential" }),
      ],
    ])
  );
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

  const now = new Date();
  await db
    .update(awsAccount)
    .set({ features: { email: { inboundBucketName: BUCKET_A1 } } })
    .where(eq(awsAccount.id, ids.awsAccount));
  await db
    .update(awsAccount)
    .set({ features: { email: { inboundBucketName: BUCKET_B } } })
    .where(eq(awsAccount.id, ids.otherAwsAccount));
  await db.insert(awsAccount).values({
    id: ACCOUNT_A3,
    organizationId: ids.org,
    name: "Primary AWS (second)",
    accountId: "100000000003",
    region: "us-east-1",
    roleArn: "arn:aws:iam::100000000003:role/wraps",
    externalId: `${PREFIX}-ext-3`,
    webhookSecret: null,
    isVerified: true,
    features: { email: { inboundBucketName: BUCKET_A3 } },
    createdAt: now,
    updatedAt: now,
  } as typeof awsAccount.$inferInsert);

  seedBuckets();
});

beforeEach(() => {
  state.s3Calls.length = 0;
  state.credentialCalls.length = 0;
  state.denyBuckets.clear();
  state.denyAccounts.clear();
});

afterAll(async () => {
  await db.delete(awsAccount).where(eq(awsAccount.id, ACCOUNT_A3));
  await cleanupBaseOrg(PREFIX);
  state.buckets.clear();
});

function appFor(organizationId: string, userId: string) {
  const { app } = createErrorHarness();
  return app
    .use(errorContract)
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId: "free" },
    }))
    .use(inboundEmailsRoutes);
}

function appA() {
  return appFor(ids.org, ids.user);
}

function appB() {
  return appFor(ids.otherOrg, ids.user);
}

type Reply = { status: number; body: Record<string, unknown> };

async function send(
  app: { handle: (request: Request) => Promise<Response> },
  path: string
): Promise<Reply> {
  const response = await app.handle(new Request(`http://localhost${path}`));
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function cursorFor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function emailIdsOf(body: Record<string, unknown>): string[] {
  return (body.data as Array<{ emailId: string }>).map((e) => e.emailId);
}

function accountIdsOf(body: Record<string, unknown>): string[] {
  return (body.data as Array<{ awsAccountId: string }>).map(
    (e) => e.awsAccountId
  );
}

function listCalls() {
  return state.s3Calls.filter((call) => call.op === "list");
}

function bucketsTouched(): string[] {
  return [...new Set(state.s3Calls.map((call) => call.bucket))].sort();
}

function accountsAssumed(): string[] {
  return [
    ...new Set(state.credentialCalls.map((call) => call.accountId)),
  ].sort();
}

describe("list: GET /v1/email/inbound", () => {
  it("lists every email across the org's inbound accounts, in S3 key order, tagged with its account", async () => {
    const { status, body } = await send(appA(), "/v1/email/inbound");

    expect(status).toBe(200);
    expect(emailIdsOf(body)).toEqual([...A1_IDS, ...A3_IDS]);
    expect(accountIdsOf(body)).toEqual([
      ids.awsAccount,
      ids.awsAccount,
      ids.awsAccount,
      ACCOUNT_A3,
      ACCOUNT_A3,
    ]);
    expect(body.nextCursor).toBeNull();
    expect(body.deniedAccountIds).toEqual([]);
    expect(body.unreachableAccountIds).toEqual([]);
  });

  it("returns the summary shape: no html, text or reply token, and attachment counts", async () => {
    const { body } = await send(appA(), "/v1/email/inbound");
    const data = body.data as Array<Record<string, unknown>>;

    expect(data[0]).toEqual({
      awsAccountId: ids.awsAccount,
      emailId: "inb_a1_001",
      from: { address: "sender@example.test", name: "Sender" },
      to: [{ address: "inbox@example.test", name: "" }],
      subject: "Subject inb_a1_001",
      receivedAt: "2026-10-28T10:00:00.000Z",
      hasAttachments: true,
      attachmentCount: 1,
      spamVerdict: "PASS",
      virusVerdict: "PASS",
    });
    expect(Object.keys(data[1]).sort()).toEqual(
      [
        "attachmentCount",
        "awsAccountId",
        "emailId",
        "from",
        "hasAttachments",
        "receivedAt",
        "spamVerdict",
        "subject",
        "to",
        "virusVerdict",
      ].sort()
    );
  });

  it("filters to one account when awsAccountId is given", async () => {
    const { status, body } = await send(
      appA(),
      `/v1/email/inbound?awsAccountId=${ids.awsAccount}`
    );

    expect(status).toBe(200);
    expect(emailIdsOf(body)).toEqual(A1_IDS);
    expect(accountIdsOf(body)).toEqual([
      ids.awsAccount,
      ids.awsAccount,
      ids.awsAccount,
    ]);
    expect(body.nextCursor).toBeNull();
    expect(bucketsTouched()).toEqual([BUCKET_A1]);
  });

  it("pages across two accounts: each cursor carries one account's S3 token, and every email comes back once", async () => {
    const app = appA();

    const first = await send(app, "/v1/email/inbound?limit=2");
    expect(first.status).toBe(200);
    expect(emailIdsOf(first.body)).toEqual(["inb_a1_001", "inb_a1_002"]);
    expect(typeof first.body.nextCursor).toBe("string");

    const second = await send(
      app,
      `/v1/email/inbound?limit=2&cursor=${encodeURIComponent(String(first.body.nextCursor))}`
    );
    expect(emailIdsOf(second.body)).toEqual(["inb_a1_003", "inb_a3_001"]);
    expect(accountIdsOf(second.body)).toEqual([ids.awsAccount, ACCOUNT_A3]);
    expect(typeof second.body.nextCursor).toBe("string");

    const third = await send(
      app,
      `/v1/email/inbound?limit=2&cursor=${encodeURIComponent(String(second.body.nextCursor))}`
    );
    expect(emailIdsOf(third.body)).toEqual(["inb_a3_002"]);
    expect(third.body.nextCursor).toBeNull();

    // Pinned: S3 page size and token for every list call across all three pages.
    expect(
      listCalls().map((call) => [call.bucket, call.maxKeys, call.token])
    ).toEqual([
      [BUCKET_A1, 2, null],
      [BUCKET_A1, 2, "2"],
      [BUCKET_A3, 1, null],
      [BUCKET_A3, 2, "1"],
    ]);
  });

  it("reports an account that denies access in deniedAccountIds and still returns the others", async () => {
    state.denyAccounts.add(ids.awsAccount);

    const { status, body } = await send(appA(), "/v1/email/inbound");

    expect(status).toBe(200);
    expect(emailIdsOf(body)).toEqual(A3_IDS);
    expect(body.deniedAccountIds).toEqual([ids.awsAccount]);
    expect(body.unreachableAccountIds).toEqual([]);
    expect(bucketsTouched()).toEqual([BUCKET_A3]);
  });

  it("returns 400 with the invalid-cursor message for a cursor that does not decode, before any AWS call", async () => {
    const { status, body } = await send(
      appA(),
      "/v1/email/inbound?cursor=not-a-real-cursor!!"
    );

    expect(status).toBe(400);
    expect(body.error).toBe(INVALID_CURSOR_MESSAGE);
    expect(state.credentialCalls).toHaveLength(0);
    expect(state.s3Calls).toHaveLength(0);
  });

  it("returns 400 with the invalid-cursor message for a cursor naming an account other than awsAccountId", async () => {
    const cursor = cursorFor({ a: ACCOUNT_A3, t: null });
    const { status, body } = await send(
      appA(),
      `/v1/email/inbound?awsAccountId=${ids.awsAccount}&cursor=${cursor}`
    );

    expect(status).toBe(400);
    expect(body.error).toBe(INVALID_CURSOR_MESSAGE);
    expect(state.s3Calls).toHaveLength(0);
  });

  it("returns 401 with no auth header on the real authenticate path", async () => {
    const { app } = createErrorHarness();
    const { status } = await send(
      app.use(errorContract).use(inboundEmailsRoutes),
      "/v1/email/inbound"
    );

    expect(status).toBe(401);
  });
});

describe("get: GET /v1/email/inbound/:emailId", () => {
  it("returns one email with its account id, headers, text and attachment metadata", async () => {
    const { status, body } = await send(appA(), "/v1/email/inbound/inb_a1_001");

    expect(status).toBe(200);
    expect(body.awsAccountId).toBe(ids.awsAccount);
    expect(body.emailId).toBe("inb_a1_001");
    expect(body.messageId).toBe("<inb_a1_001@example.test>");
    expect(body.html).toBe("<p>hello</p>");
    expect(body.text).toBe("hello");
    expect(body.htmlTruncated).toBe(false);
    expect(body.rawS3Key).toBe("raw/inb_a1_001");
    expect(body.attachments).toEqual([
      {
        id: "att_0",
        filename: "invoice.pdf",
        contentType: "application/pdf",
        size: 2048,
        s3Key: "attachments/inb_a1_001/att_0-invoice.pdf",
        contentDisposition: "attachment",
        cid: null,
      },
    ]);
    expect(body).not.toHaveProperty("replyToken");
  });

  it("returns htmlTruncated true when the stored HTML was cut at receipt", async () => {
    const { status, body } = await send(appA(), "/v1/email/inbound/inb_a1_002");

    expect(status).toBe(200);
    expect(body.htmlTruncated).toBe(true);
    expect(body.html).toBe("<p>cut");
  });

  it("finds an email in the second account when awsAccountId is omitted, and when it is given", async () => {
    const without = await send(appA(), "/v1/email/inbound/inb_a3_002");
    expect(without.status).toBe(200);
    expect(without.body.awsAccountId).toBe(ACCOUNT_A3);

    const withId = await send(
      appA(),
      `/v1/email/inbound/inb_a3_002?awsAccountId=${ACCOUNT_A3}`
    );
    expect(withId.status).toBe(200);
    expect(withId.body.awsAccountId).toBe(ACCOUNT_A3);
  });

  it("returns 404 with the not-found message for an id that is in no account", async () => {
    const { status, body } = await send(
      appA(),
      "/v1/email/inbound/inb_nope_999"
    );

    expect(status).toBe(404);
    expect(body.error).toBe("Inbound email not found");
    expect(body.code).toBe("NOT_FOUND");
  });

  it("rejects an emailId outside the allowed pattern with 422 before any AWS call", async () => {
    const { status } = await send(appA(), "/v1/email/inbound/bad.id");

    expect(status).toBe(422);
    expect(state.s3Calls).toHaveLength(0);
    expect(state.credentialCalls).toHaveLength(0);
  });
});

describe("org isolation", () => {
  it("org A's list never includes org B's emails, and only org A's accounts and buckets were read", async () => {
    const { status, body } = await send(appA(), "/v1/email/inbound?limit=100");

    expect(status).toBe(200);
    expect(emailIdsOf(body)).toEqual([...A1_IDS, ...A3_IDS]);
    for (const emailId of B_IDS) {
      expect(emailIdsOf(body)).not.toContain(emailId);
    }
    expect(JSON.stringify(body)).not.toContain("Org B confidential");

    // Positive control: the accounts and buckets this list read are exactly
    // org A's. Org B's account, role and bucket never appear.
    expect(bucketsTouched()).toEqual([BUCKET_A1, BUCKET_A3].sort());
    expect(accountsAssumed()).toEqual([ids.awsAccount, ACCOUNT_A3].sort());
    expect(
      state.credentialCalls.every((c) => c.organizationId === ids.org)
    ).toBe(true);
  });

  it("org B's list returns only org B's email, through org B's own account (positive control)", async () => {
    const { status, body } = await send(appB(), "/v1/email/inbound");

    expect(status).toBe(200);
    expect(emailIdsOf(body)).toEqual(B_IDS);
    expect(accountIdsOf(body)).toEqual([ids.otherAwsAccount]);
    expect(bucketsTouched()).toEqual([BUCKET_B]);
    expect(accountsAssumed()).toEqual([ids.otherAwsAccount]);
    expect(
      state.credentialCalls.every((c) => c.organizationId === ids.otherOrg)
    ).toBe(true);
  });

  it("org A passing org B's account id as awsAccountId gets 404 on the list and the get, with no credential or S3 call", async () => {
    const list = await send(
      appA(),
      `/v1/email/inbound?awsAccountId=${ids.otherAwsAccount}`
    );
    expect(list.status).toBe(404);
    expect(list.body.error).toBe("AWS account not found");
    expect(list.body.code).toBe("NOT_FOUND");

    const detail = await send(
      appA(),
      `/v1/email/inbound/inb_b_001?awsAccountId=${ids.otherAwsAccount}`
    );
    expect(detail.status).toBe(404);
    expect(detail.body.error).toBe("AWS account not found");

    expect(state.credentialCalls).toHaveLength(0);
    expect(state.s3Calls).toHaveLength(0);
  });

  it("org A's get of an email that exists only in org B's bucket is 404, and org B's bucket is never read", async () => {
    const { status, body } = await send(appA(), "/v1/email/inbound/inb_b_001");

    expect(status).toBe(404);
    expect(body.error).toBe("Inbound email not found");

    // Org A's two accounts were each tried for the key; org B's bucket never.
    expect(
      state.s3Calls.filter((c) => c.op === "get").map((c) => c.bucket)
    ).toEqual([BUCKET_A1, BUCKET_A3]);
    expect(bucketsTouched()).not.toContain(BUCKET_B);
    expect(accountsAssumed()).not.toContain(ids.otherAwsAccount);
  });

  it("org B can read its own email (positive control for the 404 above)", async () => {
    const { status, body } = await send(appB(), "/v1/email/inbound/inb_b_001");

    expect(status).toBe(200);
    expect(body.awsAccountId).toBe(ids.otherAwsAccount);
    expect(body.subject).toBe("Org B confidential");
  });

  it("a cursor naming org B's account is rejected with 400 before any credential or S3 call", async () => {
    const cursor = cursorFor({ a: ids.otherAwsAccount, t: null });
    const { status, body } = await send(
      appA(),
      `/v1/email/inbound?cursor=${cursor}`
    );

    expect(status).toBe(400);
    expect(body.error).toBe(INVALID_CURSOR_MESSAGE);
    expect(state.credentialCalls).toHaveLength(0);
    expect(state.s3Calls).toHaveLength(0);
  });

  it("across every org A request above, org B's account, role and bucket were never used", async () => {
    const app = appA();
    await send(app, "/v1/email/inbound?limit=100");
    await send(app, `/v1/email/inbound?awsAccountId=${ACCOUNT_A3}`);
    await send(app, "/v1/email/inbound/inb_b_001");
    await send(
      app,
      `/v1/email/inbound/inb_b_001?awsAccountId=${ids.otherAwsAccount}`
    );
    await send(app, `/v1/email/inbound?awsAccountId=${ids.otherAwsAccount}`);
    await send(
      app,
      `/v1/email/inbound?cursor=${cursorFor({ a: ids.otherAwsAccount, t: null })}`
    );

    expect(state.s3Calls.some((c) => c.bucket === BUCKET_B)).toBe(false);
    expect(
      state.credentialCalls.some((c) => c.accountId === ids.otherAwsAccount)
    ).toBe(false);
    expect(
      state.credentialCalls.some((c) => c.organizationId === ids.otherOrg)
    ).toBe(false);
    expect(accountsAssumed()).toEqual([ids.awsAccount, ACCOUNT_A3].sort());
  });
});

describe("OpenAPI spec", () => {
  it("publishes both inbound paths under the Inbound tag, with pagination and truncation notes", async () => {
    const app = new Elysia()
      .use(
        swagger({
          path: "/swagger",
          documentation: {} as never,
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .use(inboundEmailsRoutes);

    const response = await app.handle(
      new Request("http://localhost/swagger/json")
    );
    expect(response.status).toBe(200);
    const spec = (await response.json()) as {
      paths: Record<
        string,
        Record<
          string,
          {
            tags?: string[];
            description?: string;
            parameters?: Array<{ name: string; in: string }>;
          }
        >
      >;
    };

    const list = spec.paths["/v1/email/inbound"]?.get;
    const detail = spec.paths["/v1/email/inbound/{emailId}"]?.get;

    expect(list).toBeDefined();
    expect(detail).toBeDefined();
    expect(list?.tags).toEqual(["Inbound"]);
    expect(detail?.tags).toEqual(["Inbound"]);
    expect(list?.parameters?.map((p) => p.name).sort()).toEqual([
      "awsAccountId",
      "cursor",
      "limit",
    ]);
    expect(list?.description).toContain("S3 key order");
    expect(list?.description).toContain("capped at 100");
    expect(list?.description).toContain("nextCursor");
    expect(detail?.description).toContain("htmlTruncated");
    expect(detail?.description).toContain("200 KB");
    expect(detail?.description).toContain("Attachments are metadata only");
  });
});
