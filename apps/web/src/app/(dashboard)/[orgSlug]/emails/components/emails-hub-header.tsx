"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ButtonGroup } from "@wraps/ui/components/ui/button-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { refreshAnalyticsCache, refreshEmailChart } from "@/actions/analytics";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { useHubDays } from "@/hooks/use-hub-days";
import { HUB_RANGES } from "@/lib/emails-hub";

type EmailsHubHeaderProps = {
  orgSlug: string;
};

/**
 * The `/emails` page heading, with the one range and one refresh that every
 * tab on the page obeys.
 */
export function EmailsHubHeader({ orgSlug }: EmailsHubHeaderProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const days = useHubDays();

  /**
   * Spoken once per refresh, and never on a timer. The refresh outcome is the
   * only thing this page announces; the data itself updates in place.
   */
  const [refreshStatus, setRefreshStatus] = useState("");

  function selectDays(next: string) {
    // Preserve every other param: tab, status, q, sort.
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function handleRefresh() {
    // Expire the server caches FIRST. Invalidating only the React Query cache
    // refetches routes wrapped in `unstable_cache`, which return the same bytes.
    const emailResult = await refreshEmailChart(orgSlug);
    const analyticsResult = await refreshAnalyticsCache(orgSlug);
    const failed =
      (!emailResult.ok && emailResult.reason === "error") ||
      (!analyticsResult.ok && analyticsResult.reason === "error");

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["emails", orgSlug] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
    ]);

    setRefreshStatus(failed ? "Could not refresh data." : "Data refreshed.");
  }

  return (
    <div className="@container/hub flex flex-wrap items-start justify-between gap-4 px-4 lg:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl tracking-tight">Emails</h1>
        <p className="text-muted-foreground">
          Every message, how people engage with it, and the health of your
          sending.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <p aria-live="polite" className="sr-only">
          {refreshStatus}
        </p>
        <ButtonGroup
          aria-label="Time range for all data on this page"
          className="@[767px]/hub:flex hidden"
        >
          {HUB_RANGES.map((range) => (
            <Button
              aria-pressed={days === range.days}
              key={range.days}
              onClick={() => selectDays(String(range.days))}
              size="touch"
              variant="outline"
            >
              {range.short}
            </Button>
          ))}
          <RefreshButton label="Refresh data" onRefresh={handleRefresh} />
        </ButtonGroup>
        <ButtonGroup className="@[767px]/hub:hidden flex">
          <Select onValueChange={selectDays} value={String(days)}>
            <SelectTrigger
              aria-label="Select time range"
              className="w-32 **:data-[slot=select-value]:block"
              size="touch"
            >
              <SelectValue placeholder="Last 30 days" />
            </SelectTrigger>
            <SelectContent>
              {HUB_RANGES.map((range) => (
                <SelectItem key={range.days} value={String(range.days)}>
                  {range.long}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RefreshButton label="Refresh data" onRefresh={handleRefresh} />
        </ButtonGroup>
      </div>
    </div>
  );
}
