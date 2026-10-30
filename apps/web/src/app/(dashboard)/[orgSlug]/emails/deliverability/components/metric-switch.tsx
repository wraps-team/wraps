"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wraps/ui/components/ui/toggle-group";
import { useQueryState } from "nuqs";
import {
  DELIVERABILITY_METRIC_LABEL,
  DELIVERABILITY_METRICS,
  type DeliverabilityMetric,
  metricParam,
} from "../lib/params";

function isMetric(value: string): value is DeliverabilityMetric {
  return (DELIVERABILITY_METRICS as readonly string[]).includes(value);
}

/**
 * The page-level metric switch. It sits under the Deliverability heading and
 * drives the chart, the driving panel and the side card together, through the
 * `metric` URL param.
 */
export function MetricSwitch() {
  const [metric, setMetric] = useQueryState("metric", metricParam);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-muted-foreground">Showing</span>
      <ToggleGroup
        aria-label="Metric for this section"
        onValueChange={(value) => {
          // A single-type group emits "" when the active item is clicked.
          if (value && isMetric(value)) {
            setMetric(value);
          }
        }}
        size="sm"
        type="single"
        value={metric}
        variant="outline"
      >
        {DELIVERABILITY_METRICS.map((option) => (
          <ToggleGroupItem key={option} value={option}>
            {DELIVERABILITY_METRIC_LABEL[option]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
