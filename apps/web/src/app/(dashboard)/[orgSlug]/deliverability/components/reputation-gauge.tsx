"use client";

import { cn } from "@wraps/ui/lib/utils";
import { AlertTriangle, CheckCircle2, OctagonX } from "lucide-react";
import type { ReputationStatus } from "../lib/sample-data";

type ReputationGaugeProps = {
  /** Current measured rate (in %). */
  value: number;
  /** Value at which AWS moves the account under review. */
  reviewAt: number;
  /** Value at which AWS pauses sending. */
  pausedAt: number;
  /** Max value shown on the gauge (defaults to just past the paused line). */
  max?: number;
  status: ReputationStatus;
  label: string;
  /** Formats the numeric readout, e.g. (v) => `${v}%`. */
  format?: (v: number) => string;
};

const CENTER_X = 110;
const CENTER_Y = 110;
const RADIUS = 90;
const STROKE = 16;

// Map a value fraction (0..1) to a point on the top semicircle.
function pointFor(fraction: number) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const theta = Math.PI * (1 - clamped);
  return {
    x: CENTER_X + RADIUS * Math.cos(theta),
    y: CENTER_Y - RADIUS * Math.sin(theta),
  };
}

function arcPath(fromFraction: number, toFraction: number) {
  const start = pointFor(fromFraction);
  const end = pointFor(toFraction);
  const largeArc = Math.abs(toFraction - fromFraction) > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

const STATUS_META: Record<
  ReputationStatus,
  { color: string; label: string; Icon: typeof CheckCircle2 }
> = {
  healthy: { color: "text-success", label: "Healthy", Icon: CheckCircle2 },
  review: { color: "text-warning", label: "Under review", Icon: AlertTriangle },
  paused: { color: "text-destructive", label: "Sending paused", Icon: OctagonX },
};

export function ReputationGauge({
  value,
  reviewAt,
  pausedAt,
  max = pausedAt * 1.2,
  status,
  label,
  format = (v) => `${v}%`,
}: ReputationGaugeProps) {
  const reviewFraction = reviewAt / max;
  const pausedFraction = pausedAt / max;
  const valueFraction = Math.min(value / max, 1);
  const valuePoint = pointFor(valueFraction);
  const meta = STATUS_META[status];

  return (
    <figure className="flex flex-col items-center gap-1">
      <svg
        aria-hidden="true"
        className="h-auto w-full max-w-[240px]"
        role="img"
        viewBox="0 0 220 130"
      >
        {/* Healthy zone (green) */}
        <path
          className="stroke-success/30"
          d={arcPath(0, reviewFraction)}
          fill="none"
          strokeLinecap="round"
          strokeWidth={STROKE}
        />
        {/* Review zone (amber) */}
        <path
          className="stroke-warning/40"
          d={arcPath(reviewFraction, pausedFraction)}
          fill="none"
          strokeWidth={STROKE}
        />
        {/* Paused zone (red) */}
        <path
          className="stroke-destructive/40"
          d={arcPath(pausedFraction, 1)}
          fill="none"
          strokeLinecap="round"
          strokeWidth={STROKE}
        />
        {/* Value needle */}
        <line
          className={cn(
            "motion-safe:transition-all",
            status === "healthy"
              ? "stroke-success"
              : status === "review"
                ? "stroke-warning"
                : "stroke-destructive"
          )}
          strokeLinecap="round"
          strokeWidth={4}
          x1={CENTER_X}
          x2={valuePoint.x}
          y1={CENTER_Y}
          y2={valuePoint.y}
        />
        <circle
          className="fill-foreground"
          cx={CENTER_X}
          cy={CENTER_Y}
          r={6}
        />
      </svg>
      <figcaption className="-mt-6 flex flex-col items-center gap-1 text-center">
        <span className="font-bold font-mono text-3xl tabular-nums tracking-tight">
          {format(value)}
        </span>
        <span
          className={cn("flex items-center gap-1.5 font-medium text-sm", meta.color)}
        >
          <meta.Icon aria-hidden="true" className="size-4" />
          {meta.label}
        </span>
        <span className="text-muted-foreground text-xs">{label}</span>
      </figcaption>
    </figure>
  );
}
