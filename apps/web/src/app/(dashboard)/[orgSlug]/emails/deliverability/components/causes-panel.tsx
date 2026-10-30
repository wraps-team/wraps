"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wraps/ui/components/ui/toggle-group";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  browserTimeZone,
  DRILLDOWN_BY,
  DRILLDOWN_METRIC_LABEL,
  type DrilldownBy,
  formatDrilldownDay,
  parseDrilldownWindow,
} from "@/lib/analytics-drilldown-window";
import { metricParam, readSendsBy, useDeliverabilityDays } from "../lib/params";
import sendsTab from "../tabs/sends-tab";
import { ChangesTable } from "./changes-table";

const BY_LABEL: Record<DrilldownBy, string> = {
  broadcast: "Broadcast",
  workflow: "Workflow",
  template: "Template",
  from: "From",
};

/** `drive=changes` shows the changes list. Any other value is the group-by table. */
const driveParam = parseAsStringLiteral(["changes"] as const);

/**
 * "What's driving your rate": the sends behind the deliverability card's
 * metric, grouped by one of four keys, or the changes in the window. The URL
 * carries the metric, the group-by (`sends.by`), the view (`drive`) and an
 * optional selected day (`day`).
 */
export function CausesPanel({ orgSlug }: { orgSlug: string }) {
  const [metric] = useQueryState("metric", metricParam);
  const [driveValue, setDrive] = useQueryState("drive", driveParam);
  const [byParam, setBy] = useQueryState("sends.by", parseAsString);
  const [day, setDay] = useQueryState("day", parseAsString);
  const days = useDeliverabilityDays();

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

  const by = readSendsBy(byParam);
  const changes = driveValue === "changes";
  const label = DRILLDOWN_METRIC_LABEL[metric].toLowerCase();

  let body: React.ReactNode;
  if (window === null) {
    body = <Skeleton className="h-64 w-full" />;
  } else if (changes) {
    body = <ChangesTable metric={metric} orgSlug={orgSlug} window={window} />;
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
          Which sends and changes moved this rate.
        </p>
      </div>

      <Panel
        className="@container/card"
        label={<PanelTitle level={3}>Breakdown</PanelTitle>}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              aria-label="Group by"
              onValueChange={(value) => {
                // A single-type group emits "" when the active item is clicked.
                if (value === "changes") {
                  setDrive("changes");
                } else if (
                  value &&
                  (DRILLDOWN_BY as readonly string[]).includes(value)
                ) {
                  setBy(value);
                  setDrive(null);
                }
              }}
              size="sm"
              type="single"
              value={changes ? "changes" : by}
              variant="outline"
            >
              {DRILLDOWN_BY.map((option) => (
                <ToggleGroupItem key={option} value={option}>
                  {BY_LABEL[option]}
                </ToggleGroupItem>
              ))}
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
        </div>
      </Panel>
    </section>
  );
}
