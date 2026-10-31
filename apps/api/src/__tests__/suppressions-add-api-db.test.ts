/**
 * POST /v1/suppressions and POST /v1/suppressions/bulk on a mounted app,
 * against the real database. SES and the AssumeRole path are mocked, so no
 * AWS call is made. The fake SES holds an in-memory suppression list per AWS
 * account, so "unchanged" can be checked by reading it back.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mock).
 */

import { createHash } from "node:crypto";
import { and, auditLog, contact, db, eq, member, user } from "@wraps/db";
import { inArray } from "drizzle-orm";
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
  baseOrgIds,
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { createErrorHarness } from "./error-handler-harness";

const sesState = vi.hoisted(() => ({
  // awsAccountId -> suppression list, in SES order
  store: new Map<
    string,
    { EmailAddress: string; Reason: string; LastUpdateTime: Date }[]
  >(),
  calls: [] as {
    accountId: string;
    kind: string;
    input: Record<string, unknown>;
  }[],
  // awsAccountIds whose every SES call is refused with AccessDenied
  denied: new Set<string>(),
  // awsAccountIds whose PutSuppressedDestination alone is refused
  deniedPut: new Set<string>(),
  // addresses whose SES calls fail with a non-denial error
  failing: new Set<string>(),
}));

const getCredentialsMock = vi.hoisted(() => vi.fn());
const sesSendMock = vi.hoisted(() => vi.fn());

vi.mock("../services/credentials", () => ({
  getCredentials: getCredentialsMock,
}));

vi.mock("@aws-sdk/client-sesv2", () => {
  class SESv2Client {
    accountId: string;
    constructor(config: { credentials: { accessKeyId: string } }) {
      this.accountId = config.credentials.accessKeyId.replace(/^AKIA/, "");
    }
    send(command: { kind: string; input: Record<string, unknown> }) {
      return sesSendMock(this.accountId, command);
    }
  }
  class ListSuppressedDestinationsCommand {
    readonly kind = "list";
    constructor(readonly input: Record<string, unknown>) {}
  }
  class GetSuppressedDestinationCommand {
    readonly kind = "get";
    constructor(readonly input: Record<string, unknown>) {}
  }
  class PutSuppressedDestinationCommand {
    readonly kind = "put";
    constructor(readonly input: Record<string, unknown>) {}
  }
  class DeleteSuppressedDestinationCommand {
    readonly kind = "delete";
    constructor(readonly input: Record<string, unknown>) {}
  }
  return {
    SESv2Client,
    ListSuppressedDestinationsCommand,
    GetSuppressedDestinationCommand,
    PutSuppressedDestinationCommand,
    DeleteSuppressedDestinationCommand,
  };
});

const { suppressionsRoutes } = await import("../routes/suppressions");

// PREFIX seeds the org graph. It is 16 characters, so it fits a path param.
const PREFIX = `t2x-add-${crypto.randomUUID().slice(0, 8)}`;
const ids = baseOrgIds(PREFIX);
const RO_USER = `${PREFIX}-ro-user`;
const RO_MEMBER = `${PREFIX}-ro-member`;

const PERMISSION_DENIED_ERROR =
  "Wraps doesn't have permission to manage the suppression list on this account. Run `wraps platform update-role` to refresh permissions.";
const GENERIC_FAILURE = "Failed to add suppression";
const FORBIDDEN_TEXT = "You don't have permission to perform this action";

const A_ACCOUNT_ENTRIES = [
  { EmailAddress: "bounce-a@example.com", Reason: "BOUNCE" as const },
  { EmailAddress: "complaint-a@example.com", Reason: "COMPLAINT" as const },
];

function resetSes() {
  const at = new Date("2026-10-01T00:00:00.000Z");
  sesState.store = new Map([
    [
      ids.awsAccount,
      A_ACCOUNT_ENTRIES.map((e) => ({ ...e, LastUpdateTime: at })),
    ],
    [
      ids.otherAwsAccount,
      [
        {
          EmailAddress: "bounce-b@example.com",
          Reason: "BOUNCE",
          LastUpdateTime: at,
        },
      ],
    ],
  ]);
  sesState.calls = [];
  sesState.denied = new Set();
  sesState.deniedPut = new Set();
  sesState.failing = new Set();
}

function notFound(): Error {
  return Object.assign(new Error("NotFoundException: not on the list"), {
    name: "NotFoundException",
  });
}

function accessDenied(): Error {
  return Object.assign(new Error("AccessDeniedException: denied"), {
    name: "AccessDeniedException",
  });
}

function throttled(): Error {
  return Object.assign(new Error("ThrottlingException: slow down"), {
    name: "ThrottlingException",
  });
}

function fakeSend(
  accountId: string,
  command: { kind: string; input: Record<string, unknown> }
) {
  sesState.calls.push({ accountId, kind: command.kind, input: command.input });
  if (sesState.denied.has(accountId)) {
    throw accessDenied();
  }
  if (command.kind === "put" && sesState.deniedPut.has(accountId)) {
    throw accessDenied();
  }
  const list = sesState.store.get(accountId) ?? [];

  if (command.kind === "list") {
    return { SuppressedDestinationSummaries: [], NextToken: undefined };
  }

  const email = command.input.EmailAddress as string;
  if (sesState.failing.has(email)) {
    throw throttled();
  }
  const index = list.findIndex((e) => e.EmailAddress === email);
  if (command.kind === "get") {
    if (index < 0) {
      throw notFound();
    }
    return { SuppressedDestination: list[index] };
  }
  if (command.kind === "put") {
    const Reason = command.input.Reason as string;
    const LastUpdateTime = new Date("2026-10-31T00:00:00.000Z");
    if (index >= 0) {
      list[index] = { EmailAddress: email, Reason, LastUpdateTime };
    } else {
      list.push({ EmailAddress: email, Reason, LastUpdateTime });
    }
    sesState.store.set(accountId, list);
    return {};
  }
  if (command.kind === "delete") {
    if (index < 0) {
      throw notFound();
    }
    list.splice(index, 1);
    return {};
  }
  throw new Error(`unexpected SES command ${command.kind}`);
}

function appFor(organizationId: string, userId: string) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId: "pro" },
    }))
    .use(suppressionsRoutes);
}

/** An API key with the given scopes, acting in `organizationId`. */
function appForKey(organizationId: string, scopes: string[]) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: {
        apiKeyId: `key-${PREFIX}`,
        organizationId,
        userId: ids.user,
        planId: "pro",
        apiKeyScopes: scopes,
      },
    }))
    .use(suppressionsRoutes);
}

async function call(
  app: { handle: (r: Request) => Promise<Response> },
  method: string,
  path: string,
  body?: unknown
) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const json = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body: json };
}

function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

/** A unique address per call, so tests never share a contact or SES entry. */
function uniqueEmail(label: string): string {
  return `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

async function seedContact(
  organizationId: string,
  email: string,
  emailStatus: string
) {
  const now = new Date();
  await db.insert(contact).values({
    id: `${PREFIX}-c-${crypto.randomUUID().slice(0, 8)}`,
    organizationId,
    email,
    emailHash: hashEmail(email),
    firstName: "Test",
    lastName: "Contact",
    emailStatus,
    status: "active",
    createdAt: now,
    updatedAt: now,
  } as typeof contact.$inferInsert);
}

async function contactStatus(organizationId: string, email: string) {
  const rows = await db
    .select({ emailStatus: contact.emailStatus })
    .from(contact)
    .where(
      and(
        eq(contact.organizationId, organizationId),
        eq(contact.emailHash, hashEmail(email))
      )
    );
  return rows[0]?.emailStatus;
}

/** Emails the fake SES holds for an account, in SES order. */
function suppressedOn(accountId: string): string[] {
  return (sesState.store.get(accountId) ?? []).map((e) => e.EmailAddress);
}

function reasonOn(accountId: string, email: string): string | undefined {
  return (sesState.store.get(accountId) ?? []).find(
    (e) => e.EmailAddress === email
  )?.Reason;
}

function putCalls() {
  return sesState.calls.filter((c) => c.kind === "put");
}

async function auditRowsFor(organizationId: string) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.organizationId, organizationId));
}

async function clearAudit() {
  await db
    .delete(auditLog)
    .where(inArray(auditLog.organizationId, [ids.org, ids.otherOrg]));
}

beforeAll(async () => {
  await seedBaseOrg(PREFIX);
  const now = new Date();
  await db.insert(user).values({
    id: RO_USER,
    email: `${RO_USER}@example.com`,
    name: "Read Only",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  } as typeof user.$inferInsert);
  await db.insert(member).values({
    id: RO_MEMBER,
    organizationId: ids.org,
    userId: RO_USER,
    role: "read-only",
    createdAt: now,
  } as typeof member.$inferInsert);
});

beforeEach(() => {
  resetSes();
  getCredentialsMock.mockReset();
  getCredentialsMock.mockImplementation(async (awsAccountId: string) => ({
    accessKeyId: `AKIA${awsAccountId}`,
    secretAccessKey: "test-secret",
    sessionToken: "test-token",
    expiration: new Date(Date.now() + 3600_000),
    region: "us-east-1",
  }));
  sesSendMock.mockReset();
  sesSendMock.mockImplementation(async (accountId: string, command) =>
    fakeSend(accountId, command)
  );
});

afterAll(async () => {
  await clearAudit();
  await db.delete(member).where(eq(member.id, RO_MEMBER));
  await db.delete(user).where(eq(user.id, RO_USER));
  await cleanupBaseOrg(PREFIX);
});

describe("single add", () => {
  it("adds an address: SES put with the normalized address, contact suppressed, audit row written", async () => {
    const app = appFor(ids.org, ids.user);
    const email = uniqueEmail("fresh");
    await seedContact(ids.org, email, "active");

    const { status, body } = await call(app, "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email: `  ${email.toUpperCase()}  `,
      reason: "BOUNCE",
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      email,
      awsAccountId: ids.awsAccount,
      alreadyPresent: false,
    });
    expect(putCalls()).toHaveLength(1);
    expect(putCalls()[0]).toMatchObject({
      accountId: ids.awsAccount,
      input: { EmailAddress: email, Reason: "BOUNCE" },
    });
    expect(suppressedOn(ids.awsAccount)).toContain(email);
    expect(await contactStatus(ids.org, email)).toBe("suppressed");

    const rows = await auditRowsFor(ids.org);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "suppression.added",
      resource: "suppression",
      resourceId: email,
      userId: ids.user,
      actorEmail: `${PREFIX}@example.com`,
      metadata: {
        email,
        reason: "BOUNCE",
        awsAccountId: ids.awsAccount,
        source: "manual",
        contactSuppressed: true,
      },
    });
    await clearAudit();
  });

  it("writes the COMPLAINT reason when asked for one", async () => {
    const app = appFor(ids.org, ids.user);
    const email = uniqueEmail("complained");

    const { status } = await call(app, "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "COMPLAINT",
    });

    expect(status).toBe(200);
    expect(putCalls()[0]?.input).toEqual({
      EmailAddress: email,
      Reason: "COMPLAINT",
    });
    expect(reasonOn(ids.awsAccount, email)).toBe("COMPLAINT");
    await clearAudit();
  });

  it("already present: alreadyPresent true, no put and no audit row, contact still kept in step", async () => {
    const app = appFor(ids.org, ids.user);
    const email = "bounce-a@example.com";
    await seedContact(ids.org, email, "active");

    const { status, body } = await call(app, "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      email,
      awsAccountId: ids.awsAccount,
      alreadyPresent: true,
    });
    expect(putCalls()).toEqual([]);
    expect(await contactStatus(ids.org, email)).toBe("suppressed");
    expect(await auditRowsFor(ids.org)).toHaveLength(0);
  });

  it("does not weaken a COMPLAINT on the list to BOUNCE", async () => {
    const app = appFor(ids.org, ids.user);
    const email = "complaint-a@example.com";

    const { status, body } = await call(app, "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(status).toBe(200);
    expect(body.alreadyPresent).toBe(true);
    expect(putCalls()).toEqual([]);
    expect(reasonOn(ids.awsAccount, email)).toBe("COMPLAINT");
  });

  it("upgrades a BOUNCE on the list to COMPLAINT", async () => {
    const app = appFor(ids.org, ids.user);
    const email = "bounce-a@example.com";

    const { status, body } = await call(app, "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "COMPLAINT",
    });

    expect(status).toBe(200);
    expect(body.alreadyPresent).toBe(false);
    expect(putCalls()[0]?.input).toEqual({
      EmailAddress: email,
      Reason: "COMPLAINT",
    });
    expect(reasonOn(ids.awsAccount, email)).toBe("COMPLAINT");
    await clearAudit();
  });

  it("refuses an invalid address or reason with 400 and makes no SES call", async () => {
    const app = appFor(ids.org, ids.user);
    const cases: [unknown, string][] = [
      ["", "Enter an email address."],
      ["no-at-sign.example.com", "Enter an email address."],
      ["a@b", "Enter a valid email address."],
      [`${"a".repeat(250)}@example.com`, "Enter a valid email address."],
    ];

    for (const [email, message] of cases) {
      const { status, body } = await call(app, "POST", "/v1/suppressions", {
        awsAccountId: ids.awsAccount,
        email,
        reason: "BOUNCE",
      });
      expect(status).toBe(400);
      expect(body.error).toBe(message);
    }

    const badReason = await call(app, "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email: uniqueEmail("badreason"),
      reason: "SPAM",
    });
    expect(badReason.status).toBe(400);
    expect(badReason.body.error).toBe("Reason must be BOUNCE or COMPLAINT.");

    expect(sesState.calls).toEqual([]);
    expect(await auditRowsFor(ids.org)).toHaveLength(0);
  });

  it("returns 403 with the permission text when SES denies the read, and nothing changes", async () => {
    sesState.denied.add(ids.awsAccount);
    const app = appFor(ids.org, ids.user);
    const email = uniqueEmail("denied");
    await seedContact(ids.org, email, "active");

    const { status, body } = await call(app, "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(status).toBe(403);
    expect(body.error).toBe(PERMISSION_DENIED_ERROR);
    expect(putCalls()).toEqual([]);
    expect(suppressedOn(ids.awsAccount)).not.toContain(email);
    expect(await contactStatus(ids.org, email)).toBe("active");
    expect(await auditRowsFor(ids.org)).toHaveLength(0);
  });

  it("returns 403 with the permission text when SES denies only the put", async () => {
    sesState.deniedPut.add(ids.awsAccount);
    const app = appFor(ids.org, ids.user);
    const email = uniqueEmail("put-denied");
    await seedContact(ids.org, email, "active");

    const { status, body } = await call(app, "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(status).toBe(403);
    expect(body.error).toBe(PERMISSION_DENIED_ERROR);
    expect(putCalls()).toHaveLength(1);
    expect(suppressedOn(ids.awsAccount)).not.toContain(email);
    expect(await contactStatus(ids.org, email)).toBe("active");
    expect(await auditRowsFor(ids.org)).toHaveLength(0);
  });

  it("returns 502 for a non-denial SES error, with no audit row and no put", async () => {
    const app = appFor(ids.org, ids.user);
    const email = uniqueEmail("throttled");
    sesState.failing.add(email);

    const { status, body } = await call(app, "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(status).toBe(502);
    expect(body.error).toBe(GENERIC_FAILURE);
    expect(putCalls()).toEqual([]);
    expect(await auditRowsFor(ids.org)).toHaveLength(0);
  });

  it("a read-only member gets 403 and nothing changes", async () => {
    const app = appFor(ids.org, RO_USER);
    const email = uniqueEmail("ro");

    const { status, body } = await call(app, "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(status).toBe(403);
    expect(body.error).toBe(FORBIDDEN_TEXT);
    expect(sesState.calls).toEqual([]);
    expect(await auditRowsFor(ids.org)).toHaveLength(0);
  });

  it("an API key without contacts:write gets 403; with it, the add succeeds", async () => {
    const email = uniqueEmail("keyscope");

    const refused = await call(
      appForKey(ids.org, ["contacts:read"]),
      "POST",
      "/v1/suppressions",
      { awsAccountId: ids.awsAccount, email, reason: "BOUNCE" }
    );
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe(FORBIDDEN_TEXT);
    expect(sesState.calls).toEqual([]);

    const allowed = await call(
      appForKey(ids.org, ["contacts:write"]),
      "POST",
      "/v1/suppressions",
      { awsAccountId: ids.awsAccount, email, reason: "BOUNCE" }
    );
    expect(allowed.status).toBe(200);
    expect(allowed.body.alreadyPresent).toBe(false);
    await clearAudit();
  });
});

describe("bulk add", () => {
  it("returns one result per entry in request order, with the batch's rules applied to each", async () => {
    const app = appFor(ids.org, ids.user);
    const fresh = uniqueEmail("bulk-fresh");
    const other = uniqueEmail("bulk-other");

    const { status, body } = await call(app, "POST", "/v1/suppressions/bulk", {
      entries: [
        { awsAccountId: ids.awsAccount, email: fresh, reason: "BOUNCE" },
        { awsAccountId: ids.awsAccount, email: "nope", reason: "BOUNCE" },
        {
          awsAccountId: ids.awsAccount,
          email: "bounce-a@example.com",
          reason: "BOUNCE",
        },
        {
          awsAccountId: ids.awsAccount,
          email: `  ${other.toUpperCase()} `,
          reason: "COMPLAINT",
        },
        {
          awsAccountId: ids.awsAccount,
          email: uniqueEmail("spam"),
          reason: "SPAM",
        },
      ],
    });

    expect(status).toBe(200);
    expect(body.results).toEqual([
      { email: fresh, success: true, alreadyPresent: false },
      { email: "nope", success: false, error: "Enter an email address." },
      { email: "bounce-a@example.com", success: true, alreadyPresent: true },
      {
        email: `  ${other.toUpperCase()} `,
        success: true,
        alreadyPresent: false,
      },
      expect.objectContaining({
        success: false,
        error: "Reason must be BOUNCE or COMPLAINT.",
      }),
    ]);
    expect(suppressedOn(ids.awsAccount)).toEqual(
      expect.arrayContaining([fresh, other.toLowerCase()])
    );
    expect(suppressedOn(ids.awsAccount)).not.toContain("nope");
    expect(reasonOn(ids.awsAccount, other.toLowerCase())).toBe("COMPLAINT");
    // Only the two real adds write audit rows; the already-present one does not.
    expect(await auditRowsFor(ids.org)).toHaveLength(2);
    await clearAudit();
  });

  it("one entry whose SES call throws does not fail the others", async () => {
    const app = appFor(ids.org, ids.user);
    const ok1 = uniqueEmail("ok1");
    const boom = uniqueEmail("boom");
    const ok2 = uniqueEmail("ok2");
    sesState.failing.add(boom);

    const { status, body } = await call(app, "POST", "/v1/suppressions/bulk", {
      entries: [
        { awsAccountId: ids.awsAccount, email: ok1, reason: "BOUNCE" },
        { awsAccountId: ids.awsAccount, email: boom, reason: "BOUNCE" },
        { awsAccountId: ids.awsAccount, email: ok2, reason: "BOUNCE" },
      ],
    });

    expect(status).toBe(200);
    expect(body.results).toEqual([
      { email: ok1, success: true, alreadyPresent: false },
      { email: boom, success: false, error: GENERIC_FAILURE },
      { email: ok2, success: true, alreadyPresent: false },
    ]);
    expect(suppressedOn(ids.awsAccount)).toEqual(
      expect.arrayContaining([ok1, ok2])
    );
    expect(suppressedOn(ids.awsAccount)).not.toContain(boom);
    await clearAudit();
  });

  it("an account whose put is denied fails each of its entries with the permission text", async () => {
    sesState.deniedPut.add(ids.awsAccount);
    const app = appFor(ids.org, ids.user);
    const first = uniqueEmail("denied-1");
    const second = uniqueEmail("denied-2");

    const { status, body } = await call(app, "POST", "/v1/suppressions/bulk", {
      entries: [
        { awsAccountId: ids.awsAccount, email: first, reason: "BOUNCE" },
        { awsAccountId: ids.awsAccount, email: second, reason: "BOUNCE" },
      ],
    });

    expect(status).toBe(200);
    expect(body.results).toEqual([
      { email: first, success: false, error: PERMISSION_DENIED_ERROR },
      { email: second, success: false, error: PERMISSION_DENIED_ERROR },
    ]);
    expect(suppressedOn(ids.awsAccount)).not.toContain(first);
    expect(await auditRowsFor(ids.org)).toHaveLength(0);
  });

  it("more than 100 entries gives 400 and no SES call", async () => {
    const app = appFor(ids.org, ids.user);
    const entries = Array.from({ length: 101 }, (_, i) => ({
      awsAccountId: ids.awsAccount,
      email: `many-${i}-${PREFIX}@example.com`,
      reason: "BOUNCE",
    }));

    const { status, body } = await call(app, "POST", "/v1/suppressions/bulk", {
      entries,
    });

    expect(status).toBe(400);
    expect(body.error).toBe("Suppress at most 100 addresses at a time.");
    expect(sesState.calls).toEqual([]);
  });

  it("exactly 100 entries is accepted", async () => {
    const app = appFor(ids.org, ids.user);
    const entries = Array.from({ length: 100 }, (_, i) => ({
      awsAccountId: ids.awsAccount,
      email: `cap-${i}-${PREFIX}@example.com`,
      reason: "BOUNCE",
    }));

    const { status, body } = await call(app, "POST", "/v1/suppressions/bulk", {
      entries,
    });

    expect(status).toBe(200);
    expect(body.results).toHaveLength(100);
    expect(
      (body.results as { success: boolean }[]).every((r) => r.success)
    ).toBe(true);
    await clearAudit();
  });

  it("an empty list gives 400 and no SES call", async () => {
    const app = appFor(ids.org, ids.user);

    const { status, body } = await call(app, "POST", "/v1/suppressions/bulk", {
      entries: [],
    });

    expect(status).toBe(400);
    expect(body.error).toBe("Choose at least one address.");
    expect(sesState.calls).toEqual([]);
  });

  it("a read-only member gets 403 and nothing changes", async () => {
    const app = appFor(ids.org, RO_USER);
    const email = uniqueEmail("ro-bulk");

    const { status, body } = await call(app, "POST", "/v1/suppressions/bulk", {
      entries: [{ awsAccountId: ids.awsAccount, email, reason: "BOUNCE" }],
    });

    expect(status).toBe(403);
    expect(body.error).toBe(FORBIDDEN_TEXT);
    expect(sesState.calls).toEqual([]);
  });

  it("an API key without contacts:write gets 403", async () => {
    const { status, body } = await call(
      appForKey(ids.org, ["contacts:read"]),
      "POST",
      "/v1/suppressions/bulk",
      {
        entries: [
          {
            awsAccountId: ids.awsAccount,
            email: uniqueEmail("key-bulk"),
            reason: "BOUNCE",
          },
        ],
      }
    );

    expect(status).toBe(403);
    expect(body.error).toBe(FORBIDDEN_TEXT);
    expect(sesState.calls).toEqual([]);
  });
});

describe("org isolation", () => {
  it("single add with org B's awsAccountId gets 404, SES is never called, and B's contact and audit are unchanged", async () => {
    const app = appFor(ids.org, ids.user);
    const email = uniqueEmail("iso-single");
    await seedContact(ids.otherOrg, email, "active");

    const { status, body } = await call(app, "POST", "/v1/suppressions", {
      awsAccountId: ids.otherAwsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(status).toBe(404);
    expect(body.error).toBe("AWS account not found");
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(sesSendMock).not.toHaveBeenCalled();
    expect(suppressedOn(ids.otherAwsAccount)).not.toContain(email);
    expect(await contactStatus(ids.otherOrg, email)).toBe("active");
    expect(await auditRowsFor(ids.otherOrg)).toHaveLength(0);
  });

  it("bulk entry with org B's awsAccountId fails with AWS account not found, and no SES call is made for it", async () => {
    const app = appFor(ids.org, ids.user);
    const mine = uniqueEmail("iso-mine");
    const theirs = uniqueEmail("iso-theirs");
    const mineAfter = uniqueEmail("iso-mine-after");
    await seedContact(ids.otherOrg, theirs, "active");

    const { status, body } = await call(app, "POST", "/v1/suppressions/bulk", {
      entries: [
        { awsAccountId: ids.awsAccount, email: mine, reason: "BOUNCE" },
        { awsAccountId: ids.otherAwsAccount, email: theirs, reason: "BOUNCE" },
        { awsAccountId: ids.awsAccount, email: mineAfter, reason: "BOUNCE" },
      ],
    });

    expect(status).toBe(200);
    expect(body.results).toEqual([
      { email: mine, success: true, alreadyPresent: false },
      { email: theirs, success: false, error: "AWS account not found" },
      { email: mineAfter, success: true, alreadyPresent: false },
    ]);
    expect(
      sesState.calls.some((c) => c.accountId === ids.otherAwsAccount)
    ).toBe(false);
    expect(
      getCredentialsMock.mock.calls.some(
        ([accountId]) => accountId === ids.otherAwsAccount
      )
    ).toBe(false);
    expect(suppressedOn(ids.otherAwsAccount)).not.toContain(theirs);
    expect(await contactStatus(ids.otherOrg, theirs)).toBe("active");
    expect(await auditRowsFor(ids.otherOrg)).toHaveLength(0);
    await clearAudit();
  });
});
