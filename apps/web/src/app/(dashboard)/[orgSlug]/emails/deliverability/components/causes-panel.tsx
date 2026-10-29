"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wraps/ui/components/ui/toggle-group";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useHubDays } from "@/hooks/use-hub-days";
import {
  browserTimeZone,
  DRILLDOWN_METRIC_LABEL,
  formatDrilldownDay,
  parseDrilldownWindow,
} from "@/lib/analytics-drilldown-window";
import { metricParam } from "../lib/params";
import reasonsTab from "../tabs/reasons-tab";
import sendsTab from "../tabs/sends-tab";
import timelineTab from "../tabs/timeline-tab";

const DRIVES = ["causes", "reasons", "changes"] as const;
type Drive = (typeof DRIVES)[number];

const driveParam = parseAsStringLiteral(DRIVES).withDefault("causes");

function isDrive(value: string): value is Drive {
  return (DRIVES as readonly string[]).includes(value);
}

/**
 * "What's driving your rate": the sends, reasons and changes behind the
 * deliverability card's metric, reusing the drilldown's tabs. The URL carries
 * the metric, the view (`drive`) and an optional selected day (`day`).
 */
export function CausesPanel({ orgSlug }: { orgSlug: string }) {
  const [metric] = useQueryState("metric", metricParam);
  const [driveValue, setDrive] = useQueryState("drive", driveParam);
  const [day, setDay] = useQueryState("day", parseAsString);
  const days = useHubDays();

  // Null until mounted: the server render must not carry the server's zone.
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => {
    setTz(browserTimeZone());
  }, []);

  const window = useMemo(
    () =>
      tz === null
        ? null
        : parseDrilldownWindow({ days: String(days), day, tz }, new Date()),
    [days, day, tz]
  );

  // Suppressions have no reasons view, so a reasons link falls back to causes.
  const showReasons = metric !== "suppression";
  const drive: Drive =
    driveValue === "reasons" && !showReasons ? "causes" : driveValue;

  const label = DRILLDOWN_METRIC_LABEL[metric].toLowerCase();

  let body: ReactNode;
  if (window === null) {
    body = <Skeleton className="h-64 w-full" />;
  } else if (drive === "reasons") {
    body = (
      <reasonsTab.Component metric={metric} orgSlug={orgSlug} window={window} />
    );
  } else if (drive === "changes") {
    body = (
      <timelineTab.Component
        metric={metric}
        orgSlug={orgSlug}
        window={window}
      />
    );
  } else {
    body = (
      <sendsTab.Component metric={metric} orgSlug={orgSlug} window={window} />
    );
  }

  return (
    <section className="space-y-3" id="deliverability-causes">
      <div className="space-y-1">
        <h2 className="font-semibold text-lg">
          {`What's driving your ${label}`}
        </h2>
        <p className="text-muted-foreground text-sm">
          Which sends, reasons and changes moved this rate.
        </p>
      </div>

      <Card className="@container/card">
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              aria-label="View"
              onValueChange={(value) => {
                // A single-type group emits "" when the active item is clicked.
                if (value && isDrive(value)) {
                  setDrive(value);
                }
              }}
              size="sm"
              type="single"
              value={drive}
              variant="outline"
            >
              <ToggleGroupItem value="causes">Causes</ToggleGroupItem>
              {showReasons ? (
                <ToggleGroupItem value="reasons">Reasons</ToggleGroupItem>
              ) : null}
              <ToggleGroupItem value="changes">Changes</ToggleGroupItem>
            </ToggleGroup>

            {day ? (
              <div className="flex items-center gap-1">
                <Badge variant="secondary">
                  {`Showing ${formatDrilldownDay(day)}`}
                </Badge>
                <Button onClick={() => setDay(null)} size="sm" variant="ghost">
                  Clear
                </Button>
              </div>
            ) : null}
          </div>

          {body}
        </CardContent>
      </Card>
    </section>
  );
}
