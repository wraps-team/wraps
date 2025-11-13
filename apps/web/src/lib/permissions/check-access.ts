import { db } from "@wraps/db";
import type { Permission } from "./types";

export async function checkAWSAccountAccess(params: {
  userId: string;
  organizationId: string;
  awsAccountId: string;
  permission: Permission; // "view" | "send" | "manage"
}): Promise<{ authorized: boolean; reason: string }> {
  // 1. Verify user is org member
  const membership = await db.query.member.findFirst({
    where: (m, { and, eq }) =>
      and(
        eq(m.userId, params.userId),
        eq(m.organizationId, params.organizationId)
      ),
  });

  if (!membership) {
    return { authorized: false, reason: "Not a member of this organization" };
  }

  // 2. Owners bypass all resource-level permissions
  if (membership.role === "owner") {
    return { authorized: true, reason: "Organization owner" };
  }

  // 3. For non-owners, check explicit permission
  const grant = await db.query.awsAccountPermission.findFirst({
    where: (p, { and, eq }) =>
      and(eq(p.userId, params.userId), eq(p.awsAccountId, params.awsAccountId)),
  });

  if (!grant) {
    return { authorized: false, reason: "No permission grant" };
  }

  // Check if permission is expired
  if (grant.expiresAt && grant.expiresAt < new Date()) {
    return { authorized: false, reason: "Permission expired" };
  }

  // Check if user has the required permission
  const hasPermission = grant.permissions.includes(params.permission);

  return {
    authorized: hasPermission,
    reason: hasPermission ? "Explicit grant" : "Insufficient permissions",
  };
}
