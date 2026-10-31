"use client";

import type { ReactNode } from "react";
import type { SesHealthDetail } from "@/hooks/use-ses-health-queries";
import {
  formatRate,
  formatThreshold,
  type MeterGeometry,
  type MeterLevel,
  meterGeometry,
  SES_THRESHOLDS,
} from "@/lib/ses-thresholds";
import { cn } from "@/lib/utils";

/**
 * The one way the dashboard draws a figure against AWS's lines: SES bounce
 * and complaint rates, and the 24h sending quota. The Overview strip, the
 * Emails hub and the AWS account page all render these, so they read as the
 * same instrument wherever they appear.
 */

const LEVEL_FILL: Record<MeterLevel, string> = {
  ok: "bg-foreground",
  review: "bg-warning",
  pause: "bg-destructive",
};

const LEVEL_TEXT: Record<MeterLevel, string> = {
  ok: "text-foreground",
  review: "text-warning",
  pause: "text-destructive",
};

type Tick = { pct: number; level: Exclude<MeterLevel, "ok"> };

const TICK_COLOR: Record<Tick["level"], string> = {
  review: "bg-warning/70",
  pause: "bg-destructive/70",
};

/**
 * The bar and its ticks. The track is a tint of the foreground rather than
 * `bg-muted`: every meter sits on an "own" panel, and the muted track all but
 * vanishes on that panel's tint.
 */
function MeterBar({
  fillPct,
  level,
  ticks,
}: {
  fillPct: number;
  level: MeterLevel;
  ticks: Tick[];
}) {
  return (
    <div
      aria-hidden="true"
      className="relative h-1.5 min-w-0 flex-1 bg-foreground/10"
      data-slot="threshold-bar"
    >
      <div
        className={cn("h-full", LEVEL_FILL[level])}
        data-slot="threshold-fill"
        style={{ width: `${fillPct}%` }}
      />
      {ticks.map((tick) => (
        <span
          className={cn(
            "absolute top-[-2px] h-[10px] w-px",
            TICK_COLOR[tick.level]
          )}
          key={tick.level}
          style={{ left: `${tick.pct}%` }}
        />
      ))}
    </div>
  );
}

/**
 * The layout every meter shares: a mono eyebrow with the label on the left and
 * the lines on the right, then the figure with its bar beside it.
 *
 * The eyebrow stays on one line at every width. Beside the Emails chart the
 * panel has no height to spare, so when the words do not fit, the meter's own
 * container query drops them and the coloured ticks carry the meaning.
 */
function Meter({
  label,
  meta,
  value,
  valueClassName,
  bar,
  className,
}: {
  label: string;
  meta?: ReactNode;
  value: ReactNode;
  valueClassName?: string;
  bar?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("@container/meter flex flex-col", className)}>
      <div className="flex items-baseline justify-between gap-4 whitespace-nowrap font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
        <span>{label}</span>
        {meta ? <span className="tabular-nums">{meta}</span> : null}
      </div>
      <div className="mt-1.5 flex items-center gap-4">
        <span
          className={cn(
            "whitespace-nowrap font-heading font-semibold text-2xl leading-none tabular-nums",
            valueClassName
          )}
        >
          {value}
        </span>
        {bar}
      </div>
    </div>
  );
}

const RATE = {
  bounce: { label: "Bounce rate", digits: 2 },
  complaint: { label: "Complaint rate", digits: 3 },
} as const;

/**
 * An SES reputation rate against the lines where AWS reviews and pauses the
 * account. A bare "0.05%" leaves the reader to know that AWS reviews at 5%;
 * the bar says how much room is left.
 *
 * `value` is a DECIMAL (0.0005 = 0.05%), like `SES_THRESHOLDS`. `rated: false`
 * is for a rate computed from a window of Wraps' own events: that is not the
 * population AWS enforces on, so it gets the number without the lines.
 */
export function RateMeter({
  metric,
  value,
  rated = true,
  className,
}: {
  metric: keyof typeof RATE;
  value: number | null;
  rated?: boolean;
  className?: string;
}) {
  const { label, digits } = RATE[metric];
  const { review, pause } = SES_THRESHOLDS[metric];

  const meta = rated ? (
    <>
      <span className="hidden @[20rem]/meter:inline">Review </span>
      {formatThreshold(review)} ·{" "}
      <span className="hidden @[20rem]/meter:inline">pause </span>
      {formatThreshold(pause)}
    </>
  ) : null;

  if (value === null) {
    return (
      <Meter
        bar={
          <span className="text-muted-foreground text-xs">
            No metrics published yet
          </span>
        }
        className={className}
        label={label}
        meta={meta}
        value="—"
        valueClassName="text-muted-foreground"
      />
    );
  }

  const geometry: MeterGeometry | null = rated
    ? meterGeometry(value, review, pause)
    : null;

  return (
    <Meter
      bar={
        geometry ? (
          <MeterBar
            fillPct={geometry.valuePct}
            level={geometry.level}
            ticks={[
              { pct: geometry.reviewPct, level: "review" },
              { pct: geometry.pausePct, level: "pause" },
            ]}
          />
        ) : null
      }
      className={className}
      label={label}
      meta={meta}
      value={formatRate(value, digits)}
      valueClassName={geometry ? LEVEL_TEXT[geometry.level] : undefined}
    />
  );
}

/**
 * The 24h sending quota. AWS has no enforcement line here — running out is
 * just running out — so the one tick is where running out starts to matter.
 */
export function QuotaMeter({
  detail,
  className,
}: {
  detail: SesHealthDetail | null;
  className?: string;
}) {
  const label = "24h quota";

  if (detail?.sentLast24Hours == null || detail.max24HourSend === null) {
    return (
      <Meter
        bar={
          detail ? (
            <span className="text-muted-foreground text-xs">
              Quota not reported
            </span>
          ) : null
        }
        className={className}
        label={label}
        value="—"
        valueClassName="text-muted-foreground"
      />
    );
  }

  const { sentLast24Hours, max24HourSend, maxSendRate, quotaUsedRatio } =
    detail;

  // SES reports an unlimited-in-practice quota as -1 on some account types.
  const isUnlimited = max24HourSend < 0;
  const ratio = quotaUsedRatio ?? 0;
  const level: MeterLevel =
    !isUnlimited && ratio >= SES_THRESHOLDS.quotaWarnRatio ? "review" : "ok";

  return (
    <Meter
      bar={
        isUnlimited ? null : (
          <MeterBar
            fillPct={Math.min(100, ratio * 100)}
            level={level}
            ticks={[
              { pct: SES_THRESHOLDS.quotaWarnRatio * 100, level: "review" },
            ]}
          />
        )
      }
      className={className}
      label={label}
      meta={
        <>
          {isUnlimited ? "No daily cap" : `${formatRate(ratio, 1)} used`}
          {maxSendRate !== null && (
            <span className="hidden @[20rem]/meter:inline">
              {` · ${maxSendRate}/s max`}
            </span>
          )}
        </>
      }
      value={
        <>
          {sentLast24Hours.toLocaleString()}
          <span className="font-normal font-sans text-muted-foreground text-sm">
            {isUnlimited ? " sent" : ` / ${max24HourSend.toLocaleString()}`}
          </span>
        </>
      }
      valueClassName={LEVEL_TEXT[level]}
    />
  );
}
