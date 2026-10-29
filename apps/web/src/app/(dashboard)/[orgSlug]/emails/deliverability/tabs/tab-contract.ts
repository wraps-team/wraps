import type { ComponentType } from "react";
import type {
  DrilldownMetric,
  DrilldownWindow,
} from "@/lib/analytics-drilldown-window";

export type DrilldownTabProps = {
  orgSlug: string;
  metric: DrilldownMetric;
  window: DrilldownWindow;
};

/**
 * One tab of the drill-down. Each tab file default-exports one of these. The
 * shell renders only tabs with `enabled: true`. A reserved tab stays
 * `enabled: false` until its owning spec flips the flag in its own file.
 */
export type DrilldownTab = {
  id: "sends" | "reasons" | "addresses" | "timeline";
  label: string;
  enabled: boolean;
  Component: ComponentType<DrilldownTabProps>;
};
