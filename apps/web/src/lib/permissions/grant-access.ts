import { awsAccountPermission, db } from "@wraps/db";
import { eq } from "drizzle-orm";
import { PERMISSION_LEVELS, type PermissionLevel } from "./types";

export async function grantAWSAccountAccess(params: {
  userId: string;
  awsAccountId: string;
  permissions: PermissionLevel;
  grantedBy: string;
  expiresAt?: Date;
}) {
  const permissionList = PERMISSION_LEVELS[params.permissions];

  // Check if permission already exists
  const existing = await db.query.awsAccountPermission.findFirst({
    where: (p, { and, eq }) =>
      and(eq(p.userId, params.userId), eq(p.awsAccountId, params.awsAccountId)),
  });

  if (existing) {
    // Update existing permission
    await db
      .update(awsAccountPermission)
      .set({
        permissions: [...permissionList],
        expiresAt: params.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(awsAccountPermission.id, existing.id));
  } else {
    // Create new permission
    await db.insert(awsAccountPermission).values({
      userId: params.userId,
      awsAccountId: params.awsAccountId,
      permissions: [...permissionList],
      grantedBy: params.grantedBy,
      expiresAt: params.expiresAt,
    });
  }
}
