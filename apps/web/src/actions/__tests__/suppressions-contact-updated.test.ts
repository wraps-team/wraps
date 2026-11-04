/**
 * contact_updated from the dashboard's suppression actions (plan 023b).
 *
 * addSuppression, addSuppressions and removeSuppression report the contacts
 * whose email status they changed through POST /v1/contacts/events/updated,
 * once per action, after the write. Nothing changed means no call. The audit
 * rows and the public result shapes are as before, and a failing call is
 * logged while the action still succeeds.
 *
 * Real rows in the test Postgres; AWS and the API are mocked. Fixture ids use
 * the `supp-cu-023b-*` prefix so this file cannot collide with any other.
 */

import {
  auditLog,
  awsAccount,
  contact,
  db,
  hashContactValue,
  member,
  organization,
  user,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
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
  addSuppression,
  addSuppressions,
  removeSuppression,
} from "../suppressions";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const PREFIX = "supp-cu-023b";
const SESSION_TOKEN = `${PREFIX}-session-token`;

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: "supp-cu-023b-user-1",
          email: "supp-cu-023b-user@example.com",
          name: "Suppression contact_updated user",
        },
        session: {
          id: "supp-cu-023b-session",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: "supp-cu-023b-user-1",
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "supp-cu-023b-session-token",
        },
      })),
    },
  },
}));

vi.mock("@/lib/aws/credential-cache", () => ({
  getOrAssumeRole: vi.fn(async () => ({
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    sessionToken: "session-token",
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Every action logger records into `logged`, so a test can see what ctx.log got.
const logged = vi.hoisted(() => ({
  calls: [] as { level: string; obj: unknown; msg?: string }[],
}));
vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger")>();
  const record = (level: string) => (obj: unknown, msg?: string) => {
    logged.calls.push({ level, obj, msg });
  };
  const recorder = {
    trace: record("trace"),
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    fatal: record("fatal"),
  };
  return {
    ...actual,
    createActionLogger: () => ({ ...recorder, child: () => recorder }),
  };
});

type SesCommand = { _type: string; input: Record<string, unknown> };
const ses = vi.hoisted(() => ({
  /** What GetSuppressedDestination finds per address; absent = NotFound. */
  existing: {} as Record<string, "BOUNCE" | "COMPLAINT">,
}));

vi.mock("@aws-sdk/client-sesv2", () => {
  function named(name: string) {
    const err = new Error(name);
    err.name = name;
    return err;
  }
  return {
    SESv2Client: class {
      send(command: SesCommand) {
        const address = command.input.EmailAddress as string;
        if (command._type === "GetSuppressedDestinationCommand") {
          const reason = ses.existing[address];
          if (!reason) {
            return Promise.reject(named("NotFoundException"));
          }
          return Promise.resolve({
            SuppressedDestination: {
              EmailAddress: address,
              Reason: reason,
              LastUpdateTime: new Date("2026-01-01T00:00:00Z"),
            },
          });
        }
        return Promise.resolve({});
      }
    },
    GetSuppressedDestinationCommand: class {
      _type = "GetSuppressedDestinationCommand";
      input: Record<string, unknown>;
      constructor(input: Record<string, unknown>) {
        this.input = input;
      }
    },
    DeleteSuppressedDestinationCommand: class {
      _type = "DeleteSuppressedDestinationCommand";
      input: Record<string, unknown>;
      constructor(input: Record<string, unknown>) {
        this.input = input;
      }
    },
    PutSuppressedDestinationCommand: class {
      _type = "PutSuppressedDestinationCommand";
      input: Record<string, unknown>;
      constructor(input: Record<string, unknown>) {
        this.input = input;
      }
    },
  };
});

// ─── The API ────────────────────────────────────────────────────────────────

const API_URL = "http://api.test";
type ApiCall = { url: string; init: RequestInit };
const apiCalls: ApiCall[] = [];
let apiStatus = 200;
const originalFetch = globalThis.fetch;

/** The contacts each call reported, sorted, one array per call. */
function reportedContacts(): string[][] {
  return apiCalls.map((call) => {
    const body = JSON.parse(call.init.body as string) as {
      contacts: { contactId: string; updatedFields: string[] }[];
    };
    for (const item of body.contacts) {
      expect(item.updatedFields).toEqual(["emailStatus"]);
    }
    return body.contacts.map((item) => item.contactId).sort();
  });
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const testUser = {
  id: `${PREFIX}-user-1`,
  email: `${PREFIX}-user@example.com`,
  name: "Suppression contact_updated user",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${PREFIX}-org-1`,
  name: "Suppression contact_updated org",
  slug: `${PREFIX}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: `${PREFIX}-member-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testAwsAccount = {
  id: `${PREFIX}-aws-1`,
  organizationId: testOrg.id,
  name: "Suppression contact_updated AWS",
  accountId: "333333333333",
  region: "us-east-1",
  roleArn: "arn:aws:iam::333333333333:role/WrapsRole",
  externalId: `${PREFIX}-external-id-1`,
  isVerified: true,
  lastVerifiedAt: new Date(),
  createdBy: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  webhookSecret: null,
};

async function seedContact(
  email: string,
  emailStatus: "active" | "suppressed" | "bounced" | null
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(contact).values({
    id,
    organizationId: testOrg.id,
    email,
    emailHash: hashContactValue(email),
    emailStatus,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  });
  return id;
}

async function auditMetadata(
  action: "suppression.added" | "suppression.removed"
) {
  const rows = await db
    .select({ metadata: auditLog.metadata })
    .from(auditLog)
    .where(
      and(eq(auditLog.organizationId, testOrg.id), eq(auditLog.action, action))
    );
  return rows.map((row) => row.metadata);
}

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(organization)
    .values(testOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrg.name },
    });
  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });
  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });
});

afterAll(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

beforeEach(async () => {
  ses.existing = {};
  apiCalls.length = 0;
  apiStatus = 200;
  logged.calls.length = 0;
  vi.stubEnv("NEXT_PUBLIC_API_URL", API_URL);
  vi.stubGlobal("fetch", (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url instanceof Request ? url.url : String(url);
    // Exact origin, not a prefix: "http://api.test.example" is another host.
    if (new URL(urlStr).origin === API_URL) {
      apiCalls.push({ url: urlStr, init: init ?? {} });
      return Promise.resolve(
        Response.json({ accepted: 1 }, { status: apiStatus })
      );
    }
    return originalFetch(url as RequestInfo, init);
  });
  await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ─── addSuppression ─────────────────────────────────────────────────────────

describe("addSuppression reports contact_updated", () => {
  it("a contact whose status changed is reported once, with the session and org headers", async () => {
    const id = await seedContact(`${PREFIX}-add@example.com`, "active");

    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      `${PREFIX}-add@example.com`,
      "BOUNCE"
    );

    expect(result).toEqual({
      success: true,
      email: `${PREFIX}-add@example.com`,
      alreadyPresent: false,
    });
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0].url).toBe(`${API_URL}/v1/contacts/events/updated`);
    const headers = new Headers(apiCalls[0].init.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${SESSION_TOKEN}`);
    expect(headers.get("X-Organization-Id")).toBe(testOrg.id);
    expect(reportedContacts()).toEqual([[id]]);
    expect(await auditMetadata("suppression.added")).toEqual([
      expect.objectContaining({ contactSuppressed: true }),
    ]);
  });

  it("an already-suppressed contact is not reported", async () => {
    await seedContact(`${PREFIX}-already@example.com`, "suppressed");

    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      `${PREFIX}-already@example.com`,
      "BOUNCE"
    );

    expect(result).toMatchObject({ success: true, alreadyPresent: false });
    expect(apiCalls).toHaveLength(0);
    expect(await auditMetadata("suppression.added")).toEqual([
      expect.objectContaining({ contactSuppressed: false }),
    ]);
  });

  it("an address with no contact makes no call", async () => {
    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      `${PREFIX}-nobody@example.com`,
      "BOUNCE"
    );

    expect(result).toMatchObject({ success: true });
    expect(apiCalls).toHaveLength(0);
  });

  it("already on the SES list with an active contact: the contact is still reported", async () => {
    ses.existing[`${PREFIX}-present@example.com`] = "BOUNCE";
    const id = await seedContact(`${PREFIX}-present@example.com`, "active");

    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      `${PREFIX}-present@example.com`,
      "BOUNCE"
    );

    expect(result).toEqual({
      success: true,
      email: `${PREFIX}-present@example.com`,
      alreadyPresent: true,
    });
    expect(reportedContacts()).toEqual([[id]]);
  });

  it("a failing call is logged and the action still succeeds", async () => {
    apiStatus = 500;
    const id = await seedContact(`${PREFIX}-fails@example.com`, "active");

    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      `${PREFIX}-fails@example.com`,
      "BOUNCE"
    );

    expect(result).toEqual({
      success: true,
      email: `${PREFIX}-fails@example.com`,
      alreadyPresent: false,
    });
    expect(reportedContacts()).toEqual([[id]]);
    expect(logged.calls).toContainEqual(
      expect.objectContaining({
        level: "error",
        obj: expect.objectContaining({ failure: "status", status: 500 }),
      })
    );
    const [row] = await db
      .select({ emailStatus: contact.emailStatus })
      .from(contact)
      .where(eq(contact.id, id));
    expect(row.emailStatus).toBe("suppressed");
  });
});

// ─── addSuppressions ────────────────────────────────────────────────────────

describe("addSuppressions reports contact_updated", () => {
  it("one call for the batch, with only the contacts that changed", async () => {
    const a = await seedContact(`${PREFIX}-batch-a@example.com`, "active");
    // Already on the SES list, contact still active: changes too.
    ses.existing[`${PREFIX}-batch-b@example.com`] = "BOUNCE";
    const b = await seedContact(`${PREFIX}-batch-b@example.com`, "active");
    await seedContact(`${PREFIX}-batch-c@example.com`, "bounced");

    const result = await addSuppressions(testOrg.id, [
      {
        awsAccountId: testAwsAccount.id,
        email: `${PREFIX}-batch-a@example.com`,
        reason: "BOUNCE",
      },
      {
        awsAccountId: testAwsAccount.id,
        email: `${PREFIX}-batch-b@example.com`,
        reason: "BOUNCE",
      },
      {
        awsAccountId: testAwsAccount.id,
        email: `${PREFIX}-batch-c@example.com`,
        reason: "BOUNCE",
      },
      {
        awsAccountId: testAwsAccount.id,
        email: `${PREFIX}-batch-none@example.com`,
        reason: "BOUNCE",
      },
    ]);

    expect(result).toEqual({
      success: true,
      results: [
        {
          email: `${PREFIX}-batch-a@example.com`,
          success: true,
          alreadyPresent: false,
        },
        {
          email: `${PREFIX}-batch-b@example.com`,
          success: true,
          alreadyPresent: true,
        },
        {
          email: `${PREFIX}-batch-c@example.com`,
          success: true,
          alreadyPresent: false,
        },
        {
          email: `${PREFIX}-batch-none@example.com`,
          success: true,
          alreadyPresent: false,
        },
      ],
    });
    expect(reportedContacts()).toEqual([[a, b].sort()]);
  });

  it("a batch that changes no contact makes no call", async () => {
    await seedContact(`${PREFIX}-batch-x@example.com`, "suppressed");

    const result = await addSuppressions(testOrg.id, [
      {
        awsAccountId: testAwsAccount.id,
        email: `${PREFIX}-batch-x@example.com`,
        reason: "BOUNCE",
      },
      {
        awsAccountId: testAwsAccount.id,
        email: `${PREFIX}-batch-y@example.com`,
        reason: "BOUNCE",
      },
    ]);

    expect(result).toMatchObject({ success: true });
    expect(apiCalls).toHaveLength(0);
  });
});

// ─── removeSuppression ──────────────────────────────────────────────────────

describe("removeSuppression reports contact_updated", () => {
  it("a suppressed contact returned to active is reported once", async () => {
    ses.existing[`${PREFIX}-remove@example.com`] = "BOUNCE";
    const id = await seedContact(`${PREFIX}-remove@example.com`, "suppressed");

    const result = await removeSuppression(
      testOrg.id,
      testAwsAccount.id,
      `${PREFIX}-remove@example.com`,
      false
    );

    expect(result).toEqual({
      success: true,
      email: `${PREFIX}-remove@example.com`,
      wasPresent: true,
    });
    expect(reportedContacts()).toEqual([[id]]);
    expect(await auditMetadata("suppression.removed")).toEqual([
      expect.objectContaining({ contactRestored: true }),
    ]);
  });

  it("a contact the removal does not change is not reported", async () => {
    ses.existing[`${PREFIX}-remove-bounced@example.com`] = "BOUNCE";
    await seedContact(`${PREFIX}-remove-bounced@example.com`, "bounced");

    const result = await removeSuppression(
      testOrg.id,
      testAwsAccount.id,
      `${PREFIX}-remove-bounced@example.com`,
      false
    );

    expect(result).toMatchObject({ success: true });
    expect(apiCalls).toHaveLength(0);
    expect(await auditMetadata("suppression.removed")).toEqual([
      expect.objectContaining({ contactRestored: false }),
    ]);
  });
});
