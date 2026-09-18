"use client";

import { useQueryClient } from "@tanstack/react-query";
import { refreshAnalyticsCache } from "@/actions/analytics";
import { RefreshButton } from "@/components/ui/refresh-button";

type SMSAnalyticsRefreshButtonProps = {
  orgSlug: string;
};

/**
 * Refresh every SMS analytics query on this page.
 *
 * The volume route fans out a DynamoDB Query per connected AWS account and is
 * wrapped in `unstable_cache` tagged `analytics-sms-volume-<orgId>`, so the
 * server cache must be expired FIRST — invalidating only the React Query cache
 * refetches the route and hands back the exact same bytes.
 * `refreshAnalyticsCache` does that before this invalidates. The remaining
 * routes this page calls are dynamic and recompute on refetch.
 */
export function SMSAnalyticsRefreshButton({
  orgSlug,
}: SMSAnalyticsRefreshButtonProps) {
  const queryClient = useQueryClient();

  async function handleRefresh() {
    await refreshAnalyticsCache(orgSlug);
    return queryClient.invalidateQueries({ queryKey: ["analytics", "sms"] });
  }

  return <RefreshButton onRefresh={handleRefresh} />;
}
