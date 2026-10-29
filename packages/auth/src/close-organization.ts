import { and, db, eq, member } from "@wraps/db";
import { organization, subscription } from "@wraps/db/schema/auth";
import { APIError } from "better-auth/api";
import { ne } from "drizzle-orm";
import type Stripe from "stripe";

const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"]);

const isOwner = (role: string) => role.split(",").includes("owner");

/**
 * Cancel every live Stripe subscription billed to an organization, now, with
 * no proration. Reads the DB rows rather than Stripe metadata: some older
 * subscriptions carry no `referenceId` in Stripe. Must run before the org row
 * goes, since `subscription` cascades with it.
 */
export async function cancelOrganizationSubscriptions(
  stripe: Stripe | null,
  organizationId: string
): Promise<void> {
  if (!stripe) {
    return;
  }
  const rows = await db
    .select({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      status: subscription.status,
    })
    .from(subscription)
    .where(eq(subscription.referenceId, organizationId));

  for (const { stripeSubscriptionId, status } of rows) {
    if (!stripeSubscriptionId || ENDED_STATUSES.has(status)) {
      continue;
    }
    try {
      const live = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      if (!ENDED_STATUSES.has(live.status)) {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
      }
    } catch (error) {
      if ((error as { code?: string }).code !== "resource_missing") {
        throw error;
      }
    }
  }
}

/**
 * Account deletion's side of org ownership. An org the user is the only
 * member of is closed: subscriptions canceled, then the org deleted. An org
 * with other members but no other owner blocks the deletion, before
 * better-auth touches the user's sessions. Orgs with another owner are left
 * alone; the membership cascades with the user.
 */
export async function closeOrganizationsOwnedBy(
  stripe: Stripe | null,
  userId: string
): Promise<void> {
  // biome-ignore lint/plugin: every org this user belongs to, across orgs by design
  const memberships = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId));

  const toClose: string[] = [];
  const blocked: string[] = [];
  for (const { organizationId, role } of memberships) {
    if (!isOwner(role)) {
      continue;
    }
    const others = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          ne(member.userId, userId)
        )
      );
    if (others.length === 0) {
      toClose.push(organizationId);
    } else if (!others.some((m) => isOwner(m.role))) {
      blocked.push(organizationId);
    }
  }

  if (blocked.length > 0) {
    const names = await Promise.all(
      blocked.map(async (id) => {
        const [org] = await db
          .select({ name: organization.name })
          .from(organization)
          .where(eq(organization.id, id));
        return org?.name ?? id;
      })
    );
    throw APIError.from("BAD_REQUEST", {
      code: "ORGANIZATION_NEEDS_OWNER",
      message: `Make another member an owner of ${names.join(", ")}, or delete it, before deleting your account.`,
    });
  }

  // Every cancel before any delete: a Stripe failure partway leaves all orgs in
  // place, and a retry skips what Stripe already canceled.
  for (const organizationId of toClose) {
    await cancelOrganizationSubscriptions(stripe, organizationId);
  }
  for (const organizationId of toClose) {
    await db.delete(organization).where(eq(organization.id, organizationId));
  }
}
