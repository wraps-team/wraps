import type * as React from "react";

/*
 * Shared by the homepage hero and the account survival section.
 *
 * The lines are AWS's: review at 5% bounce / 0.1% complaint, pause at 10% /
 * 0.5%. They mirror SES_THRESHOLDS in apps/api/src/lib/ses-health.ts, the
 * source of truth for the hourly sweep. Callers pass the readings, which are
 * examples; the tick marks are the point of the figure.
 */

const SCALE_HEADROOM = 1.25;

/** Lays a rate out against its review and pause lines, as the dashboard does. */
export function geometry(value: number, review: number, pause: number) {
  const scaleMax = pause * SCALE_HEADROOM;
  const pct = (n: number) => Math.min(100, Math.max(0, (n / scaleMax) * 100));

  let level: "ok" | "review" | "pause" = "ok";
  if (value >= pause) {
    level = "pause";
  } else if (value >= review) {
    level = "review";
  }

  return {
    valuePct: pct(value),
    reviewPct: pct(review),
    pausePct: pct(pause),
    level,
  } as const;
}

type Level = ReturnType<typeof geometry>["level"];

const FILL: Record<Level, string> = {
  ok: "bg-foreground",
  review: "bg-warning",
  pause: "bg-destructive",
};

const TEXT: Record<Level, string> = {
  ok: "text-foreground",
  review: "text-warning",
  pause: "text-destructive",
};

export function Meter({
  label,
  display,
  value,
  review,
  pause,
  note,
}: {
  label: string;
  display: string;
  value: number;
  review: number;
  pause: number;
  note: string;
}) {
  const { valuePct, reviewPct, pausePct, level } = geometry(
    value,
    review,
    pause
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`font-mono font-semibold text-2xl tabular-nums tracking-tight ${TEXT[level]}`}
      >
        {display}
      </p>
      <div className="relative h-1.5 w-full rounded-full bg-muted">
        <div
          className={`h-full w-(--value) rounded-full ${FILL[level]}`}
          style={{ "--value": `${valuePct}%` } as React.CSSProperties}
        />
        {/* AWS's two lines. These are the component. */}
        <span
          aria-hidden="true"
          className="absolute top-[-3px] left-(--review) h-[12px] w-px bg-muted-foreground/60"
          style={{ "--review": `${reviewPct}%` } as React.CSSProperties}
        />
        <span
          aria-hidden="true"
          className="absolute top-[-3px] left-(--pause) h-[12px] w-px bg-muted-foreground"
          style={{ "--pause": `${pausePct}%` } as React.CSSProperties}
        />
      </div>
      <p className="text-2xs text-muted-foreground leading-normal">{note}</p>
    </div>
  );
}

const QUOTA_SENT = 38_200;
const QUOTA_MAX = 50_000;
const QUOTA_WARN_RATIO = 0.8;

export function QuotaMeter() {
  const ratio = QUOTA_SENT / QUOTA_MAX;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">24h quota</p>
      <p className="font-mono font-semibold text-2xl text-foreground tabular-nums tracking-tight whitespace-nowrap">
        {QUOTA_SENT.toLocaleString("en-US")}
        <span className="ml-1 font-normal text-sm text-muted-foreground">
          / {QUOTA_MAX.toLocaleString("en-US")}
        </span>
      </p>
      <div className="relative h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-full w-(--ratio) rounded-full bg-foreground"
          style={{ "--ratio": `${ratio * 100}%` } as React.CSSProperties}
        />
        <span
          aria-hidden="true"
          className="absolute top-[-3px] left-(--warn) h-[12px] w-px bg-muted-foreground"
          style={
            { "--warn": `${QUOTA_WARN_RATIO * 100}%` } as React.CSSProperties
          }
        />
      </div>
      <p className="text-2xs text-muted-foreground leading-normal">
        Warns at 80% of the send quota AWS grants the account.
      </p>
    </div>
  );
}
