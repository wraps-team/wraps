import { getAuth } from "../middleware/auth";

/**
 * Session-only gate for routes a person must call, not an API key. Returns
 * the 403 body `{ error: message }` (and sets 403 on `ctx.set`) when the
 * request was authenticated with an API key, otherwise null. Call it before
 * the permission check, and return its body when it is not null.
 */
export function rejectApiKeyCaller(
  ctx: unknown,
  message: string
): { error: string } | null {
  if (getAuth(ctx).apiKeyId === null) {
    return null;
  }
  (ctx as { set: { status: number } }).set.status = 403;
  return { error: message };
}
