import { Bell } from "lucide-react";
import type * as React from "react";

/*
 * The account survival card at product-shot scale, playing the one moment the
 * product exists for: a rate crossing AWS's review line and the right people
 * being told before AWS pauses sending.
 *
 * Everything drawn here exists in the dashboard and the hourly sweep:
 *   - the meters and their two lines (SES_THRESHOLDS, ses-survival-strip.tsx)
 *   - "All systems healthy" / "Needs attention" (health-status.tsx)
 *   - the notification title and body (ses.reputation_warning in
 *     apps/api/src/workers/account-health.ts), sent to owners and admins
 * The dashboard draws the current rate only, with no history, so this does not
 * draw a chart either. The readings are an example and the caption says so.
 *
 * The lines are AWS's: review at 5% bounce / 0.1% complaint, pause at 10% /
 * 0.5%, mirroring SES_THRESHOLDS in apps/api/src/lib/ses-health.ts.
 *
 * Motion is CSS only (globals.css, .hero-*). The un-animated styles below are
 * the resting frame: the bounce rate already past the review line.
 */

const SCALE_HEADROOM = 1.25;

/** Lays a rate out against its review and pause lines, as the dashboard does. */
function geometry(value: number, review: number, pause: number) {
  const scaleMax = pause * SCALE_HEADROOM;
  const along = (n: number) => Math.min(100, Math.max(0, (n / scaleMax) * 100));
  return {
    valuePct: along(value),
    reviewPct: along(review),
    pausePct: along(pause),
  } as const;
}

const BOUNCE = { from: 1.2, to: 6.8, review: 5, pause: 10 } as const;
const COMPLAINT = { value: 0.04, review: 0.1, pause: 0.5 } as const;
const QUOTA = { sent: 38_200, max: 50_000, warnRatio: 0.8 } as const;

const AUDIT = ["SPF", "DKIM", "DMARC"] as const;

function pct(n: number) {
  return `${n}%`;
}

function Ticks({
  reviewPct,
  pausePct,
  review,
  pause,
}: {
  reviewPct: number;
  pausePct: number;
  review: string;
  pause: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute top-[-4px] left-(--at) h-[16px] w-px bg-warning/70"
        style={{ "--at": pct(reviewPct) } as React.CSSProperties}
      />
      <span
        aria-hidden="true"
        className="absolute top-[-4px] left-(--at) h-[16px] w-px bg-destructive/70"
        style={{ "--at": pct(pausePct) } as React.CSSProperties}
      />
      <span
        className="absolute top-5 left-(--at) -translate-x-1/2 whitespace-nowrap font-mono text-2xs text-muted-foreground"
        style={{ "--at": pct(reviewPct) } as React.CSSProperties}
      >
        {review}
      </span>
      <span
        className="absolute top-5 left-(--at) -translate-x-1/2 whitespace-nowrap font-mono text-2xs text-muted-foreground"
        style={{ "--at": pct(pausePct) } as React.CSSProperties}
      >
        {pause}
      </span>
    </>
  );
}

function BounceMeter() {
  const from = geometry(BOUNCE.from, BOUNCE.review, BOUNCE.pause);
  const to = geometry(BOUNCE.to, BOUNCE.review, BOUNCE.pause);

  return (
    <div>
      <p className="text-muted-foreground text-sm">Bounce rate</p>
      <p className="mt-2 grid font-mono font-semibold text-4xl tabular-nums tracking-tight sm:text-3xl lg:text-5xl">
        <span
          aria-hidden="true"
          className="hero-swap-out col-start-1 row-start-1 text-foreground"
        >
          {BOUNCE.from.toFixed(2)}%
        </span>
        <span
          className="hero-swap-in col-start-1 row-start-1 text-warning"
          data-hero-pulse
        >
          {BOUNCE.to.toFixed(2)}%
        </span>
      </p>
      <div className="relative mt-5 h-2.5 w-full rounded-full bg-muted">
        <div
          className="hero-bounce-fill h-full w-(--to) rounded-full bg-warning"
          style={
            {
              "--from": pct(from.valuePct),
              "--to": pct(to.valuePct),
            } as React.CSSProperties
          }
        />
        <Ticks
          pause="pause 10%"
          pausePct={to.pausePct}
          review="review 5%"
          reviewPct={to.reviewPct}
        />
      </div>
      <div className="h-7" />
    </div>
  );
}

function ComplaintMeter() {
  const g = geometry(COMPLAINT.value, COMPLAINT.review, COMPLAINT.pause);

  return (
    <div>
      <p className="text-muted-foreground text-sm">Complaint rate</p>
      <p className="mt-2 font-mono font-semibold text-4xl text-foreground tabular-nums tracking-tight sm:text-3xl lg:text-5xl">
        {COMPLAINT.value.toFixed(2)}%
      </p>
      <div className="relative mt-5 h-2.5 w-full rounded-full bg-muted">
        <div
          className="h-full w-(--to) rounded-full bg-foreground"
          style={{ "--to": pct(g.valuePct) } as React.CSSProperties}
        />
        <Ticks
          pause="pause 0.5%"
          pausePct={g.pausePct}
          review="review 0.1%"
          reviewPct={g.reviewPct}
        />
      </div>
      <div className="h-7" />
    </div>
  );
}

function QuotaMeter() {
  const ratio = QUOTA.sent / QUOTA.max;

  return (
    <div>
      <p className="text-muted-foreground text-sm">24h quota</p>
      <p className="mt-2 whitespace-nowrap font-mono font-semibold text-4xl text-foreground tabular-nums tracking-tight sm:text-3xl lg:text-5xl">
        {QUOTA.sent.toLocaleString("en-US")}
        <span className="ml-1.5 font-normal text-base text-muted-foreground">
          / {QUOTA.max.toLocaleString("en-US")}
        </span>
      </p>
      <div className="relative mt-5 h-2.5 w-full rounded-full bg-muted">
        <div
          className="h-full w-(--to) rounded-full bg-foreground"
          style={{ "--to": pct(ratio * 100) } as React.CSSProperties}
        />
        <span
          aria-hidden="true"
          className="absolute top-[-4px] left-(--at) h-[16px] w-px bg-warning/70"
          style={{ "--at": pct(QUOTA.warnRatio * 100) } as React.CSSProperties}
        />
        <span
          className="absolute top-5 left-(--at) -translate-x-1/2 whitespace-nowrap font-mono text-2xs text-muted-foreground"
          style={{ "--at": pct(QUOTA.warnRatio * 100) } as React.CSSProperties}
        >
          warns at 80%
        </span>
      </div>
      <div className="h-7" />
    </div>
  );
}

function StatusPill() {
  return (
    <span className="inline-grid font-mono text-2xs uppercase tracking-widest">
      <span
        aria-hidden="true"
        className="hero-swap-out col-start-1 row-start-1 inline-flex items-center gap-1.5 justify-self-end rounded border border-success/40 bg-success/10 px-2.5 py-1 text-success"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
        All systems healthy
      </span>
      <span className="hero-swap-in col-start-1 row-start-1 inline-flex items-center gap-1.5 justify-self-end rounded border border-warning/40 bg-warning/10 px-2.5 py-1 text-warning">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
        Needs attention
      </span>
    </span>
  );
}

export function HeroSurvivalPanel() {
  return (
    <figure className="hero-rise relative m-0 mx-auto w-full max-w-5xl">
      {/* Warm light behind the panel; the one place the hero uses the brand colour as atmosphere. */}
      <div
        aria-hidden="true"
        className="-top-4 absolute inset-x-[16%] h-40 rounded-full bg-brand/15 blur-3xl"
      />

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xl ring-1 ring-foreground/[0.03]">
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-border border-b bg-muted/40 px-4 py-3 md:px-6">
          <div aria-hidden="true" className="hidden gap-1.5 sm:flex">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </div>
          <h3 className="whitespace-nowrap font-medium text-foreground text-sm">
            Account survival
          </h3>
          <StatusPill />
          <span className="ml-auto hidden font-mono text-muted-foreground text-xs sm:inline">
            us-east-1
          </span>
        </div>

        <div className="grid gap-8 p-6 sm:grid-cols-3 md:gap-10 md:p-8">
          <BounceMeter />
          <ComplaintMeter />
          <QuotaMeter />
        </div>

        {/* Deliverability audit */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-border border-t px-6 py-4 font-mono text-muted-foreground text-xs md:px-8">
          <span className="text-foreground">Deliverability audit</span>
          {AUDIT.map((name) => (
            <span className="inline-flex items-center gap-1.5" key={name}>
              <span className="text-success">✓</span>
              {name}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="text-success">✓</span>
            Blacklists clean on 50+ lists
          </span>
        </div>
      </div>

      {/* The notification the sweep sends, verbatim. */}
      <div className="hero-toast relative mt-3 w-full rounded-xl border border-border bg-popover p-4 text-left shadow-xl md:absolute md:-top-16 md:right-0 md:mt-0 md:w-[23rem] lg:-right-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning">
            <Bell aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-foreground text-sm">
              SES reputation needs attention
            </p>
            <p className="mt-1 text-pretty text-muted-foreground text-xs leading-relaxed">
              AWS account 123456789012 is in the SES review range: bounce rate
              6.80% (SES pauses sending at 10%).
            </p>
            <p className="mt-2 whitespace-nowrap font-mono text-3xs text-muted-foreground uppercase tracking-widest">
              Sent to owners and admins
            </p>
          </div>
        </div>
      </div>

      <figcaption className="mt-5 text-center text-muted-foreground text-xs">
        The dashboard&apos;s account survival card. Readings are an example; the
        lines are AWS&apos;s own.
      </figcaption>
    </figure>
  );
}
