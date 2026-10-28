"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  AttributionCounts,
  AttributionGroup,
} from "@/lib/analytics-drilldown-rank";
import type {
  DrilldownBy,
  DrilldownMetric,
  DrilldownWindow,
} from "@/lib/analytics-drilldown-window";

export type DrilldownSendsResponse = {
  metric: DrilldownMetric;
  by: DrilldownBy;
  window: {
    mode: "rolling" | "day";
    days: number;
    day: string | null;
    from: string;
    to: string;
    tz: string;
  };
  floor: number;
  workflowLinks: boolean;
  totals: AttributionCounts & { rate: number | null };
  ranked: AttributionGroup[];
  belowFloor: AttributionGroup[];
  omitted: AttributionCounts & { groups: number };
};

export class DrilldownRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DrilldownRequestError";
    this.status = status;
  }
}

/**
 * Sends for one window, grouped by one dimension. The query key uses the
 * window's days, day and tz, never Date objects. Results are fresh for 60 s,
 * matching the uncached route.
 */
export function useDrilldownSends(
  orgSlug: string,
  metric: DrilldownMetric,
  by: DrilldownBy,
  window: DrilldownWindow
) {
  const { days, day, tz } = window;
  return useQuery<DrilldownSendsResponse, DrilldownRequestError>({
    queryKey: [
      "analytics",
      "drilldown",
      "sends",
      orgSlug,
      metric,
      by,
      days,
      day,
      tz,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        metric,
        by,
        days: String(days),
        tz,
      });
      if (day) {
        params.set("day", day);
      }
      const response = await fetch(
        `/api/${orgSlug}/analytics/drilldown/sends?${params.toString()}`
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new DrilldownRequestError(
          response.status,
          body?.error ?? "Failed to load causes"
        );
      }
      return (await response.json()) as DrilldownSendsResponse;
    },
    staleTime: 60_000,
    // Retry only server and network failures. A 400 or 422 will not change on retry.
    retry: (failureCount, error) =>
      failureCount < 1 &&
      (!(error instanceof DrilldownRequestError) || error.status >= 500),
  });
}
