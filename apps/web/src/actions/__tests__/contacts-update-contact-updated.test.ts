/**
 * contact_updated from the dashboard's updateContact (plan 023b).
 *
 * After the write, updateContact reports the contact fields whose stored
 * value changed through POST /v1/contacts/events/updated: only the editable
 * fields (never updatedAt, hashes, timestamps or soft-bounce counters), and
 * no call at all when nothing changed.
 *
 * Real rows in the test Postgres; the API is a fetch stub. Fixture ids use
 * the `contacts-cu-023b-*` prefix so this file cannot collide with any other.
 */

import { contact, db, member, organization, user } from "@wraps/db";
import { eq } from "drizzle-orm";
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
import { updateContact } from "../contacts";
import { hashEmail } from "../shared/hash";

const PREFIX = "contacts-cu-023b";

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: "contacts-cu-023b-user-1",
          email: "contacts-cu-023b-user@example.com",
          name: "updateContact contact_updated user",
        },
        session: {
          id: "contacts-cu-023b-session",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: "contacts-cu-023b-user-1",
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "contacts-cu-023b-session-token",
        },
      })),
    },
  },
}));

const testUser = {
  id: `${PREFIX}-user-1`,
  email: `${PREFIX}-user@example.com`,
  name: "updateContact contact_updated user",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${PREFIX}-org-1`,
  name: "updateContact contact_updated org",
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

const CONTACT_ID = `${PREFIX}-contact-1`;
const EMAIL = `${PREFIX}-contact@example.com`;

const API_URL = "http://api.test";
type ApiCall = { url: string; init: RequestInit };
const apiCalls: ApiCall[] = [];
const originalFetch = globalThis.fetch;

/** The updatedFields of each call, one array per call. */
function reportedFields(): string[][] {
  return apiCalls.map((call) => {
    const body = JSON.parse(call.init.body as string) as {
      contacts: { contactId: string; updatedFields: string[] }[];
    };
    expect(body.contacts).toHaveLength(1);
    expect(body.contacts[0].contactId).toBe(CONTACT_ID);
    return body.contacts[0].updatedFields;
  });
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
});

afterAll(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

beforeEach(async () => {
  apiCalls.length = 0;
  vi.stubEnv("NEXT_PUBLIC_API_URL", API_URL);
  vi.stubGlobal("fetch", (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.startsWith(API_URL)) {
      apiCalls.push({ url: urlStr, init: init ?? {} });
      return Promise.resolve(Response.json({ accepted: 1 }));
    }
    return originalFetch(url as RequestInfo, init);
  });
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.insert(contact).values({
    id: CONTACT_ID,
    organizationId: testOrg.id,
    email: EMAIL,
    emailHash: hashEmail(EMAIL),
    emailStatus: "active",
    firstName: "Ada",
    lastName: "Lovelace",
    properties: { plan: "pro", tags: ["a", "b"] },
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("updateContact reports contact_updated", () => {
  it("a firstName change reports firstName, with the session and org headers", async () => {
    const result = await updateContact(CONTACT_ID, testOrg.id, {
      firstName: "Augusta",
    });

    expect(result.success).toBe(true);
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0].url).toBe(`${API_URL}/v1/contacts/events/updated`);
    const headers = new Headers(apiCalls[0].init.headers);
    expect(headers.get("Authorization")).toBe(
      "Bearer contacts-cu-023b-session-token"
    );
    expect(headers.get("X-Organization-Id")).toBe(testOrg.id);
    expect(reportedFields()).toEqual([["firstName"]]);
  });

  it("resubmitting the stored values makes no call", async () => {
    const result = await updateContact(CONTACT_ID, testOrg.id, {
      email: EMAIL.toUpperCase(),
      firstName: "Ada",
      lastName: "Lovelace",
      emailStatus: "active",
      properties: { tags: ["a", "b"], plan: "pro" },
    });

    expect(result.success).toBe(true);
    expect(apiCalls).toHaveLength(0);
  });

  it("clearing the email reports email and emailStatus", async () => {
    await db
      .update(contact)
      .set({ phone: "+15550001111" })
      .where(eq(contact.id, CONTACT_ID));

    const result = await updateContact(CONTACT_ID, testOrg.id, { email: "" });

    expect(result.success).toBe(true);
    expect(reportedFields()).toEqual([["email", "emailStatus"]]);
  });

  it("adding a phone reports phone and smsStatus", async () => {
    const result = await updateContact(CONTACT_ID, testOrg.id, {
      phone: "+15550002222",
    });

    expect(result.success).toBe(true);
    expect(reportedFields()).toEqual([["phone", "smsStatus"]]);
  });

  it("a nested properties change reports properties", async () => {
    const result = await updateContact(CONTACT_ID, testOrg.id, {
      properties: { plan: "pro", tags: ["a", "c"] },
    });

    expect(result.success).toBe(true);
    expect(reportedFields()).toEqual([["properties"]]);
  });

  it("never reports updatedAt, a hash, a timestamp or a soft-bounce counter", async () => {
    await db
      .update(contact)
      .set({ emailStatus: "soft_bounced", emailSoftBounceCount: 2 })
      .where(eq(contact.id, CONTACT_ID));

    // Changes the email (new hash) and reactivates (timestamps, counter reset).
    const result = await updateContact(CONTACT_ID, testOrg.id, {
      email: `${PREFIX}-new@example.com`,
      emailStatus: "active",
    });

    expect(result.success).toBe(true);
    expect(reportedFields()).toEqual([["email", "emailStatus"]]);
  });

  it("a failed update makes no call", async () => {
    const result = await updateContact(CONTACT_ID, testOrg.id, {
      email: "not-an-email",
    });

    expect(result.success).toBe(false);
    expect(apiCalls).toHaveLength(0);
  });
});
