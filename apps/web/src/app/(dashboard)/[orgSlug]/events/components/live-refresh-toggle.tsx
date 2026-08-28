"use client";

import { Label } from "@wraps/ui/components/ui/label";
import { Switch } from "@wraps/ui/components/ui/switch";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { canAutoRefresh, type EventsViewParams } from "./live-refresh";

type LiveRefreshToggleProps = {
  params: EventsViewParams;
};

const REFRESH_INTERVAL_MS = 15_000;

export function LiveRefreshToggle({ params }: LiveRefreshToggleProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const eligible = canAutoRefresh(params);
  const [enabled, setEnabled] = useState(true);
  // Initialised from the current tab state rather than defaulting to visible
  // — a background tab should never start polling just because it mounted.
  const [visible, setVisible] = useState(
    () => document.visibilityState === "visible"
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      setVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const live = eligible && enabled && visible;

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    if (!live) {
      return;
    }
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [live, refresh]);

  return (
    <div className="flex items-center gap-2">
      <Label className="text-sm" htmlFor="events-live-refresh">
        Live
      </Label>
      <Switch
        aria-label="Live updates"
        checked={enabled}
        disabled={!eligible}
        id="events-live-refresh"
        onCheckedChange={setEnabled}
      />
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-muted-foreground",
          live && "animate-pulse bg-primary"
        )}
      />
      <span className="text-muted-foreground text-xs">
        {eligible
          ? enabled
            ? `Updating every ${REFRESH_INTERVAL_MS / 1000}s`
            : "Paused"
          : "Live updates pause while filtered"}
      </span>
    </div>
  );
}
