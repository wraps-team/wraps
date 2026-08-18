import { db } from "@wraps/db";
import { member, organization, subscription } from "@wraps/db/schema/auth";
import { and, count, eq, or } from "drizzle-orm";
import { cache } from "react";
import { getLicensedPlan } from "@/lib/plan-limits";

/**
 * Get organization by slug (cached for request)
 */
export const getOrganizationBySlug = cache(async (slug: string) => {
  const org = await db.query.organization.findFirst({
    where: eq(organization.slug, slug),
  });

  return org ?? null;
});

/**
 * Get organization by ID (cached for request)
 */
export const getOrganizationById = cache(async (id: string) => {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, id),
  });

  return org ?? null;
});

/**
 * Get organization with user's membership
 * Accepts either slug or organization ID
 */
export const getOrganizationWithMembership = cache(
  async (slugOrId: string, userId: string) => {
    // Try to find by slug first, then by ID
    const org = await db.query.organization.findFirst({
      where: or(eq(organization.slug, slugOrId), eq(organization.id, slugOrId)),
    });

    if (!org) {
      return null;
    }

    // Check if user is a member
    const { member: memberTable } = await import("@wraps/db/schema/auth");
    const membership = await db.query.member.findFirst({
      where: (m, { and, eq }) =>
        and(eq(m.userId, userId), eq(m.organizationId, org.id)),
    });

    if (!membership) {
      return null;
    }

    return {
      ...org,
      userRole: membership.role,
    };
  }
);

/**
 * Get organization with all dashboard data in a single relational query.
 * Fetches organization, membership, extension, active subscription, and AWS accounts.
 * Returns null if org not found or user is not a member.
 */
export const getOrganizationWithDashboardData = cache(
  async (slugOrId: string, userId: string) => {
    // Single relational query to fetch organization with all related data
    const org = await db.query.organization.findFirst({
      where: or(eq(organization.slug, slugOrId), eq(organization.id, slugOrId)),
      with: {
        members: {
          where: eq(member.userId, userId),
          limit: 1,
        },
        extension: true,
        subscriptions: {
          where: or(
            eq(subscription.status, "active"),
            eq(subscription.status, "trialing")
          ),
          limit: 1,
        },
        awsAccounts: {
          columns: {
            emailEnabled: true,
            smsEnabled: true,
            // `features.email.sandbox` drives the go-live banner: connecting an
            // AWS account is not going live, getting out of the SES sandbox is.
            features: true,
            isVerified: true,
          },
        },
      },
    });

    if (!org) {
      return null;
    }

    // Check if user is a member
    const membership = org.members[0];
    if (!membership) {
      return null;
    }

    // Query real member count (the extension field is unreliable)
    const [memberCountResult] = await db
      .select({ count: count() })
      .from(member)
      .where(eq(member.organizationId, org.id));

    return {
      ...org,
      userRole: membership.role,
      extension: org.extension,
      activeSubscription: org.subscriptions[0] ?? null,
      awsAccounts: org.awsAccounts,
      memberCount: memberCountResult?.count ?? 1,
    };
  }
);

/**
 * Get all organizations the user is a member of, with their role.
 * Used to seed the org switcher with server-rendered data (no client waterfall).
 */
export const getUserOrganizations = cache(async (userId: string) => {
  const memberships = await db.query.member.findMany({
    where: eq(member.userId, userId),
    with: { organization: true },
  });

  return memberships.map((m) => ({
    organization: m.organization,
    role: m.role,
  }));
});

/**
 * Check if user has access to organization
 */
export async function checkOrganizationAccess(
  slug: string,
  userId: string
): Promise<boolean> {
  const orgWithMembership = await getOrganizationWithMembership(slug, userId);
  return orgWithMembership !== null;
}

/**
 * Get active subscription for an organization (cached for request)
 */
export const getOrganizationSubscription = cache(
  async (organizationId: string) => {
    const activeSubscription = await db.query.subscription.findFirst({
      where: and(
        eq(subscription.referenceId, organizationId),
        or(
          eq(subscription.status, "active"),
          eq(subscription.status, "trialing")
        )
      ),
    });

    return activeSubscription ?? null;
  }
);

/**
 * Get the plan ID for an organization (defaults to "free")
 */
export const getOrganizationPlanId = cache(
  async (organizationId: string): Promise<string> => {
    // Self-hosted: the license key is the source of truth, not Stripe.
    const licensedTier = getLicensedPlan();
    if (licensedTier) {
      return licensedTier;
    }
    const sub = await getOrganizationSubscription(organizationId);
    // Default to free tier if no active subscription
    return sub?.plan || "free";
  }
);

// Re-export slug utility for server-side use
export { generateSlug } from "@/lib/utils/slug";
