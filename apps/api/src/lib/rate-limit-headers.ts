/**
 * Rate-limit response headers.
 *
 * Two naming conventions go out on every limited response:
 *
 *  - `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset`, the names
 *    the IETF RateLimit-headers drafts established and that HTTP clients and
 *    agent frameworks look for. `Reset` is *seconds remaining*, per the draft —
 *    not a Unix timestamp.
 *  - `X-RateLimit-*`, which this API emitted first. Kept so existing
 *    integrations do not break; new clients should read the unprefixed names.
 *
 * `RateLimit-Policy` states the policy itself, so a caller can see the shape of
 * the limit (how many, over what window) without having to hit it.
 */

// Matches Elysia's HTTPHeaders, which also accepts numbers.
type HeaderSink = { headers: Record<string, string | number | undefined> };

export type RateLimitWindow = {
  /** Requests permitted in the window. */
  limit: number;
  /** Requests still available. Clamped at zero. */
  remaining: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Seconds until the window resets. Defaults to the full window. */
  resetSeconds?: number;
  /** Policy name, e.g. "minute" or "daily". */
  name: string;
};

/** `10;w=60` for a single policy, comma-joined for several. */
export function formatRateLimitPolicy(windows: RateLimitWindow[]): string {
  return windows
    .map((window) => `${window.limit};w=${window.windowSeconds}`)
    .join(", ");
}

/**
 * Write the headers for a request that passed the limiter.
 *
 * `windows` may hold several policies (per-minute and per-day, say). The
 * quota headers describe the window closest to exhaustion — that is the one a
 * caller has to pace against — while `RateLimit-Policy` lists all of them.
 */
export function setRateLimitHeaders(
  set: HeaderSink,
  windows: RateLimitWindow[]
): void {
  if (windows.length === 0) {
    return;
  }

  const tightest = windows.reduce((closest, window) =>
    window.remaining < closest.remaining ? window : closest
  );
  const remaining = Math.max(0, tightest.remaining);
  const reset = tightest.resetSeconds ?? tightest.windowSeconds;

  set.headers["RateLimit-Limit"] = String(tightest.limit);
  set.headers["RateLimit-Remaining"] = String(remaining);
  set.headers["RateLimit-Reset"] = String(reset);
  set.headers["RateLimit-Policy"] = formatRateLimitPolicy(windows);

  set.headers["X-RateLimit-Limit"] = String(tightest.limit);
  set.headers["X-RateLimit-Remaining"] = String(remaining);
  set.headers["X-RateLimit-Reset"] = String(reset);
}

/**
 * Write the headers for a request the limiter is rejecting. `Retry-After` is
 * the one every HTTP client already understands, so it goes out alongside.
 */
export function setRateLimitExceededHeaders(
  set: HeaderSink,
  exceeded: RateLimitWindow,
  allWindows: RateLimitWindow[] = [exceeded]
): void {
  const reset = exceeded.resetSeconds ?? exceeded.windowSeconds;

  set.headers["Retry-After"] = String(reset);
  set.headers["RateLimit-Limit"] = String(exceeded.limit);
  set.headers["RateLimit-Remaining"] = "0";
  set.headers["RateLimit-Reset"] = String(reset);
  set.headers["RateLimit-Policy"] = formatRateLimitPolicy(allWindows);

  set.headers["X-RateLimit-Limit"] = String(exceeded.limit);
  set.headers["X-RateLimit-Remaining"] = "0";
  set.headers["X-RateLimit-Reset"] = String(reset);
}
