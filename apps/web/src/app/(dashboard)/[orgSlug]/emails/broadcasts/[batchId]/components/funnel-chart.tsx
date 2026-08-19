"use client";

import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { useEffect, useRef, useState } from "react";
import { SERIES_COLOR } from "@/lib/chart-series";
import {
  calculateFunnelStages,
  type FunnelStage,
  generateFunnelSectionPaths,
} from "./funnel-utils";

type FunnelChartProps = {
  channel: "email" | "sms";
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
  bounced: number;
  complained: number;
};

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function formatRate(rate: number): string {
  return rate % 1 === 0 ? `${rate}%` : `${rate}%`;
}

const FUNNEL_HEIGHT = 120;

// One color per stage - sections blend between adjacent stage colors.
// These are the same four stages the emails chart plots, so they take the same
// four colours: this funnel used to draw Delivered violet and Opened pink while
// the emails card drew them green and amber.
const STAGE_COLORS = [
  SERIES_COLOR.volume, // Sent
  SERIES_COLOR.success, // Delivered
  SERIES_COLOR.attention, // Opened
  SERIES_COLOR.engagement, // Clicked
];

export function FunnelChart(props: FunnelChartProps) {
  const stages = calculateFunnelStages(props);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(800);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setChartWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const widths = stages.map((s) => s.widthPercent);
  const sectionPaths = generateFunnelSectionPaths(widths, {
    width: chartWidth,
    height: FUNNEL_HEIGHT,
  });
  const sectionWidth = chartWidth / Math.max(stages.length - 1, 1);

  const gridCols = `repeat(${stages.length}, 1fr)`;

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Stage labels — grid with N equal columns */}
        <div
          className="mb-3"
          style={{ display: "grid", gridTemplateColumns: gridCols }}
        >
          {stages.map((stage, i) => (
            <div key={stage.label}>
              <div className="font-bold text-2xl tabular-nums">
                {formatCount(stage.count)}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: STAGE_COLORS[i % STAGE_COLORS.length],
                  }}
                />
                {stage.label}
              </div>
              {stage.rate !== null && (
                <div className="text-muted-foreground text-xs">
                  {formatRate(stage.rate)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* SVG funnel */}
        <div className="w-full" ref={containerRef}>
          <svg
            className="w-full"
            height={FUNNEL_HEIGHT}
            preserveAspectRatio="none"
            viewBox={`0 0 ${chartWidth} ${FUNNEL_HEIGHT}`}
            width={chartWidth}
          >
            <defs>
              {sectionPaths.map((_, i) => (
                <linearGradient
                  id={`funnel-section-${i}`}
                  key={`grad-${i}`}
                  x1="0%"
                  x2="100%"
                  y1="0%"
                  y2="0%"
                >
                  <stop
                    offset="0%"
                    stopColor={STAGE_COLORS[i % STAGE_COLORS.length]}
                  />
                  <stop
                    offset="100%"
                    stopColor={STAGE_COLORS[(i + 1) % STAGE_COLORS.length]}
                  />
                </linearGradient>
              ))}
            </defs>
            {sectionPaths.map((d, i) => (
              <path
                d={d}
                fill={`url(#funnel-section-${i})`}
                key={`section-${i}`}
              />
            ))}
            {/* Vertical dividers at each inner stage boundary */}
            {stages.slice(1, -1).map((_, i) => {
              const x = (i + 1) * sectionWidth;
              return (
                <line
                  key={`divider-${i}`}
                  stroke="hsl(var(--background))"
                  strokeWidth="2"
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={FUNNEL_HEIGHT}
                />
              );
            })}
          </svg>
        </div>

        {/* Issue indicators — same grid layout */}
        <FunnelIssues gridCols={gridCols} stages={stages} />
      </CardContent>
    </Card>
  );
}

function FunnelIssues({
  stages,
  gridCols,
}: {
  stages: FunnelStage[];
  gridCols: string;
}) {
  const hasAnyIssues = stages.some((s) => s.issues.length > 0);
  if (!hasAnyIssues) {
    return null;
  }

  return (
    <div
      className="mt-2"
      role="list"
      style={{ display: "grid", gridTemplateColumns: gridCols }}
    >
      {stages.map((stage) => (
        <div key={stage.label}>
          {stage.issues.map((issue) => (
            <div className="text-destructive text-xs" key={issue.label}>
              {issue.count} {issue.label}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
