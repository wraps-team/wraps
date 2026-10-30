/**
 * Deleting an org from the dashboard cancels its Stripe subscriptions, and
 * does it while the `subscription` row is still there to read. The row
 * cascades with the org, so a hook that ran after the delete would find
 * nothing and leave Stripe billing.
 */

import { db } from "@wraps/db";
import {
  member,
  organization,
  subscription,
  user,
} from "@wraps/db/schema/auth";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@wraps/email", () => ({
  getWrapsClient: vi.fn(),
}));

vi.mock("posthog-node", () => ({ PostHog: vi.fn() }));

const { cancelSpy } = vi.hoisted(() => ({ cancelSpy: vi.fn() }));
vi.mock("../close-organization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../close-organization")>()),
  cancelOrganizationSubscriptions: cancelSpy,
}));

// `betterAuth<BetterAuthOptions>` erases plugin endpoint types from `auth.api`.
type OrgApi = {
  deleteOrganization(input: {
    body: { organizationId: string };
    headers: Headers;
  }): Promise<unknown>;
};

const PREFIX = "org-delete-cancel-test";
const stamp = Date.now();
const orgId = `${PREFIX}-org-${stamp}`;

async function cleanup() {
  await db.delete(organization).where(like(organization.id, `${PREFIX}-%`));
  await db.delete(user).where(like(user.email, `${PREFIX}-%`));
}

describe("organization delete", () => {
  beforeAll(cleanup, 60_000);
  afterAll(cleanup);

  it("cancels subscriptions before the org and its subscription row are gone", async () => {
    const { auth } = await import("../index");
    const { headers, response } = await auth.api.signUpEmail({
      body: {
        email: `${PREFIX}-${stamp}@example.com`,
        password: "a-long-unbreached-test-passphrase-5c2f",
        name: "Org Delete Test",
      },
      returnHeaders: true,
    });
    const cookie = (headers as Headers)
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    await db.insert(organization).values({
      id: orgId,
      name: "Org Delete Test",
      slug: orgId,
      createdAt: new Date(),
    });
    await db.insert(member).values({
      id: `${orgId}-owner`,
      organizationId: orgId,
      userId: response.user.id,
      role: "owner",
      createdAt: new Date(),
    });
    await db.insert(subscription).values({
      id: `${orgId}-sub`,
      plan: "pro",
      referenceId: orgId,
      stripeSubscriptionId: `${orgId}-stripe-sub`,
      status: "active",
    });

    const rowsSeenByHook: unknown[][] = [];
    cancelSpy.mockImplementation(async (_stripe, organizationId: string) => {
      rowsSeenByHook.push(
        await db
          .select({ id: subscription.id })
          .from(subscription)
          .where(eq(subscription.referenceId, organizationId))
      );
    });

    await (auth.api as unknown as OrgApi).deleteOrganization({
      body: { organizationId: orgId },
      headers: new Headers({ cookie }),
    });

    expect(cancelSpy).toHaveBeenCalledWith(expect.anything(), orgId);
    expect(rowsSeenByHook).toEqual([[{ id: `${orgId}-sub` }]]);
    const orgs = await db
      .select()
      .from(organization)
      .where(eq(organization.id, orgId));
    expect(orgs).toHaveLength(0);
  });
});
