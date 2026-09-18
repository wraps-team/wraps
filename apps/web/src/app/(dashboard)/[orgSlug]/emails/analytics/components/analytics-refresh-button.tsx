"use client";

import { useQueryClient } from "@tanstack/react-query";
import { refreshAnalyticsCache } from "@/actions/analytics";
import { RefreshButton } from "@/components/ui/refresh-button";

type AnalyticsRefreshButtonProps = {
  orgSlug: string;
};

/**
 * Refresh every analytics query on this page.
 *
 * The overview route fans out a CloudWatch reputation read per connected AWS
 * account and is wrapped in `unstable_cache` tagged `analytics-overview-<orgId>`,
 * so the server cache must be expired FIRST — invalidating only the React Query
 * cache refetches the route and hands back the exact same bytes.
 * `refreshAnalyticsCache` does that before this invalidates. The remaining
 * routes this page calls are dynamic and recompute from Postgres on refetch.
 */
export function AnalyticsRefreshButton({
  orgSlug,
}: AnalyticsRefreshButtonProps) {
  const queryClient = useQueryClient();

  async function handleRefresh() {
    await refreshAnalyticsCache(orgSlug);
    return queryClient.invalidateQueries({ queryKey: ["analytics"] });
  }

  return <RefreshButton onRefresh={handleRefresh} />;
}
