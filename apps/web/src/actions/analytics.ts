"use server";

import { auth } from "@wraps/auth";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { createActionLogger, serializeError } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

/**
 * How long an org must wait between server-side chart refreshes.
 *
 * Every refresh fans out CloudWatch `GetMetricData` plus `GetSESReputationMetrics`
 * per connected AWS account — that fan-out is what the route's 5-minute
 * `unstable_cache` exists to protect. The cooldown keeps a held-down refresh
 * button from turning into a CloudWatch bill.
 */
const REFRESH_COOLDOWN_MS = 30_000;

/**
 * Last successful refresh per org, per server instance.
 *
 * In-memory on purpose: this guards against one user hammering the button,
 * which happens within a single instance. It is not a distributed rate limit
 * and does not need to be — the cache behind it bounds the worst case anyway.
 */
const lastRefreshByOrg = new Map<string, number>();

export type RefreshEmailChartResult =
  | { ok: true; refreshedAt: number }
  | {
      ok: false;
      reason: "unauthorized" | "cooldown" | "error";
      retryAfterSeconds?: number;
    };

/**
 * Expire the server-side cache behind the emails chart so the next fetch
 * recomputes from CloudWatch and Postgres.
 *
 * The refresh button used to invalidate only the React Query cache. The route
 * it refetches is wrapped in `unstable_cache` tagged `email-chart-<orgId>`, and
 * nothing in the repo ever invalidated that tag, so the spinner returned the
 * same bytes for up to five minutes. `updateTag` expires the entry immediately
 * (unlike `revalidateTag(tag, "max")`, which would serve the stale payload once
 * more while refreshing behind it — the exact behaviour being fixed here).
 *
 * Call this and await it BEFORE refetching on the client, or the refetch races
 * the invalidation and repopulates the cache with the stale value.
 */
export async function refreshEmailChart(
  orgSlug: string
): Promise<RefreshEmailChartResult> {
  const log = createActionLogger("refreshEmailChart", { orgSlug });

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { ok: false, reason: "unauthorized" };
    }

    const org = await getOrganizationWithMembership(orgSlug, session.user.id);
    if (!org) {
      return { ok: false, reason: "unauthorized" };
    }

    const now = Date.now();
    const last = lastRefreshByOrg.get(org.id);
    if (last !== undefined && now - last < REFRESH_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil(
        (REFRESH_COOLDOWN_MS - (now - last)) / 1000
      );
      log.info({ retryAfterSeconds }, "Chart refresh throttled");
      return { ok: false, reason: "cooldown", retryAfterSeconds };
    }

    lastRefreshByOrg.set(org.id, now);
    updateTag(`email-chart-${org.id}`);

    log.info({ organizationId: org.id }, "Email chart cache expired");
    return { ok: true, refreshedAt: now };
  } catch (error) {
    log.error({ err: serializeError(error) }, "Failed to refresh email chart");
    return { ok: false, reason: "error" };
  }
}

/**
 * How long an org must wait between server-side analytics refreshes.
 *
 * The analytics overview and SMS volume routes each fan out one cross-account
 * AWS read per connected account; that fan-out is what their 5-minute
 * `unstable_cache` exists to protect. The cooldown keeps a held-down refresh
 * button from turning into a CloudWatch/DynamoDB bill.
 */
const ANALYTICS_REFRESH_COOLDOWN_MS = 30_000;

/**
 * Last successful analytics refresh per org, per server instance. In-memory on
 * purpose, like `lastRefreshByOrg` above: it guards one user hammering the
 * button within a single instance, and the cache behind it bounds the worst
 * case anyway.
 */
const lastAnalyticsRefreshByOrg = new Map<string, number>();

export type RefreshAnalyticsResult =
  | { ok: true; refreshedAt: number }
  | {
      ok: false;
      reason: "unauthorized" | "cooldown" | "error";
      retryAfterSeconds?: number;
    };

/**
 * Expire the server-side caches behind the analytics page so the next fetch
 * recomputes from CloudWatch/DynamoDB and Postgres.
 *
 * The overview and SMS volume routes are wrapped in `unstable_cache` tagged
 * `analytics-overview-<orgId>` and `analytics-sms-volume-<orgId>`. Invalidating
 * only the React Query cache refetches them and gets the exact same bytes back,
 * so the refresh button must expire the server tags FIRST — the same ordering
 * the emails chart already requires (`refreshEmailChart` above).
 */
export async function refreshAnalyticsCache(
  orgSlug: string
): Promise<RefreshAnalyticsResult> {
  const log = createActionLogger("refreshAnalyticsCache", { orgSlug });

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { ok: false, reason: "unauthorized" };
    }

    const org = await getOrganizationWithMembership(orgSlug, session.user.id);
    if (!org) {
      return { ok: false, reason: "unauthorized" };
    }

    const now = Date.now();
    const last = lastAnalyticsRefreshByOrg.get(org.id);
    if (last !== undefined && now - last < ANALYTICS_REFRESH_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil(
        (ANALYTICS_REFRESH_COOLDOWN_MS - (now - last)) / 1000
      );
      log.info({ retryAfterSeconds }, "Analytics refresh throttled");
      return { ok: false, reason: "cooldown", retryAfterSeconds };
    }

    lastAnalyticsRefreshByOrg.set(org.id, now);
    updateTag(`analytics-overview-${org.id}`);
    updateTag(`analytics-sms-volume-${org.id}`);

    log.info({ organizationId: org.id }, "Analytics cache expired");
    return { ok: true, refreshedAt: now };
  } catch (error) {
    log.error(
      { err: serializeError(error) },
      "Failed to refresh analytics cache"
    );
    return { ok: false, reason: "error" };
  }
}
