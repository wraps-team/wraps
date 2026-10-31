import { type ResourceName, roles } from "@wraps/auth/access";
import { db, member } from "@wraps/db";
import { and, eq } from "drizzle-orm";
import { getAuth } from "../middleware/auth";
import type { ApiKeyPermission } from "../services/api-keys";

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
 * The API key scopes each (resource, action) needs. Scopes are what the
 * dashboard's key form offers (apps/web/src/lib/api-keys.ts): "Campaigns"
 * covers templates and broadcasts, "Analytics" covers events, and sending a
 * broadcast also needs "send:email". A resource that is not listed here
 * (apiKeys, awsAccounts, orgSettings, members, billing, sso) has no scope, so
 * a key is refused unless the route passes `keyScopes` itself.
 */
const KEY_SCOPES: Partial<
  Record<ResourceName, Record<string, ApiKeyPermission[]>>
> = {
  contacts: {
    read: ["contacts:read"],
    export: ["contacts:read"],
    write: ["contacts:write"],
    delete: ["contacts:write"],
    import: ["contacts:write"],
  },
  topics: {
    read: ["topics:read"],
    write: ["topics:write"],
    delete: ["topics:write"],
  },
  segments: {
    read: ["segments:read"],
    write: ["segments:write"],
    delete: ["segments:write"],
  },
  workflows: {
    read: ["workflows:read"],
    write: ["workflows:write"],
    delete: ["workflows:write"],
  },
  templates: {
    read: ["campaigns:read"],
    write: ["campaigns:write"],
    publish: ["campaigns:write"],
    delete: ["campaigns:write"],
  },
  broadcasts: {
    read: ["campaigns:read"],
    write: ["campaigns:write"],
    delete: ["campaigns:write"],
    send: ["campaigns:write", "send:email"],
  },
  events: {
    read: ["analytics:read"],
    export: ["analytics:read"],
  },
};

/**
 * The scopes a key needs for `actions` on `resource`, or null when a key may
 * not do this at all (an action with no mapped scope).
 */
export function keyScopesFor(
  resource: ResourceName,
  actions: string[]
): ApiKeyPermission[] | null {
  const byAction = KEY_SCOPES[resource];
  if (!byAction) {
    return null;
  }
  const needed = new Set<ApiKeyPermission>();
  for (const action of actions) {
    const scopes = byAction[action];
    if (!scopes) {
      return null;
    }
    for (const scope of scopes) {
      needed.add(scope);
    }
  }
  return [...needed];
}

/** True when `granted` holds every scope in `needed`. */
export function keyAllows(
  granted: readonly string[] | null | undefined,
  needed: readonly ApiKeyPermission[] | null
): boolean {
  if (!(needed && granted)) {
    return false;
  }
  return needed.every((scope) => granted.includes(scope));
}

export type PermissionGate =
  | {
      ok: true;
      /** The member behind a session, or the key's creator (null if gone). */
      userId: string | null;
      /** The member's org role; null for an API key, which has scopes instead. */
      role: string | null;
    }
  | { ok: false; body: { error: string } };

/**
 * Gate a route on who is calling.
 *
 * - A session (dashboard, CLI) is a person: their org role, read from the
 *   `member` row for (userId, organizationId), must hold `actions` on
 *   `resource`. Same matrix as the dashboard's `checkPermission`.
 * - An API key is an org-level credential: its own scopes
 *   (`api_key.permissions`, set in the dashboard's key form) must cover the
 *   action. The creator's role is not consulted, so a key keeps working after
 *   its creator leaves. `options.keyScopes` overrides the default mapping for
 *   a resource that has no scope of its own.
 *
 * On denial this sets 403 on `ctx.set` and returns `{ ok: false, body }`; the
 * caller returns `body`. Mutating routes call it before touching any row.
 */
export async function requirePermission(
  ctx: unknown,
  resource: ResourceName,
  actions: string[],
  options: { keyScopes?: ApiKeyPermission[] } = {}
): Promise<PermissionGate> {
  const auth = getAuth(ctx);
  const deny = () => {
    (ctx as { set: { status: number } }).set.status = 403;
    return { ok: false as const, body: DENIED_BODY };
  };

  if (auth.apiKeyId) {
    const needed = options.keyScopes ?? keyScopesFor(resource, actions);
    if (!keyAllows(auth.apiKeyScopes, needed)) {
      return deny();
    }
    return { ok: true, userId: auth.userId, role: null };
  }

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
