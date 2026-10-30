import { useQuery } from "@tanstack/react-query";
import type { DrilldownWindow } from "@/lib/analytics-drilldown-window";
import type { ReasonsResponse } from "../components/reason-groups";

export type ReasonMetric = "bounce" | "complaint";

export class ReasonsRequestError extends Error {
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
 * never Date objects. With no window yet (the zone is read on mount), the
 * query waits.
 */
export function useDrilldownReasons(
  orgSlug: string,
  metric: ReasonMetric,
  window: DrilldownWindow | null
) {
  return useQuery<ReasonsResponse, ReasonsRequestError>({
    enabled: window !== null,
    queryKey: [
      "analytics",
      "drilldown",
      "reasons",
      orgSlug,
      metric,
      window?.days ?? null,
      window?.day ?? null,
      window?.tz ?? null,
    ],
    queryFn: async () => {
      if (window === null) {
        throw new ReasonsRequestError(0, "No window");
      }
      const params = new URLSearchParams({
        metric,
        days: String(window.days),
        tz: window.tz,
      });
      if (window.day) {
        params.set("day", window.day);
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
