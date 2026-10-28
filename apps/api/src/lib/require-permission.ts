import { type ResourceName, roles } from "@wraps/auth/access";
import { db, member } from "@wraps/db";
import { and, eq } from "drizzle-orm";
import { getAuth } from "../middleware/auth";

const DENIED_BODY = {
  error: "You don't have permission to perform this action",
};

type AuthorizeFn = (req: Record<string, string[]>) => { success: boolean };

/**
 * True when `role` holds every action in `actions` on `resource`. Uses the same
 * role matrix as the dashboard's `checkPermission`, so a route and its server
 * action agree on who may do what. An unknown role is denied.
 */
export function roleAllows(
  role: string,
  resource: ResourceName,
  actions: string[]
): boolean {
  const roleInstance = roles[role as keyof typeof roles];
  if (!roleInstance) {
    return false;
  }
  const authorize = roleInstance.authorize as unknown as AuthorizeFn;
  return authorize({ [resource]: actions }).success;
}

/**
 * Gate a route to members whose org role holds `actions` on `resource`.
 *
 * `AuthContext` carries no role, so it is resolved from the `member` row for
 * (userId, organizationId). API keys authenticate as their creator
 * (`userId = key.createdBy`), so the creator's role is what is enforced.
 * On denial this sets 403 on `ctx.set` and returns `{ ok: false, body }`; the
 * caller returns `body`. Mutating routes call it before touching any row.
 */
export async function requirePermission(
  ctx: unknown,
  resource: ResourceName,
  actions: string[]
): Promise<
  | { ok: true; userId: string; role: string }
  | { ok: false; body: { error: string } }
> {
  const auth = getAuth(ctx);
  const deny = () => {
    (ctx as { set: { status: number } }).set.status = 403;
    return { ok: false as const, body: DENIED_BODY };
  };

  if (!auth.userId) {
    return deny();
  }

  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, auth.userId),
        eq(member.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (!(row && roleAllows(row.role, resource, actions))) {
    return deny();
  }

  return { ok: true, userId: auth.userId, role: row.role };
}
