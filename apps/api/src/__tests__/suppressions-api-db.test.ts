/**
 * GET /v1/suppressions and DELETE /v1/suppressions/:email on a mounted app,
 * against the real database. SES and the AssumeRole path are mocked, so no
 * AWS call is made. The fake SES holds an in-memory suppression list per AWS
 * account, so "unchanged" can be checked by reading it back.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mock).
 */

import { swagger } from "@elysiajs/swagger";
import { auditLog, db, eq, member, user } from "@wraps/db";
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
  baseOrgIds,
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { INVALID_CURSOR_MESSAGE } from "../lib/cursor";
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
}));

const getCredentialsMock = vi.hoisted(() => vi.fn());
const sesSendMock = vi.hoisted(() => vi.fn());

// The API's assume-role helper. Returns creds whose accessKeyId carries the
// AWS account id, so the fake SES client knows which account it is talking to.
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
  class DeleteSuppressedDestinationCommand {
    readonly kind = "delete";
    constructor(readonly input: Record<string, unknown>) {}
  }
  return {
    SESv2Client,
    ListSuppressedDestinationsCommand,
    GetSuppressedDestinationCommand,
    DeleteSuppressedDestinationCommand,
  };
});

const { suppressionsRoutes } = await import("../routes/suppressions");

// PREFIX seeds the org graph. It is 16 characters, so it fits a path param.
const PREFIX = `t2x-t22-${crypto.randomUUID().slice(0, 8)}`;
const ids = baseOrgIds(PREFIX);
const RO_USER = `${PREFIX}-ro-user`;
const RO_MEMBER = `${PREFIX}-ro-member`;
const STRANGER = `${PREFIX}-stranger`;

const A_ACCOUNT_ENTRIES = [
  { EmailAddress: "bounce-a@example.com", Reason: "BOUNCE" as const },
  { EmailAddress: "complaint-a@example.com", Reason: "COMPLAINT" as const },
  { EmailAddress: "plus+tag@example.com", Reason: "BOUNCE" as const },
];
const B_ACCOUNT_ENTRIES = [
  { EmailAddress: "bounce-b@example.com", Reason: "BOUNCE" as const },
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
      B_ACCOUNT_ENTRIES.map((e) => ({ ...e, LastUpdateTime: at })),
    ],
  ]);
  sesState.calls = [];
  sesState.denied = new Set();
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

function fakeSend(
  accountId: string,
  command: { kind: string; input: Record<string, unknown> }
) {
  sesState.calls.push({ accountId, kind: command.kind, input: command.input });
  if (sesState.denied.has(accountId)) {
    throw accessDenied();
  }
  const list = sesState.store.get(accountId) ?? [];

  if (command.kind === "list") {
    const pageSize = command.input.PageSize as number;
    const reasons = command.input.Reasons as string[] | undefined;
    const token = command.input.NextToken as string | undefined;
    const filtered = list.filter((e) => !reasons || reasons.includes(e.Reason));
    const start = token ? Number(token) : 0;
    const slice = filtered.slice(start, start + pageSize);
    // Like SES: a NextToken comes back on the last non-empty page too.
    return {
      SuppressedDestinationSummaries: slice,
      NextToken: slice.length > 0 ? String(start + slice.length) : undefined,
    };
  }

  const email = command.input.EmailAddress as string;
  const index = list.findIndex((e) => e.EmailAddress === email);
  if (command.kind === "get") {
    if (index < 0) {
      throw notFound();
    }
    return { SuppressedDestination: list[index] };
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

async function call(
  app: { handle: (r: Request) => Promise<Response> },
  method: string,
  path: string
) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, { method })
  );
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

/** Emails the fake SES still holds for an account, in SES order. */
function suppressedOn(accountId: string): string[] {
  return (sesState.store.get(accountId) ?? []).map((e) => e.EmailAddress);
}

function removePath(email: string, query: string) {
  return `/v1/suppressions/${encodeURIComponent(email)}?${query}`;
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

describe("list", () => {
  it("returns the org's account entries with pinned values", async () => {
    const app = appFor(ids.org, ids.user);
    const { status, body } = await call(app, "GET", "/v1/suppressions");

    expect(status).toBe(200);
    expect(body.entries).toEqual([
      {
        email: "bounce-a@example.com",
        reason: "BOUNCE",
        lastUpdated: "2026-10-01T00:00:00.000Z",
        awsAccountId: ids.awsAccount,
        region: "us-east-1",
      },
      {
        email: "complaint-a@example.com",
        reason: "COMPLAINT",
        lastUpdated: "2026-10-01T00:00:00.000Z",
        awsAccountId: ids.awsAccount,
        region: "us-east-1",
      },
      {
        email: "plus+tag@example.com",
        reason: "BOUNCE",
        lastUpdated: "2026-10-01T00:00:00.000Z",
        awsAccountId: ids.awsAccount,
        region: "us-east-1",
      },
    ]);
    // SES returns a NextToken on its last non-empty page too, so hasMore reads
    // true once here and the next page is empty (the lifted source behavior;
    // see the pagination test below).
    expect(body.hasMore).toBe(true);
    expect(body.deniedAccountIds).toEqual([]);
    expect(body.unreachableAccountIds).toEqual([]);
  });

  it("pages through every entry exactly once with the cursor", async () => {
    const app = appFor(ids.org, ids.user);

    const first = await call(app, "GET", "/v1/suppressions?limit=2");
    expect(first.status).toBe(200);
    expect(
      (first.body.entries as { email: string }[]).map((e) => e.email)
    ).toEqual(["bounce-a@example.com", "complaint-a@example.com"]);
    expect(typeof first.body.nextCursor).toBe("string");

    const cursor = encodeURIComponent(first.body.nextCursor as string);
    const second = await call(
      app,
      "GET",
      `/v1/suppressions?limit=2&cursor=${cursor}`
    );
    expect(second.status).toBe(200);
    expect(
      (second.body.entries as { email: string }[]).map((e) => e.email)
    ).toEqual(["plus+tag@example.com"]);
    // The fake SES returns a token on its last non-empty page, so one more
    // page is requested. It is empty and ends the listing.
    expect(second.body.hasMore).toBe(true);

    const third = await call(
      app,
      "GET",
      `/v1/suppressions?limit=2&cursor=${encodeURIComponent(second.body.nextCursor as string)}`
    );
    expect(third.body.entries).toEqual([]);
    expect(third.body.hasMore).toBe(false);
    expect(third.body.nextCursor).toBeUndefined();
  });

  it("passes the reason filter through to SES", async () => {
    const app = appFor(ids.org, ids.user);
    const { status, body } = await call(
      app,
      "GET",
      "/v1/suppressions?reason=COMPLAINT"
    );

    expect(status).toBe(200);
    expect((body.entries as { email: string }[]).map((e) => e.email)).toEqual([
      "complaint-a@example.com",
    ]);
    const listCall = sesState.calls.find((c) => c.kind === "list");
    expect(listCall?.input.Reasons).toEqual(["COMPLAINT"]);
  });

  it("lists one account when awsAccountId is given and it is in the org", async () => {
    const app = appFor(ids.org, ids.user);
    const { status, body } = await call(
      app,
      "GET",
      `/v1/suppressions?awsAccountId=${ids.awsAccount}`
    );

    expect(status).toBe(200);
    expect(body.entries).toHaveLength(3);
    expect(sesState.calls.every((c) => c.accountId === ids.awsAccount)).toBe(
      true
    );
  });

  it("returns 400 with the cursor error text for a cursor that does not decode", async () => {
    const app = appFor(ids.org, ids.user);
    const notJson = Buffer.from("not json at all").toString("base64url");
    const notObject = Buffer.from('"just a string"').toString("base64url");
    const badValues = Buffer.from('{"a":1}').toString("base64url");

    for (const cursor of ["!!!", notJson, notObject, badValues]) {
      const { status, body } = await call(
        app,
        "GET",
        `/v1/suppressions?cursor=${encodeURIComponent(cursor)}`
      );
      expect(status).toBe(400);
      expect(body.error).toBe(INVALID_CURSOR_MESSAGE);
    }
    expect(sesState.calls).toEqual([]);
  });

  it("returns 403 to a user with no membership in the org", async () => {
    const app = appFor(ids.org, STRANGER);
    const { status, body } = await call(app, "GET", "/v1/suppressions");

    expect(status).toBe(403);
    expect(body.error).toBe("You don't have permission to perform this action");
    expect(sesState.calls).toEqual([]);
  });

  it("lets a read-only member list (awsAccounts:read)", async () => {
    const app = appFor(ids.org, RO_USER);
    const { status } = await call(app, "GET", "/v1/suppressions");
    expect(status).toBe(200);
  });
});

describe("remove", () => {
  it("removes an address, writes the audit row, and reports wasPresent", async () => {
    const app = appFor(ids.org, ids.user);
    const email = "bounce-a@example.com";
    const { status, body } = await call(
      app,
      "DELETE",
      removePath(email, `awsAccountId=${ids.awsAccount}&confirm=true`)
    );

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, email, wasPresent: true });
    expect(suppressedOn(ids.awsAccount)).not.toContain(email);

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.organizationId, ids.org));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "suppression.removed",
      resource: "suppression",
      resourceId: email,
      userId: ids.user,
      actorEmail: `${PREFIX}@example.com`,
      metadata: { email, reason: "BOUNCE", awsAccountId: ids.awsAccount },
    });
    await clearAudit();
  });

  it("round-trips an email containing + through the path", async () => {
    const app = appFor(ids.org, ids.user);
    const email = "plus+tag@example.com";
    const { status, body } = await call(
      app,
      "DELETE",
      removePath(email, `awsAccountId=${ids.awsAccount}&confirm=true`)
    );

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, email, wasPresent: true });
    const deleteCall = sesState.calls.find((c) => c.kind === "delete");
    expect(deleteCall?.input).toEqual({ EmailAddress: email });
    await clearAudit();
  });

  it("refuses without confirm=true and touches nothing", async () => {
    const app = appFor(ids.org, ids.user);
    const email = "bounce-a@example.com";
    const { status, body } = await call(
      app,
      "DELETE",
      removePath(email, `awsAccountId=${ids.awsAccount}`)
    );

    expect(status).toBe(400);
    expect(body.error).toContain("Confirmation required: pass confirm=true");
    expect(sesState.calls).toEqual([]);
    expect(suppressedOn(ids.awsAccount)).toContain(email);
  });

  it("returns 404 with the not-on-list text when the address is absent", async () => {
    const app = appFor(ids.org, ids.user);
    const { status, body } = await call(
      app,
      "DELETE",
      removePath(
        "nobody@example.com",
        `awsAccountId=${ids.awsAccount}&confirm=true`
      )
    );

    expect(status).toBe(404);
    expect(body.error).toBe("This address is not on the suppression list.");
    expect(sesState.calls.some((c) => c.kind === "delete")).toBe(false);
  });

  it("refuses a complaint suppression without acknowledgedComplaint, with the spam text", async () => {
    const app = appFor(ids.org, ids.user);
    const email = "complaint-a@example.com";
    const refused = await call(
      app,
      "DELETE",
      removePath(email, `awsAccountId=${ids.awsAccount}&confirm=true`)
    );

    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe(
      "This address was suppressed because of a spam complaint. Confirm you understand before removing it."
    );
    expect(sesState.calls.some((c) => c.kind === "delete")).toBe(false);
    expect(suppressedOn(ids.awsAccount)).toContain(email);

    const allowed = await call(
      app,
      "DELETE",
      removePath(
        email,
        `awsAccountId=${ids.awsAccount}&confirm=true&acknowledgedComplaint=true`
      )
    );
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ success: true, email, wasPresent: true });
    await clearAudit();
  });

  it("returns 403 with the permission text when SES denies the read", async () => {
    sesState.denied.add(ids.awsAccount);
    const app = appFor(ids.org, ids.user);
    const email = "bounce-a@example.com";
    const { status, body } = await call(
      app,
      "DELETE",
      removePath(email, `awsAccountId=${ids.awsAccount}&confirm=true`)
    );

    expect(status).toBe(403);
    expect(body.error).toBe(
      "Wraps doesn't have permission to manage the suppression list on this account. Run `wraps platform update-role` to refresh permissions."
    );
    expect(sesState.calls.some((c) => c.kind === "delete")).toBe(false);
    expect(suppressedOn(ids.awsAccount)).toContain(email);
  });
});

describe("org isolation", () => {
  it("org A's list never includes org B's account entries", async () => {
    const app = appFor(ids.org, ids.user);
    const { status, body } = await call(app, "GET", "/v1/suppressions");

    expect(status).toBe(200);
    const emails = (
      body.entries as { email: string; awsAccountId: string }[]
    ).map((e) => e.email);
    expect(emails).not.toContain("bounce-b@example.com");
    expect(
      (body.entries as { awsAccountId: string }[]).every(
        (e) => e.awsAccountId === ids.awsAccount
      )
    ).toBe(true);
    expect(sesState.calls.map((c) => c.accountId)).not.toContain(
      ids.otherAwsAccount
    );
  });

  it("org A listing org B's awsAccountId gets 404 and SES is never called", async () => {
    const app = appFor(ids.org, ids.user);
    const { status, body } = await call(
      app,
      "GET",
      `/v1/suppressions?awsAccountId=${ids.otherAwsAccount}`
    );

    expect(status).toBe(404);
    expect(body.error).toBe("AWS account not found");
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(sesSendMock).not.toHaveBeenCalled();
  });

  it("org A removing from org B's awsAccountId gets 404, SES is never called, and B's entry is unchanged", async () => {
    const app = appFor(ids.org, ids.user);
    const email = "bounce-b@example.com";
    const { status, body } = await call(
      app,
      "DELETE",
      removePath(email, `awsAccountId=${ids.otherAwsAccount}&confirm=true`)
    );

    expect(status).toBe(404);
    expect(body.error).toBe("AWS account not found");
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(sesSendMock).not.toHaveBeenCalled();
    // Re-read B's list from the fake SES: the address is still there.
    expect(suppressedOn(ids.otherAwsAccount)).toEqual(["bounce-b@example.com"]);
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.organizationId, ids.otherOrg));
    expect(rows).toHaveLength(0);
  });
});

describe("permissions", () => {
  it("a read-only member gets 403 on remove and nothing changes", async () => {
    const app = appFor(ids.org, RO_USER);
    const email = "bounce-a@example.com";
    const { status, body } = await call(
      app,
      "DELETE",
      removePath(email, `awsAccountId=${ids.awsAccount}&confirm=true`)
    );

    expect(status).toBe(403);
    expect(body.error).toBe("You don't have permission to perform this action");
    expect(sesState.calls).toEqual([]);
    expect(suppressedOn(ids.awsAccount)).toContain(email);
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.organizationId, ids.org));
    expect(rows).toHaveLength(0);
  });
});

describe("openapi", () => {
  it("documents both routes in the spec", async () => {
    const app = new Elysia()
      .use(
        swagger({
          path: "/swagger",
          documentation: {},
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .use(suppressionsRoutes);
    const response = await app.handle(
      new Request("http://localhost/swagger/json")
    );
    expect(response.status).toBe(200);
    const spec = (await response.json()) as {
      paths: Record<string, Record<string, unknown>>;
    };

    // The "/" route under a prefix is documented with its trailing slash,
    // as segments' is. The bare path still answers (see the list tests).
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/v1/suppressions/",
      "/v1/suppressions/{email}",
    ]);
    expect(Object.keys(spec.paths["/v1/suppressions/"] ?? {})).toEqual(["get"]);
    expect(Object.keys(spec.paths["/v1/suppressions/{email}"] ?? {})).toEqual([
      "delete",
    ]);
  });
});
