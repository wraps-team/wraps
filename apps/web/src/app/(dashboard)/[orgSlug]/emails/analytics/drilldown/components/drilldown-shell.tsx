"use client";

import { Tabs, TabsList, TabsTrigger } from "@wraps/ui/components/ui/tabs";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wraps/ui/components/ui/toggle-group";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import {
  DRILLDOWN_METRIC_LABEL,
  DRILLDOWN_METRICS,
  type DrilldownMetric,
  describeDrilldownWindow,
  parseDrilldownWindow,
} from "@/lib/analytics-drilldown-window";
import { hubHref } from "@/lib/emails-hub";
import reasonsTab from "../../../deliverability/tabs/reasons-tab";
import sendsTab from "../../../deliverability/tabs/sends-tab";
import type { DrilldownTab } from "../../../deliverability/tabs/tab-contract";
import timelineTab from "../../../deliverability/tabs/timeline-tab";
import addressesTab from "../tabs/addresses-tab";

// Enabled tabs only. A reserved tab is not rendered, so the shell needs no
// edit when a tab's owning spec turns it on.
const TABS: DrilldownTab[] = [sendsTab, reasonsTab, addressesTab, timelineTab];
const ENABLED_TABS = TABS.filter((tab) => tab.enabled);

function isMetric(value: string | null): value is DrilldownMetric {
  return (DRILLDOWN_METRICS as readonly string[]).includes(value ?? "");
}

export function DrilldownShell({ orgSlug }: { orgSlug: string }) {
  const [metricParam, setMetric] = useQueryState("metric", parseAsString);
  const [daysParam] = useQueryState("days", parseAsString);
  const [dayParam] = useQueryState("day", parseAsString);
  const [tzParam] = useQueryState("tz", parseAsString);
  const [tabParam, setTab] = useQueryState("tab", parseAsString);

  const metric: DrilldownMetric = isMetric(metricParam)
    ? metricParam
    : "bounce";
  const window = parseDrilldownWindow(
    { days: daysParam, day: dayParam, tz: tzParam },
    new Date()
  );
  const activeTab =
    ENABLED_TABS.find((tab) => tab.id === tabParam) ?? ENABLED_TABS[0];
  const windowLabel = describeDrilldownWindow(window);

  return (
    <div className="flex flex-col gap-6">
      <Link
        className="text-muted-foreground text-sm hover:text-foreground"
        href={hubHref(orgSlug, { tab: "deliverability" })}
      >
        Back to Deliverability
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl tracking-tight">Why this rate</h1>
        <p className="text-muted-foreground">
          {`${DRILLDOWN_METRIC_LABEL[metric]} for ${windowLabel}`}
        </p>
      </div>

      <ToggleGroup
        aria-label="Metric"
        onValueChange={(value) => {
          if (isMetric(value)) {
            setMetric(value);
          }
        }}
        type="single"
        value={metric}
        variant="outline"
      >
        {DRILLDOWN_METRICS.map((option) => (
          <ToggleGroupItem key={option} value={option}>
            {DRILLDOWN_METRIC_LABEL[option]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Tabs onValueChange={(value) => setTab(value)} value={activeTab?.id}>
        <TabsList>
          {ENABLED_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activeTab ? (
        <activeTab.Component
          metric={metric}
          orgSlug={orgSlug}
          window={window}
        />
      ) : null}

      <p className="text-muted-foreground text-xs">
        {`Counts are for sends made in ${windowLabel}, bucketed by when each send was made, so a send that bounces later still counts here. Rates here are window rates. The account reputation SES publishes, and the health check built on it, measure a different population and can differ.`}
      </p>
    </div>
  );
}
