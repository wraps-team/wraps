/**
 * What deleting an account or an org does to the orgs and Stripe
 * subscriptions behind it, through the real DB.
 *
 * Before this, deleting an org removed its `subscription` row and left the
 * Stripe subscription billing, and deleting an account left every org the
 * user solely owned behind with no members.
 */

import { db } from "@wraps/db";
import {
  account,
  member,
  organization,
  session,
  subscription,
  user,
} from "@wraps/db/schema/auth";
import { eq, like } from "drizzle-orm";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cancelOrganizationSubscriptions,
  closeOrganizationsOwnedBy,
} from "../close-organization";

vi.mock("@wraps/email", () => ({
  getWrapsClient: vi.fn(),
}));

vi.mock("posthog-node", () => ({ PostHog: vi.fn() }));

const PREFIX = "close-org-test";
const stamp = Date.now();
const id = (name: string) => `${PREFIX}-${name}-${stamp}`;
const password = "a-long-unbreached-test-passphrase-3b8a";

function fakeStripe(statuses: Record<string, string | "missing">) {
  const cancel = vi.fn(async (subId: string) => ({ id: subId }));
  const retrieve = vi.fn(async (subId: string) => {
    const status = statuses[subId];
    if (status === "missing" || status === undefined) {
      throw Object.assign(new Error("No such subscription"), {
        code: "resource_missing",
      });
    }
    return { id: subId, status };
  });
  return {
    client: { subscriptions: { cancel, retrieve } } as unknown as Stripe,
    cancel,
  };
}

async function createOrg(name: string) {
  const orgId = id(name);
  await db.insert(organization).values({
    id: orgId,
    name: `${PREFIX} ${name}`,
    slug: orgId,
    createdAt: new Date(),
  });
  return orgId;
}

async function createUser(name: string) {
  const userId = id(`user-${name}`);
  await db.insert(user).values({
    id: userId,
    name,
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return userId;
}

async function addMember(orgId: string, userId: string, role: string) {
  await db.insert(member).values({
    id: `${orgId}-${userId}`,
    organizationId: orgId,
    userId,
    role,
    createdAt: new Date(),
  });
}

async function addSubscription(orgId: string, subId: string, status: string) {
  await db.insert(subscription).values({
    id: `${orgId}-${subId}`,
    plan: "pro",
    referenceId: orgId,
    stripeSubscriptionId: subId,
    status,
  });
}

async function orgExists(orgId: string) {
  const rows = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, orgId));
  return rows.length === 1;
}

async function signUp(name: string) {
  const { auth } = await import("../index");
  const { headers, response } = await auth.api.signUpEmail({
    body: { email: `${id(name)}@example.com`, password, name },
    returnHeaders: true,
  });
  const cookie = (headers as Headers)
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { userId: response.user.id, headers: new Headers({ cookie }) };
}

async function cleanup() {
  await db.delete(organization).where(like(organization.id, `${PREFIX}-%`));
  await db.delete(user).where(like(user.email, `${PREFIX}-%`));
}

describe("cancelOrganizationSubscriptions", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("cancels live subscriptions and skips ended or missing ones", async () => {
    const orgId = await createOrg("subs");
    await addSubscription(orgId, id("sub-active"), "active");
    await addSubscription(orgId, id("sub-past-due"), "past_due");
    await addSubscription(orgId, id("sub-db-canceled"), "canceled");
    await addSubscription(orgId, id("sub-stripe-canceled"), "active");
    await addSubscription(orgId, id("sub-missing"), "active");
    const { client, cancel } = fakeStripe({
      [id("sub-active")]: "active",
      [id("sub-past-due")]: "past_due",
      [id("sub-stripe-canceled")]: "canceled",
      [id("sub-missing")]: "missing",
    });

    await cancelOrganizationSubscriptions(client, orgId);

    expect(cancel.mock.calls.map(([subId]) => subId).sort()).toEqual(
      [id("sub-active"), id("sub-past-due")].sort()
    );
  });

  it("does nothing without a Stripe client", async () => {
    const orgId = await createOrg("no-stripe");
    await addSubscription(orgId, id("sub-self-host"), "active");

    await expect(
      cancelOrganizationSubscriptions(null, orgId)
    ).resolves.toBeUndefined();
  });
});

describe("closeOrganizationsOwnedBy", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("closes a sole-member org and cancels its subscription first", async () => {
    const userId = await createUser("solo");
    const orgId = await createOrg("solo");
    await addMember(orgId, userId, "owner");
    await addSubscription(orgId, id("sub-solo"), "active");
    const { client, cancel } = fakeStripe({ [id("sub-solo")]: "active" });

    await closeOrganizationsOwnedBy(client, userId);

    expect(cancel).toHaveBeenCalledWith(id("sub-solo"));
    expect(await orgExists(orgId)).toBe(false);
  });

  it("leaves an org that has another owner", async () => {
    const userId = await createUser("co-owner-a");
    const otherId = await createUser("co-owner-b");
    const orgId = await createOrg("co-owned");
    await addMember(orgId, userId, "owner");
    await addMember(orgId, otherId, "admin,owner");
    await addSubscription(orgId, id("sub-co"), "active");
    const { client, cancel } = fakeStripe({ [id("sub-co")]: "active" });

    await closeOrganizationsOwnedBy(client, userId);

    expect(cancel).not.toHaveBeenCalled();
    expect(await orgExists(orgId)).toBe(true);
  });

  it("leaves orgs the user only belongs to", async () => {
    const userId = await createUser("plain-member");
    const ownerId = await createUser("their-owner");
    const orgId = await createOrg("belongs-to");
    await addMember(orgId, ownerId, "owner");
    await addMember(orgId, userId, "member");
    const { client } = fakeStripe({});

    await closeOrganizationsOwnedBy(client, userId);

    expect(await orgExists(orgId)).toBe(true);
  });
});

describe("deleteUser with owned orgs", () => {
  beforeAll(cleanup, 60_000);
  afterAll(cleanup);

  it("refuses while the user is the only owner of an org with members, and leaves them signed in", async () => {
    const { auth } = await import("../index");
    const { userId, headers } = await signUp("blocked");
    const teammateId = await createUser("teammate");
    const orgId = await createOrg("team");
    await addMember(orgId, userId, "owner");
    await addMember(orgId, teammateId, "member");

    await expect(auth.api.deleteUser({ body: {}, headers })).rejects.toThrow(
      `Make another member an owner of ${PREFIX} team`
    );

    expect(await orgExists(orgId)).toBe(true);
    const users = await db.select().from(user).where(eq(user.id, userId));
    expect(users).toHaveLength(1);
    const sessions = await db
      .select()
      .from(session)
      .where(eq(session.userId, userId));
    expect(sessions.length).toBeGreaterThan(0);
    const accounts = await db
      .select()
      .from(account)
      .where(eq(account.userId, userId));
    expect(accounts).toHaveLength(1);
  });

  it("deletes the user and the org they were the only member of", async () => {
    const { auth } = await import("../index");
    const { userId, headers } = await signUp("leaving");
    const orgId = await createOrg("leaving");
    await addMember(orgId, userId, "owner");

    const result = await auth.api.deleteUser({ body: {}, headers });

    expect(result.success).toBe(true);
    expect(await orgExists(orgId)).toBe(false);
    const users = await db.select().from(user).where(eq(user.id, userId));
    expect(users).toHaveLength(0);
  });
});
