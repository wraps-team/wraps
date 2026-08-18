"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshButton } from "@/components/ui/refresh-button";

type AnalyticsRefreshButtonProps = {
  orgSlug: string;
};

/**
 * Refresh every analytics query on this page.
 *
 * Invalidating the React Query cache is sufficient here, unlike the emails
 * chart: none of the routes this page calls wrap their work in
 * `unstable_cache`, and each authenticates per request, so every one of them is
 * dynamic and recomputes from Postgres on refetch. If any of them ever gains a
 * cache tag, this handler must also await a server action that calls
 * `updateTag` BEFORE the refetch - see `refreshEmailChart` in
 * `src/actions/analytics.ts` - or the refetch will race the invalidation and
 * repopulate the cache with the stale value.
 */
export function AnalyticsRefreshButton({
  orgSlug,
}: AnalyticsRefreshButtonProps) {
  const queryClient = useQueryClient();

  function handleRefresh() {
    return queryClient.invalidateQueries({ queryKey: ["analytics"] });
  }

  return <RefreshButton onRefresh={handleRefresh} />;
}
