/**
 * POST /v1/contacts/import, GET /v1/contacts/export, POST /v1/contacts/validate
 * on the combined app — real DB.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 * Mocked: SES (the client, so no AWS call), the AWS credential lookup (no STS),
 * the email/notification sender (`notifyUser`), and the contact-limit check
 * (only where a test needs to force a limit; the real check runs otherwise).
 */

import { createHash } from "node:crypto";
import { swagger } from "@elysiajs/swagger";
import { notifyUser } from "@wraps/auth/notify";
import {
  auditLog,
  awsAccount,
  contact,
  contactTopic,
  db,
  member,
  organization,
  topic,
  user,
} from "@wraps/db";
import { and, eq, inArray } from "drizzle-orm";
import { Elysia } from "elysia";
import {
  afterAll,
  afterEach,
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
import {
  ERROR_RESPONSES,
  ERROR_SCHEMAS,
  injectErrorResponses,
} from "../lib/openapi-errors";
import { contactsRoutes } from "../routes/contacts";
import { contactsBulkRoutes } from "../routes/contacts-bulk";
import { checkContactLimitForOrg } from "../services/contact-limits";
import { getCredentials } from "../services/credentials";
import { createErrorHarness } from "./error-handler-harness";

// Per-test SES behaviour. `vi.hoisted` so the mock factory below can read it.
const sesState = vi.hoisted(() => ({
  calls: [] as string[],
  verdicts: {} as Record<string, string>,
  // Calls numbered >= throttleFrom reject with a Throttling error.
  throttleFrom: Number.POSITIVE_INFINITY,
  callCount: 0,
}));

vi.mock("@aws-sdk/client-sesv2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-sesv2")>();
  class FakeSESv2Client {
    async send(command: { input: { EmailAddress: string } }) {
      const address = command.input.EmailAddress;
      sesState.calls.push(address);
      sesState.callCount++;
      if (sesState.callCount >= sesState.throttleFrom) {
        throw new Error("Throttling: Rate exceeded");
      }
      return {
        MailboxValidation: {
          IsValid: {
            ConfidenceVerdict: sesState.verdicts[address] ?? "HIGH",
          },
        },
      };
    }
  }
  return { ...actual, SESv2Client: FakeSESv2Client };
});

vi.mock("../services/credentials", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/credentials")>();
  return {
    ...actual,
    getCredentials: vi.fn(async () => ({
      accessKeyId: "AKIATESTFAKE",
      secretAccessKey: "fake-secret",
      sessionToken: "fake-session",
      expiration: new Date(Date.now() + 60 * 60 * 1000),
      region: "us-east-1",
    })),
  };
});

vi.mock("@wraps/auth/notify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wraps/auth/notify")>();
  return { ...actual, notifyUser: vi.fn(async () => undefined) };
});

vi.mock("../services/contact-limits", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/contact-limits")>();
  return {
    ...actual,
    checkContactLimitForOrg: vi.fn(actual.checkContactLimitForOrg),
  };
});

// 16 chars: the prefix never lands in a path param here, but keep it short.
const PREFIX = `t2x-t24-${crypto.randomUUID().slice(0, 8)}`;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];
const RO_USER = `${PREFIX}-ro-user`;
const RO_MEMBER = `${PREFIX}-ro-member`;
const A_TOPIC = `${PREFIX}-topic-a`;
const B_TOPIC = `${PREFIX}-topic-b`;
const B_CONTACT = `${PREFIX}-b-contact`;
const B_SHARED_EMAIL = `shared-${PREFIX}@example.com`;

function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

function appFor(
  organizationId: string,
  userId: string,
  planId: string | null = "pro"
) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId },
    }))
    .use(contactsBulkRoutes);
}

async function clearRows() {
  const orgIds = [ids.org, ids.otherOrg];
  await db.delete(auditLog).where(inArray(auditLog.organizationId, orgIds));
  await db
    .delete(contactTopic)
    .where(inArray(contactTopic.topicId, [A_TOPIC, B_TOPIC]));
  await db.delete(contact).where(inArray(contact.organizationId, orgIds));
}

async function rowsFor(organizationId: string) {
  return db
    .select()
    .from(contact)
    .where(eq(contact.organizationId, organizationId));
}

async function setSesPlan(awsAccountId: string, plan: string) {
  await db
    .update(awsAccount)
    .set({ healthDetail: { sesPricingPlan: { current: plan } } } as never)
    .where(eq(awsAccount.id, awsAccountId));
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

  const now = new Date();
  await db
    .insert(user)
    .values({
      id: RO_USER,
      email: `${RO_USER}@example.com`,
      name: "Read Only Test User",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      image: null,
    } as typeof user.$inferInsert)
    .onConflictDoNothing();
  await db
    .insert(member)
    .values({
      id: RO_MEMBER,
      organizationId: ids.org,
      userId: RO_USER,
      role: "read-only",
      createdAt: now,
    } as typeof member.$inferInsert)
    .onConflictDoNothing();

  await db
    .insert(topic)
    .values([
      {
        id: A_TOPIC,
        organizationId: ids.org,
        name: "Topic A",
        slug: `${PREFIX}-a`,
      },
      {
        id: B_TOPIC,
        organizationId: ids.otherOrg,
        name: "Topic B",
        slug: `${PREFIX}-b`,
      },
    ])
    .onConflictDoNothing();
});

beforeEach(async () => {
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
  sesState.calls = [];
  sesState.verdicts = {};
  sesState.throttleFrom = Number.POSITIVE_INFINITY;
  sesState.callCount = 0;
  vi.mocked(notifyUser).mockClear();
  vi.mocked(checkContactLimitForOrg).mockClear();

  await clearRows();
  // Both AWS accounts are PRO, so the org scope (not the plan) decides 404s.
  await setSesPlan(ids.awsAccount, "PRO");
  await setSesPlan(ids.otherAwsAccount, "PRO");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await clearRows();
  await db.delete(topic).where(inArray(topic.id, [A_TOPIC, B_TOPIC]));
  await db.delete(member).where(eq(member.id, RO_MEMBER));
  await db.delete(user).where(eq(user.id, RO_USER));
  await cleanupBaseOrg(PREFIX);
});

async function postImport(
  app: { handle: (r: Request) => Promise<Response> },
  body: unknown
) {
  return app.handle(
    new Request("http://localhost/v1/contacts/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function postValidate(
  app: { handle: (r: Request) => Promise<Response> },
  body: unknown
) {
  return app.handle(
    new Request("http://localhost/v1/contacts/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function getExport(
  app: { handle: (r: Request) => Promise<Response> },
  query = ""
) {
  return app.handle(new Request(`http://localhost/v1/contacts/export${query}`));
}

// ───────────────────────────────────────────────────────────────────────────

describe("POST /v1/contacts/import", () => {
  it("creates new contacts, skips a repeat of a row in the same file, and writes one audit entry", async () => {
    const app = appFor(ids.org, ids.user);
    const res = await postImport(app, {
      contacts: [
        { email: `one-${PREFIX}@example.com`, firstName: "One" },
        {
          email: `two-${PREFIX}@example.com`,
          phone: "+15550000002",
          smsStatus: "opted_in",
          smsConsentedAt: "2026-01-02T00:00:00Z",
        },
        { email: `ONE-${PREFIX}@example.com`, firstName: "Repeat" },
      ],
      duplicateStrategy: "skip",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      created: 2,
      updated: 0,
      skipped: 1,
      invalid: 0,
      errors: [],
      duplicates: [
        {
          row: 3,
          firstRow: 1,
          field: "email",
          value: `one-${PREFIX}@example.com`,
        },
      ],
    });

    const rows = await rowsFor(ids.org);
    expect(rows.map((r) => r.email).sort()).toEqual([
      `one-${PREFIX}@example.com`,
      `two-${PREFIX}@example.com`,
    ]);
    const two = rows.find((r) => r.email === `two-${PREFIX}@example.com`);
    expect(two?.smsStatus).toBe("opted_in");
    expect(two?.createdBy).toBe(ids.user);

    const audit = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, ids.org),
          eq(auditLog.action, "contact.imported")
        )
      );
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toEqual({ count: 2, updated: 0 });

    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyUser).mock.calls[0][0]).toMatchObject({
      userId: ids.user,
      organizationId: ids.org,
      type: "contact.imported",
      title: "Contact import finished: 2 created, 0 updated",
    });
  });

  it("with duplicateStrategy update, fills blank fields and merges properties on an existing contact", async () => {
    const existingId = `${PREFIX}-a-existing`;
    await db.insert(contact).values({
      id: existingId,
      organizationId: ids.org,
      email: `exists-${PREFIX}@example.com`,
      emailHash: sha256(`exists-${PREFIX}@example.com`),
      emailStatus: "active",
      firstName: "Old",
      properties: { keep: "yes" },
      createdBy: ids.user,
    });

    const app = appFor(ids.org, ids.user);
    const res = await postImport(app, {
      contacts: [
        {
          email: `exists-${PREFIX}@example.com`,
          firstName: "New",
          company: "Acme",
          properties: { added: "1" },
        },
      ],
      duplicateStrategy: "update",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      created: 0,
      updated: 1,
      skipped: 0,
      invalid: 0,
    });

    const [row] = await db
      .select()
      .from(contact)
      .where(eq(contact.id, existingId));
    expect(row.firstName).toBe("New");
    expect(row.company).toBe("Acme");
    expect(row.properties).toEqual({ keep: "yes", added: "1" });
  });

  it("reports row-level errors with the action's exact text and imports the valid rows", async () => {
    const app = appFor(ids.org, ids.user);
    const res = await postImport(app, {
      contacts: [
        { firstName: "NoContact" },
        { email: "not-an-email" },
        {
          email: `bad-sms-${PREFIX}@example.com`,
          phone: "+15550000003",
          smsStatus: "bogus",
        },
        { email: `good-${PREFIX}@example.com` },
      ],
      duplicateStrategy: "skip",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.invalid).toBe(3);
    expect(body.errors).toEqual([
      { row: 1, error: "Row must have at least an email or phone number" },
      { row: 2, error: "Invalid email: not-an-email" },
      {
        row: 3,
        error:
          "Invalid SMS status: bogus. Use one of pending_consent, opted_in, opted_out, invalid.",
      },
    ]);
  });

  it("returns 400 with 'No contacts provided' for an empty list, and writes nothing", async () => {
    const app = appFor(ids.org, ids.user);
    const res = await postImport(app, {
      contacts: [],
      duplicateStrategy: "skip",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No contacts provided" });
    expect(await rowsFor(ids.org)).toHaveLength(0);
  });

  it("returns 400 naming the 10000-row cap, and writes nothing", async () => {
    const app = appFor(ids.org, ids.user);
    const contacts = Array.from({ length: 10_001 }, (_, i) => ({
      email: `m${i}@example.com`,
    }));
    const res = await postImport(app, { contacts, duplicateStrategy: "skip" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Import size exceeds maximum of 10000 contacts per batch.",
    });
    expect(await rowsFor(ids.org)).toHaveLength(0);
  });

  it("returns 402 when the plan's contact limit is reached, and writes nothing", async () => {
    vi.mocked(checkContactLimitForOrg).mockResolvedValueOnce({
      allowed: false,
      current: 1,
      limit: 1,
      message:
        "You've reached your plan limit of 1 contacts. Upgrade to add more.",
    });
    const app = appFor(ids.org, ids.user);
    const res = await postImport(app, {
      contacts: [{ email: `capped-${PREFIX}@example.com` }],
      duplicateStrategy: "skip",
    });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error:
        "You've reached your plan limit of 1 contacts. Upgrade to add more.",
    });
    expect(await rowsFor(ids.org)).toHaveLength(0);
  });

  it("with sesValidation, drops LOW-confidence rows and reports them as failed SES validation", async () => {
    sesState.verdicts = {
      [`low-${PREFIX}@example.com`]: "LOW",
      [`good-${PREFIX}@example.com`]: "HIGH",
    };
    const app = appFor(ids.org, ids.user);
    const res = await postImport(app, {
      contacts: [
        { email: `low-${PREFIX}@example.com` },
        { email: `good-${PREFIX}@example.com` },
      ],
      duplicateStrategy: "skip",
      sesValidation: { awsAccountId: ids.awsAccount },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.errors).toEqual([{ row: 1, error: "Failed SES validation" }]);
    expect(sesState.calls.sort()).toEqual([
      `good-${PREFIX}@example.com`,
      `low-${PREFIX}@example.com`,
    ]);
    const rows = await rowsFor(ids.org);
    expect(rows.map((r) => r.email)).toEqual([`good-${PREFIX}@example.com`]);
  });

  it("with sesValidation on an account whose SES plan is not PRO or ENTERPRISE, returns 400 and makes no SES call", async () => {
    await setSesPlan(ids.awsAccount, "ESSENTIALS");
    const app = appFor(ids.org, ids.user);
    const res = await postImport(app, {
      contacts: [{ email: `x-${PREFIX}@example.com` }],
      duplicateStrategy: "skip",
      sesValidation: { awsAccountId: ids.awsAccount },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error:
        "This AWS account's SES plan no longer includes email validation. Refresh and try again.",
    });
    expect(sesState.calls).toHaveLength(0);
    expect(await rowsFor(ids.org)).toHaveLength(0);
  });

  it("with sesValidation and a throttled SES, returns 429 and names how many addresses were checked", async () => {
    // Call 1 succeeds; every later call is throttled.
    sesState.throttleFrom = 2;
    const app = appFor(ids.org, ids.user);
    const res = await postImport(app, {
      contacts: [
        { email: `t1-${PREFIX}@example.com` },
        { email: `t2-${PREFIX}@example.com` },
        { email: `t3-${PREFIX}@example.com` },
      ],
      duplicateStrategy: "skip",
      sesValidation: { awsAccountId: ids.awsAccount },
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain(
      "SES validation was throttled after checking 1 address."
    );
    expect(body.error).toContain(
      "0 contacts from this file were imported before this happened"
    );
    expect(await rowsFor(ids.org)).toHaveLength(0);
  });
});

describe("POST /v1/contacts/validate", () => {
  it("returns one verdict per syntactically valid, de-duplicated address and lists syntax failures without calling SES for them", async () => {
    sesState.verdicts = { [`ok-${PREFIX}@example.com`]: "MEDIUM" };
    const app = appFor(ids.org, ids.user);
    const res = await postValidate(app, {
      awsAccountId: ids.awsAccount,
      emails: [
        `OK-${PREFIX}@example.com`,
        `ok-${PREFIX}@example.com`,
        "bad-address",
      ],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      verdicts: { [`ok-${PREFIX}@example.com`]: "MEDIUM" },
      validatedCount: 1,
      stoppedEarly: false,
      invalid: ["bad-address"],
    });
    expect(sesState.calls).toEqual([`ok-${PREFIX}@example.com`]);
  });

  it("returns a partial result with stoppedEarly true when SES throttles", async () => {
    sesState.throttleFrom = 2;
    const app = appFor(ids.org, ids.user);
    const res = await postValidate(app, {
      awsAccountId: ids.awsAccount,
      emails: [
        `v1-${PREFIX}@example.com`,
        `v2-${PREFIX}@example.com`,
        `v3-${PREFIX}@example.com`,
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Concurrency makes which address gets the verdict arbitrary, the count is not.
    expect(body.validatedCount).toBe(1);
    expect(body.stoppedEarly).toBe(true);
    expect(Object.keys(body.verdicts)).toHaveLength(1);
  });

  it("returns 400 naming the 100-address cap, and calls nothing", async () => {
    const app = appFor(ids.org, ids.user);
    const emails = Array.from({ length: 101 }, (_, i) => `c${i}@example.com`);
    const res = await postValidate(app, {
      awsAccountId: ids.awsAccount,
      emails,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error:
        "Validation accepts at most 100 addresses per request. Split the list and call again.",
    });
    expect(sesState.calls).toHaveLength(0);
  });
});

describe("validate: AWS credential failures", () => {
  it("a denied AssumeRole is 403 with the trust-policy message, and SES is never called", async () => {
    vi.mocked(getCredentials).mockRejectedValueOnce(
      Object.assign(
        new Error("User is not authorized to perform: sts:AssumeRole"),
        {
          name: "AccessDenied",
        }
      )
    );
    const app = appFor(ids.org, ids.user);
    const res = await postValidate(app, {
      awsAccountId: ids.awsAccount,
      emails: [`cred-${PREFIX}@example.com`],
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error:
        "Wraps can't assume the IAM role for this AWS account. Check the role's trust policy and external ID.",
    });
    expect(sesState.calls).toHaveLength(0);
  });

  it("any other credential failure is 400 with the connection message, and SES is never called", async () => {
    vi.mocked(getCredentials).mockRejectedValueOnce(
      new Error("socket hang up")
    );
    const app = appFor(ids.org, ids.user);
    const res = await postValidate(app, {
      awsAccountId: ids.awsAccount,
      emails: [`cred2-${PREFIX}@example.com`],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error:
        "Wraps couldn't connect to this AWS account to validate addresses. Check the account's IAM role.",
    });
    expect(sesState.calls).toHaveLength(0);
  });
});

describe("GET /v1/contacts/export", () => {
  async function seedExportSet() {
    const now = new Date();
    await db.insert(contact).values([
      {
        id: `${PREFIX}-ex-1`,
        organizationId: ids.org,
        email: `ex1-${PREFIX}@example.com`,
        emailStatus: "active",
        firstName: "Ex1",
        createdAt: new Date(now.getTime() - 3000),
      },
      {
        id: `${PREFIX}-ex-2`,
        organizationId: ids.org,
        email: `ex2-${PREFIX}@example.com`,
        emailStatus: "unsubscribed",
        firstName: "Ex2",
        createdAt: new Date(now.getTime() - 2000),
      },
      {
        id: `${PREFIX}-ex-3`,
        organizationId: ids.org,
        email: `ex3-${PREFIX}@example.com`,
        emailStatus: "active",
        firstName: "Ex3",
        createdAt: new Date(now.getTime() - 1000),
      },
    ]);
    await db.insert(contact).values([
      {
        id: B_CONTACT,
        organizationId: ids.otherOrg,
        email: B_SHARED_EMAIL,
        emailHash: sha256(B_SHARED_EMAIL),
        emailStatus: "active",
        firstName: "Bee",
      },
      {
        id: `${PREFIX}-b-2`,
        organizationId: ids.otherOrg,
        email: `bee2-${PREFIX}@example.com`,
        emailStatus: "active",
      },
    ]);
  }

  it("returns exactly org A's matching contacts with pinned counts, newest first", async () => {
    await seedExportSet();
    const app = appFor(ids.org, ids.user);
    const res = await getExport(app);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.truncated).toBe(false);
    expect(body.contacts.map((c: { email: string }) => c.email)).toEqual([
      `ex3-${PREFIX}@example.com`,
      `ex2-${PREFIX}@example.com`,
      `ex1-${PREFIX}@example.com`,
    ]);
  });

  it("filters by emailStatus and search taken from the URL", async () => {
    await seedExportSet();
    const app = appFor(ids.org, ids.user);

    const byStatus = await (
      await getExport(app, "?emailStatus=unsubscribed")
    ).json();
    expect(byStatus.total).toBe(1);
    expect(byStatus.contacts.map((c: { email: string }) => c.email)).toEqual([
      `ex2-${PREFIX}@example.com`,
    ]);

    const bySearch = await (
      await getExport(app, `?search=ex1-${PREFIX}`)
    ).json();
    expect(bySearch.total).toBe(1);
    expect(bySearch.contacts.map((c: { email: string }) => c.email)).toEqual([
      `ex1-${PREFIX}@example.com`,
    ]);
  });

  it("accepts emailStatus=soft_bounced and returns only soft-bounced contacts", async () => {
    await seedExportSet();
    await db.insert(contact).values({
      id: `${PREFIX}-ex-soft`,
      organizationId: ids.org,
      email: `exsoft-${PREFIX}@example.com`,
      emailStatus: "soft_bounced",
      emailSoftBounceCount: 2,
      emailLastSoftBouncedAt: new Date("2026-08-10T12:00:00.000Z"),
      firstName: "ExSoft",
    });
    const app = appFor(ids.org, ids.user);

    const res = await getExport(app, "?emailStatus=soft_bounced");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.contacts).toHaveLength(1);
    expect(body.contacts[0].email).toBe(`exsoft-${PREFIX}@example.com`);
    expect(body.contacts[0].emailSoftBounceCount).toBe(2);
    expect(body.contacts[0].emailLastSoftBouncedAt).toBe(
      "2026-08-10T12:00:00.000Z"
    );
  });

  it("returns 422 for an emailStatus outside the enum, and never queries with it", async () => {
    await seedExportSet();
    const app = appFor(ids.org, ids.user);
    const res = await getExport(app, "?emailStatus=whatever");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Validation failed",
      code: "VALIDATION_FAILED",
      requestId: "test-request-id",
    });
  });

  it("returns CSV with the dashboard's header row when format=csv, and org A rows only", async () => {
    await seedExportSet();
    const app = appFor(ids.org, ids.user);
    const res = await getExport(app, "?format=csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("x-export-total")).toBe("3");
    expect(res.headers.get("x-export-truncated")).toBe("false");
    const text = await res.text();
    expect(text.split("\n")[0]).toBe(
      "Email,Phone,First Name,Last Name,Company,Job Title,Email Status,SMS Status,Emails Sent,Emails Opened,Emails Clicked,SMS Sent,Topics,Created At"
    );
    expect(text).toContain(`ex1-${PREFIX}@example.com`);
    expect(text).not.toContain(B_SHARED_EMAIL);
    expect(text).not.toContain(`bee2-${PREFIX}`);
  });

  it("filters by topicId, returning only subscribed contacts of that topic", async () => {
    await seedExportSet();
    await db.insert(contactTopic).values({
      contactId: `${PREFIX}-ex-2`,
      topicId: A_TOPIC,
      status: "subscribed",
    });
    const app = appFor(ids.org, ids.user);
    const body = await (await getExport(app, `?topicId=${A_TOPIC}`)).json();
    expect(body.total).toBe(1);
    expect(body.contacts.map((c: { email: string }) => c.email)).toEqual([
      `ex2-${PREFIX}@example.com`,
    ]);
  });
});

describe("org isolation", () => {
  it("import: an email that exists in org B creates a NEW contact in org A and leaves B's contact byte-identical", async () => {
    await db.insert(contact).values({
      id: B_CONTACT,
      organizationId: ids.otherOrg,
      email: B_SHARED_EMAIL,
      emailHash: sha256(B_SHARED_EMAIL),
      emailStatus: "active",
      firstName: "Bee",
      properties: { tier: "b" },
    });
    const [before] = await db
      .select()
      .from(contact)
      .where(eq(contact.id, B_CONTACT));
    const beforeJson = JSON.stringify(before);

    const app = appFor(ids.org, ids.user);
    const res = await postImport(app, {
      contacts: [
        {
          email: B_SHARED_EMAIL,
          firstName: "Alice",
          properties: { tier: "a" },
        },
      ],
      duplicateStrategy: "update",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 0,
    });

    const aRows = await rowsFor(ids.org);
    expect(aRows).toHaveLength(1);
    expect(aRows[0].email).toBe(B_SHARED_EMAIL);
    expect(aRows[0].id).not.toBe(B_CONTACT);

    const [after] = await db
      .select()
      .from(contact)
      .where(eq(contact.id, B_CONTACT));
    expect(JSON.stringify(after)).toBe(beforeJson);
  });

  it("import: naming org B's AWS account for sesValidation is 404, writes nothing, and leaves B's account unchanged", async () => {
    const [before] = await db
      .select()
      .from(awsAccount)
      .where(eq(awsAccount.id, ids.otherAwsAccount));
    const beforeJson = JSON.stringify(before);

    const app = appFor(ids.org, ids.user);
    const res = await postImport(app, {
      contacts: [{ email: `xorg-${PREFIX}@example.com` }],
      duplicateStrategy: "skip",
      sesValidation: { awsAccountId: ids.otherAwsAccount },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "AWS account for SES validation was not found.",
    });
    expect(sesState.calls).toHaveLength(0);
    expect(await rowsFor(ids.org)).toHaveLength(0);

    const [after] = await db
      .select()
      .from(awsAccount)
      .where(eq(awsAccount.id, ids.otherAwsAccount));
    expect(JSON.stringify(after)).toBe(beforeJson);
  });

  it("import: a topicId owned by org B is ignored, so no subscription is written", async () => {
    const app = appFor(ids.org, ids.user);
    const res = await postImport(app, {
      contacts: [{ email: `topic-${PREFIX}@example.com` }],
      duplicateStrategy: "skip",
      topicIds: [B_TOPIC],
    });
    expect(res.status).toBe(200);
    const [row] = await rowsFor(ids.org);
    const subs = await db
      .select()
      .from(contactTopic)
      .where(eq(contactTopic.contactId, row.id));
    expect(subs).toHaveLength(0);
    // The B side: no subscription to B's topic was written by the org A import.
    const bSubs = await db
      .select()
      .from(contactTopic)
      .where(eq(contactTopic.topicId, B_TOPIC));
    expect(bSubs).toHaveLength(0);
  });

  it("export: org A never contains org B rows (pinned count and no B email)", async () => {
    await db.insert(contact).values([
      {
        id: `${PREFIX}-own`,
        organizationId: ids.org,
        email: `own-${PREFIX}@example.com`,
        emailStatus: "active",
      },
      {
        id: B_CONTACT,
        organizationId: ids.otherOrg,
        email: B_SHARED_EMAIL,
        emailHash: sha256(B_SHARED_EMAIL),
        emailStatus: "active",
      },
      {
        id: `${PREFIX}-b-3`,
        organizationId: ids.otherOrg,
        email: `bee3-${PREFIX}@example.com`,
        emailStatus: "active",
      },
    ]);
    const app = appFor(ids.org, ids.user);
    const res = await getExport(app);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.contacts.map((c: { id: string }) => c.id)).toEqual([
      `${PREFIX}-own`,
    ]);
    expect(JSON.stringify(body)).not.toContain(B_SHARED_EMAIL);
  });

  it("export: a non-member of org B cannot export it (403), even with B's id in the auth context", async () => {
    const app = appFor(ids.otherOrg, ids.user);
    const res = await getExport(app);
    expect(res.status).toBe(403);
  });

  it("validate: org A's request naming org B's AWS account is 404, makes no SES call, and leaves B's account unchanged", async () => {
    const [before] = await db
      .select()
      .from(awsAccount)
      .where(eq(awsAccount.id, ids.otherAwsAccount));
    const beforeJson = JSON.stringify(before);

    const app = appFor(ids.org, ids.user);
    const res = await postValidate(app, {
      awsAccountId: ids.otherAwsAccount,
      emails: [`leak-${PREFIX}@example.com`],
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "AWS account for SES validation was not found.",
    });
    expect(sesState.calls).toHaveLength(0);

    const [after] = await db
      .select()
      .from(awsAccount)
      .where(eq(awsAccount.id, ids.otherAwsAccount));
    expect(JSON.stringify(after)).toBe(beforeJson);
  });

  it("validate: the response never carries org B contact data, only verdicts for the submitted addresses", async () => {
    await db.insert(contact).values({
      id: B_CONTACT,
      organizationId: ids.otherOrg,
      email: B_SHARED_EMAIL,
      emailHash: sha256(B_SHARED_EMAIL),
      emailStatus: "active",
      firstName: `Bee-secret-${PREFIX}`,
      properties: { secret: `b-only-${PREFIX}` },
    });
    const app = appFor(ids.org, ids.user);
    const res = await postValidate(app, {
      awsAccountId: ids.awsAccount,
      emails: [B_SHARED_EMAIL],
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    // The caller's own address is echoed as a verdict key; B's stored fields must not be.
    expect(text).not.toContain(`Bee-secret-${PREFIX}`);
    expect(text).not.toContain(`b-only-${PREFIX}`);
    expect(JSON.parse(text).verdicts).toEqual({ [B_SHARED_EMAIL]: "HIGH" });
  });
});

describe("permissions", () => {
  // read-only holds contacts:read and contacts:export, not contacts:import.
  // Its member row lives in org A, so every request below is authenticated as
  // a real member with that role.
  it("import: a read-only member gets 403 with the permission text, and no contact is written", async () => {
    const app = appFor(ids.org, RO_USER);
    const res = await postImport(app, {
      contacts: [{ email: `ro-${PREFIX}@example.com` }],
      duplicateStrategy: "skip",
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You don't have permission to perform this action",
    });
    expect(await rowsFor(ids.org)).toHaveLength(0);
  });

  it("validate: a read-only member gets 403 and SES is never called", async () => {
    const app = appFor(ids.org, RO_USER);
    const res = await postValidate(app, {
      awsAccountId: ids.awsAccount,
      emails: [`ro-${PREFIX}@example.com`],
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You don't have permission to perform this action",
    });
    expect(sesState.calls).toHaveLength(0);
  });

  it("export: a read-only member can export, because the role holds contacts:export", async () => {
    const app = appFor(ids.org, RO_USER);
    const res = await getExport(app);
    expect(res.status).toBe(200);
  });

  it("a caller with no member row in the org is 403 on import", async () => {
    const app = appFor(ids.org, `${PREFIX}-stranger`);
    const res = await postImport(app, {
      contacts: [{ email: `s-${PREFIX}@example.com` }],
      duplicateStrategy: "skip",
    });
    expect(res.status).toBe(403);
    expect(await rowsFor(ids.org)).toHaveLength(0);
  });
});

describe("static path precedence over contacts GET /:id", () => {
  // contacts.ts defines GET /v1/contacts/:id, which accepts a UUID, an email or
  // an externalId. GET /v1/contacts/export must reach the export handler in
  // either mount order. registration.md pins the order C1 uses.
  const realContact = crypto.randomUUID();

  beforeEach(async () => {
    await db.insert(contact).values({
      id: realContact,
      organizationId: ids.org,
      email: `prec-${PREFIX}@example.com`,
      emailStatus: "active",
    });
  });

  function mounted(order: "bulk-first" | "bulk-last") {
    const { app } = createErrorHarness();
    const base = app.derive(() => ({
      auth: {
        apiKeyId: null,
        organizationId: ids.org,
        userId: ids.user,
        planId: "pro",
      },
    }));
    return order === "bulk-first"
      ? base.use(contactsBulkRoutes).use(contactsRoutes)
      : base.use(contactsRoutes).use(contactsBulkRoutes);
  }

  for (const order of ["bulk-first", "bulk-last"] as const) {
    it(`GET /v1/contacts/export reaches the export handler when bulk is mounted ${order}`, async () => {
      const res = await getExport(mounted(order));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("contacts");
      expect(body.total).toBe(1);
      expect(body).not.toHaveProperty("error");
    });

    it(`GET /v1/contacts/:id still resolves a real contact when bulk is mounted ${order}`, async () => {
      const res = await mounted(order).handle(
        new Request(`http://localhost/v1/contacts/${realContact}`)
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ id: realContact });
    });
  }
});

describe("OpenAPI", () => {
  function specApp() {
    return new Elysia()
      .onAfterHandle({ as: "global" }, ({ path, response }) => {
        if (
          path === "/swagger/json" &&
          response &&
          typeof response === "object"
        ) {
          injectErrorResponses(response as Record<string, never>);
        }
      })
      .use(
        swagger({
          path: "/swagger",
          documentation: {
            components: { schemas: ERROR_SCHEMAS, responses: ERROR_RESPONSES },
            security: [{ bearerAuth: [] }],
          } as never,
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .use(contactsBulkRoutes);
  }

  it("lists GET /v1/contacts/export, POST /v1/contacts/import and POST /v1/contacts/validate", async () => {
    const response = await specApp().handle(
      new Request("http://localhost/swagger/json")
    );
    expect(response.status).toBe(200);
    const spec = (await response.json()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(spec.paths["/v1/contacts/export"] ?? {})).toEqual([
      "get",
    ]);
    expect(Object.keys(spec.paths["/v1/contacts/import"] ?? {})).toEqual([
      "post",
    ]);
    expect(Object.keys(spec.paths["/v1/contacts/validate"] ?? {})).toEqual([
      "post",
    ]);
  });
});
