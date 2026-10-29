"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  type DrilldownWindow,
  describeDrilldownWindow,
} from "@/lib/analytics-drilldown-window";
import {
  ReasonGroups,
  type ReasonsResponse,
} from "../components/reason-groups";
import type { DrilldownTab, DrilldownTabProps } from "./tab-contract";

type ReasonMetric = "bounce" | "complaint";

class ReasonsRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ReasonsRequestError";
    this.status = status;
  }
}

/**
 * Reasons for one window, from the reasons route. Results are fresh for 60 s,
 * matching the sends tab. The query key holds the window's days, day and tz,
 * never Date objects.
 */
function useDrilldownReasons(
  orgSlug: string,
  metric: ReasonMetric,
  window: DrilldownWindow,
  enabled: boolean
) {
  const { days, day, tz } = window;
  return useQuery<ReasonsResponse, ReasonsRequestError>({
    enabled,
    queryKey: [
      "analytics",
      "drilldown",
      "reasons",
      orgSlug,
      metric,
      days,
      day,
      tz,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        metric,
        days: String(days),
        tz,
      });
      if (day) {
        params.set("day", day);
      }
      const response = await fetch(
        `/api/${orgSlug}/analytics/drilldown/reasons?${params.toString()}`
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new ReasonsRequestError(
          response.status,
          body?.error ?? "Failed to load reasons"
        );
      }
      return (await response.json()) as ReasonsResponse;
    },
    staleTime: 60_000,
    // A 400 will not change on retry. Retry only a server or network failure.
    retry: (failureCount, error) =>
      failureCount < 1 &&
      (!(error instanceof ReasonsRequestError) || error.status >= 500),
  });
}

function errorMessage(status: number, label: string): string {
  if (status === 400) {
    return "This link is not valid. Go back to analytics and open it again.";
  }
  return `Could not load the reasons for ${label}.`;
}

function ReasonsTab({ orgSlug, metric, window }: DrilldownTabProps) {
  const label = describeDrilldownWindow(window);
  // Suppressions have no reasons view: the suppression chart covers them. The
  // query is disabled for that metric, so the route is never asked for it.
  const reasonMetric: ReasonMetric | null =
    metric === "suppression" ? null : metric;
  const query = useDrilldownReasons(
    orgSlug,
    reasonMetric ?? "bounce",
    window,
    reasonMetric !== null
  );

  if (reasonMetric === null) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No reasons for suppressions</EmptyTitle>
          <EmptyDescription>
            Suppressions are not broken down by reason. The suppression chart on
            the analytics page covers them.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <span className="sr-only">Loading reasons for {label}</span>
        <Skeleton className="h-5 w-2/3" />
        {[0, 1, 2].map((row) => (
          <Skeleton className="h-16 w-full" key={row} />
        ))}
      </div>
    );
  }

  if (query.error || !query.data) {
    const status = query.error?.status ?? 0;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          {errorMessage(status, label)}
        </p>
        {status === 400 ? null : (
          <div>
            <Button onClick={() => query.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <ReasonGroups metric={reasonMetric} response={query.data} tz={window.tz} />
  );
}

const reasonsTab = {
  id: "reasons",
  label: "Reasons",
  enabled: true,
  Component: ReasonsTab,
} satisfies DrilldownTab;

export default reasonsTab;
