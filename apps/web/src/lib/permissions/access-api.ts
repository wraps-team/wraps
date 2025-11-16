/**
 * Custom Dynamic Access Control (DAC) implementation for Wraps.
 *
 * Note: better-auth provides RBAC through the admin plugin, not DAC with
 * per-resource statements. We're implementing our own DAC system here using
 * the statement table for fine-grained, per-AWS-account permissions.
 *
 * This provides more flexibility than RBAC alone:
 * - Grant READ_ONLY access to specific AWS accounts
 * - Grant temporary access with expiration
 * - Different permissions per resource (not just role-based)
 */

import { db } from "@wraps/db";
import { and, eq, like } from "drizzle-orm";

type CreateStatementParams = {
  userId: string;
  effect: "allow" | "deny";
  action: string;
  resource: string;
  expiresAt?: string;
};

type CheckStatementParams = {
  userId: string;
  action: string;
  resource: string;
};

type RevokeStatementParams = {
  userId: string;
  action: string;
  resource: string;
};

/**
 * Creates an access statement for a user.
 * Grants or denies permission to perform an action on a resource.
 */
export async function createAccessStatement(
  params: CreateStatementParams
): Promise<void> {
  const { userId, effect, action, resource, expiresAt } = params;

  // Direct database insert through @wraps/db
  // The statement table comes from better-auth but we manage it ourselves
  const { statement } = await import("@wraps/db");

  await db.insert(statement).values({
    id: crypto.randomUUID(),
    userId,
    effect,
    action,
    resource,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/**
 * Checks if a user has access to perform an action on a resource.
 * Returns true if an allow statement exists and hasn't expired.
 */
export async function checkAccessStatement(
  params: CheckStatementParams
): Promise<boolean> {
  const { userId, action, resource } = params;

  // Query the statement table through drizzle's query builder
  const result = await db.query.statement.findFirst({
    where: (s, { and, eq, or, gt, isNull }) =>
      and(
        eq(s.userId, userId),
        eq(s.effect, "allow"),
        // Match exact action or wildcard (e.g., "aws-account:*")
        or(eq(s.action, action), eq(s.action, `${action.split(":")[0]}:*`)),
        eq(s.resource, resource),
        // Check expiration: null or future date
        or(isNull(s.expiresAt), gt(s.expiresAt, new Date()))
      ),
  });

  return !!result;
}

/**
 * Revokes access statements for a user on a resource.
 * Removes all matching statements from the database.
 */
export async function revokeAccessStatement(
  params: RevokeStatementParams
): Promise<void> {
  const { userId, action, resource } = params;

  const { statement } = await import("@wraps/db");

  // Handle wildcard actions (e.g., "aws-account:*")
  if (action.endsWith(":*")) {
    const prefix = action.replace(":*", ":");
    // Delete all statements matching the action prefix
    await db
      .delete(statement)
      .where(
        and(
          eq(statement.userId, userId),
          eq(statement.resource, resource),
          like(statement.action, `${prefix}%`)
        )
      );
  } else {
    // Delete specific action statement
    await db
      .delete(statement)
      .where(
        and(
          eq(statement.userId, userId),
          eq(statement.action, action),
          eq(statement.resource, resource)
        )
      );
  }
}
