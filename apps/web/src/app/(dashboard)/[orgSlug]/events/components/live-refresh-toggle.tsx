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
// No one watches a live-updating table for longer than this in one sitting —
// cap it so a forgotten tab can't poll the DB indefinitely. Re-enabling the
// switch (or the tab regaining focus) starts a fresh window.
const MAX_LIVE_DURATION_MS = 5 * 60 * 1000;

export function LiveRefreshToggle({ params }: LiveRefreshToggleProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const eligible = canAutoRefresh(params);
  const [enabled, setEnabled] = useState(true);
  // Assumed visible for the server render and for hydration — the effect
  // below corrects it on mount. Reading `document` here would crash the
  // server render, and computing a different value on the client would be a
  // hydration mismatch.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVisibilityChange = () => {
      setVisible(document.visibilityState === "visible");
    };
    // Run once on mount too — a tab that is already hidden when this mounts
    // must not wait for the next visibilitychange event to stop polling.
    onVisibilityChange();
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
    const cap = setTimeout(() => setEnabled(false), MAX_LIVE_DURATION_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(cap);
    };
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
