import { db } from "@wraps/db";
import { organization } from "@wraps/db/schema/auth";
import { eq } from "drizzle-orm";
import { cache } from "react";

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
 * Get organization with user's membership
 */
export const getOrganizationWithMembership = cache(
  async (slug: string, userId: string) => {
    const org = await db.query.organization.findFirst({
      where: eq(organization.slug, slug),
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
      userRole: membership.role as "owner" | "admin" | "member",
    };
  }
);

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

// Re-export slug utility for server-side use
export { generateSlug } from "@/lib/utils/slug";
