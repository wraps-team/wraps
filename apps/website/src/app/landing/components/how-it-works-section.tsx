import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { FlowStage } from "./flow-stage";
import { SectionKicker } from "./section-kicker";

/*
 * One bounce, end to end: the mechanism, drawn instead of described.
 *
 * Every box is something that exists. The resource names are the ones
 * `wraps email init` deploys. The event stream to Wraps and what it powers is
 * the BYOC page's own account of it. The sweep, the notification and the
 * broadcast hold are apps/api/src/workers/account-health.ts (hourly sweep,
 * owners and admins, once a day for an ongoing episode) and
 * apps/api/src/workers/batch-sender.ts (scheduled email broadcasts are held on
 * a fresh in_danger verdict).
 *
 * The sequence plays once, when the diagram scrolls into view (FlowStage).
 */

type Zone = "you" | "wraps";

type Step = {
  title: string;
  zone: Zone;
  /** Draws a short line down to the next box in the same column. */
  linksDown?: boolean;
  caption: React.ReactNode;
  /** Desktop grid cell. Mobile is a plain ordered list. */
  place: string;
};

const mono = "font-mono text-foreground";

const STEPS: Step[] = [
  {
    title: "SES",
    linksDown: true,
    zone: "you",
    caption: "A message bounces. SES records it.",
    place: "md:col-start-1 md:row-start-2",
  },
  {
    title: "EventBridge",
    linksDown: true,
    zone: "you",
    caption: (
      <>
        <span className={mono}>wraps-email-events-rule</span> catches the event.
      </>
    ),
    place: "md:col-start-1 md:row-start-3",
  },
  {
    title: "Lambda",
    linksDown: true,
    zone: "you",
    caption: (
      <>
        <span className={mono}>wraps-email-event-processor</span> handles it.
      </>
    ),
    place: "md:col-start-1 md:row-start-4",
  },
  {
    title: "DynamoDB",
    zone: "you",
    caption: (
      <>
        Written to <span className={mono}>wraps-email-history</span>, a table
        you own.
      </>
    ),
    place: "md:col-start-1 md:row-start-5",
  },
  {
    title: "Event stream",
    zone: "wraps",
    caption:
      "The same event streams to Wraps, which powers suppression and analytics.",
    place: "md:col-start-3 md:row-start-4",
  },
  {
    title: "SES reputation metrics",
    zone: "you",
    caption:
      "SES keeps its own tally of your bounce and complaint rates, and whether sending is enabled.",
    place: "md:col-start-1 md:row-start-6",
  },
  {
    title: "Hourly sweep",
    linksDown: true,
    zone: "wraps",
    caption:
      "Every hour, Wraps assumes a role you can revoke and reads those rates.",
    place: "md:col-start-3 md:row-start-6",
  },
  {
    title: "Owners and admins notified",
    linksDown: true,
    zone: "wraps",
    caption:
      "Past AWS's review line, the people who run the account hear about it.",
    place: "md:col-start-3 md:row-start-7",
  },
  {
    title: "Broadcasts held",
    zone: "wraps",
    caption:
      "At the pause line, scheduled broadcasts wait instead of queueing behind a paused account.",
    place: "md:col-start-3 md:row-start-8",
  },
];

const ZONE_TAG: Record<Zone, string> = {
  you: "Your AWS account",
  wraps: "Wraps",
};

const STEP_GAP_S = 0.55;

function Connector({
  place,
  label,
  direction,
  index,
}: {
  place: string;
  label: string;
  direction: "right" | "left";
  /** The step this arrow belongs to, so it lights with it. */
  index: number;
}) {
  const Arrow = direction === "right" ? ArrowRight : ArrowLeft;
  return (
    <div
      aria-hidden="true"
      className={`flow-node hidden flex-col items-center justify-center gap-1 px-3 text-center md:flex ${place}`}
      style={{ "--d": `${index * STEP_GAP_S}s` } as React.CSSProperties}
    >
      <span className="font-mono text-muted-foreground text-xs leading-tight">
        {label}
      </span>
      <Arrow className="size-5 text-brand-text" />
    </div>
  );
}

export function HowItWorksSection() {
  return (
    <section className="border-border border-b py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <SectionKicker>How it works</SectionKicker>
          <h2 className="mb-4 max-w-[24ch] text-balance font-heading font-semibold text-3xl tracking-tight md:text-4xl">
            Your email sends through your AWS, not ours.
          </h2>
          <p className="text-muted-foreground">
            Follow one bounce. The left side happens in your AWS account and
            stays there. Wraps sees the event stream, and reads your rates
            through a role you can revoke.
          </p>
        </div>

        <FlowStage>
          <div className="grid gap-3 md:grid-cols-[1fr_10rem_1fr] md:gap-y-3">
            {/* Zones: the two owners. Decorative, desktop only. */}
            <div
              aria-hidden="true"
              className="-mx-3 -my-3 hidden rounded-xl border border-brand/40 border-dashed bg-brand/[0.04] md:col-start-1 md:row-start-1 md:row-end-7 md:block"
            />
            <div
              aria-hidden="true"
              className="-mx-3 -my-3 hidden rounded-xl border border-border bg-muted/30 md:col-start-3 md:row-start-3 md:row-end-9 md:block"
            />
            <p
              aria-hidden="true"
              className="hidden font-mono text-muted-foreground text-xs uppercase tracking-widest md:col-start-1 md:row-start-1 md:block"
            >
              Your AWS account
            </p>
            <p
              aria-hidden="true"
              className="hidden font-mono text-muted-foreground text-xs uppercase tracking-widest md:col-start-3 md:row-start-3 md:block"
            >
              Wraps
            </p>

            <Connector
              direction="right"
              index={4}
              label="same event, streamed"
              place="md:col-start-2 md:row-start-4"
            />
            <Connector
              direction="left"
              index={6}
              label="role you can revoke"
              place="md:col-start-2 md:row-start-6"
            />

            <ol className="contents">
              {STEPS.map((step, i) => (
                <li
                  className={`flow-node relative rounded-lg border border-border bg-background px-4 py-3 shadow-xs md:self-start ${step.place} ${step.linksDown ? "after:absolute after:top-full after:left-[1.15rem] after:h-3 after:w-px after:bg-brand/60" : ""}`}
                  key={step.title}
                  style={{ "--d": `${i * STEP_GAP_S}s` } as React.CSSProperties}
                >
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-mono text-2xs text-brand-text">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-semibold text-foreground text-sm">
                      {step.title}
                    </h3>
                    <span className="ml-auto font-mono text-3xs text-muted-foreground uppercase tracking-widest md:hidden">
                      {ZONE_TAG[step.zone]}
                    </span>
                  </div>
                  <p className="mt-1.5 pl-7 text-muted-foreground text-xs leading-relaxed">
                    {step.caption}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </FlowStage>

        <div className="mt-8">
          <Link
            className="font-medium text-brand-text text-sm hover:text-brand-text hover:underline"
            href="/byoc"
          >
            What lives where, in full →
          </Link>
        </div>
      </div>
    </section>
  );
}
