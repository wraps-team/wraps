import { useQuery } from "@tanstack/react-query";

type EventUsageResponse = {
  current: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  planId: string;
  threshold: "normal" | "warning" | "critical" | "exceeded";
  warning: string | null;
  action: "upgrade" | "view_usage" | null;
};

/**
 * Hook to fetch and track custom-event usage for an organization.
 *
 * Free includes 5,000 custom events/month; every paid plan is unlimited and
 * reports `limit: -1`. This never reflects email sends, which are unmetered.
 */
export function useEventUsage(orgSlug: string) {
  return useQuery<EventUsageResponse>({
    queryKey: ["event-usage", orgSlug],
    queryFn: async () => {
      const response = await fetch(`/api/${orgSlug}/events/usage`);
      if (!response.ok) {
        throw new Error("Failed to fetch event usage");
      }
      return response.json();
    },
    // Refetch every 5 minutes as fallback (events come from SDK, not dashboard)
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
}

/**
 * Get query key for event usage (for cache invalidation)
 */
export function getEventUsageQueryKey(orgSlug: string) {
  return ["event-usage", orgSlug];
}
