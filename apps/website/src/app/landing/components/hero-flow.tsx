"use client";

import { BoxLabel, Reveal } from "./flow-primitives";
import { type Timeline, useStageLoop } from "./use-stage-loop";

/*
 * What "Email for teams on AWS" means, in one loop: one command builds the
 * stack inside a boundary labelled as the customer's AWS account, a teammate's
 * broadcast goes out from the dashboard, and delivery events land back in the
 * table inside that boundary.
 *
 * Resource and event names are the CLI's own (see PlatformStack in the product
 * clips). The contact count, times and initials are an example.
 *
 * It renders its finished frame first, so the server HTML, a slow connection
 * and prefers-reduced-motion all show the whole picture. After a beat it
 * replays the build once and then loops, always ending on that same frame.
 */

// [ms into the loop, stage reached]
const TIMELINE: Timeline = [
  [400, 1],
  [1100, 2],
  [1400, 3],
  [1700, 4],
  [2000, 5],
  [2300, 6],
  [2700, 7],
  [3000, 9],
  [3600, 10],
  [4100, 11],
  [4600, 12],
  [5100, 13],
];

export const HERO_FLOW = { final: 13, timeline: TIMELINE, loopMs: 11_000 };

const RESOURCES = [
  { name: "wraps-email-role", service: "IAM · OIDC" },
  { name: "wraps-email-acme-dev", service: "SES" },
  { name: "wraps-email-events-rule", service: "EventBridge" },
  { name: "wraps-email-event-processor", service: "Lambda" },
  { name: "wraps-email-history", service: "DynamoDB" },
];

const EVENTS = [
  { label: "Sent", detail: "acme.dev", dot: "bg-muted-foreground" },
  { label: "Delivered", detail: "250 OK", dot: "bg-success" },
  { label: "Opened", detail: "Chrome · macOS", dot: "bg-brand" },
  { label: "Clicked", detail: "/welcome", dot: "bg-foreground" },
];

const TEAM = ["JS", "AL", "MK"];

export function HeroFlow() {
  const { stage } = useStageLoop({ ...HERO_FLOW, trigger: "mount" });

  return (
    <div aria-hidden="true" className="text-left" data-stage={stage}>
      {/* The customer's AWS account */}
      <div className="relative rounded-xl border border-brand/50 border-dashed bg-background bg-linear-to-b from-brand/5 to-brand/5 px-3 pt-5 pb-3 sm:px-4">
        <BoxLabel tone="text-brand-text">Your AWS account</BoxLabel>

        <Reveal at={1} stage={stage}>
          <p className="font-mono text-foreground text-xs sm:text-sm">
            <span className="text-brand-text">$</span> npx @wraps.dev/cli email
            init
          </p>
        </Reveal>

        <ul className="mt-2.5 space-y-1 font-mono text-xs sm:text-sm">
          {RESOURCES.map((r, i) => (
            <li key={r.name}>
              <Reveal
                at={2 + i}
                className="flex items-baseline justify-between gap-3"
                stage={stage}
              >
                <span className="min-w-0 truncate text-foreground">
                  <span className="mr-2 text-success">+</span>
                  {r.name}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {r.service}
                </span>
              </Reveal>
            </li>
          ))}
        </ul>

        <Reveal at={7} stage={stage}>
          <p className="mt-1.5 font-mono text-success text-xs sm:text-sm">
            ✓ Email infrastructure deployed
          </p>
        </Reveal>

        <div className="mt-3 border-border border-t pt-2.5">
          <Reveal at={10} stage={stage}>
            <p className="flex items-center justify-between font-mono text-2xs text-muted-foreground uppercase tracking-widest">
              <span>Events</span>
              <span className="normal-case tracking-normal">
                wraps-email-history
              </span>
            </p>
          </Reveal>
          <ul className="mt-1.5 space-y-1 font-mono text-xs sm:text-sm">
            {EVENTS.map((e, i) => (
              <li key={e.label}>
                <Reveal
                  at={10 + i}
                  className="flex items-center gap-2"
                  stage={stage}
                >
                  <span className={`size-1.5 shrink-0 rounded-full ${e.dot}`} />
                  <span className="text-foreground">{e.label}</span>
                  <span className="truncate text-muted-foreground">
                    {e.detail}
                  </span>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Events travel back into the account */}
      <div className="flex h-9 items-center justify-center">
        <Reveal at={9} className="flex items-center gap-2" stage={stage}>
          <span className="h-4 w-px border-border border-l border-dashed" />
          <span className="font-mono text-2xs text-muted-foreground">
            ↑ events land in your table
          </span>
        </Reveal>
      </div>

      {/* The team's side: the Wraps dashboard */}
      <div className="relative rounded-xl border border-border bg-background px-3 pt-5 pb-3 sm:px-4">
        <BoxLabel tone="text-muted-foreground">Wraps dashboard</BoxLabel>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground text-sm">
              Product launch
            </p>
            <p className="text-muted-foreground text-xs">
              Broadcast · 5,432 contacts
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="flex -space-x-1.5">
              {TEAM.map((initials) => (
                <span
                  className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-3xs text-foreground"
                  key={initials}
                >
                  {initials}
                </span>
              ))}
            </span>
            <span
              className={`rounded border px-2 py-0.5 font-mono text-2xs uppercase tracking-widest transition-colors duration-300 ${
                stage >= 9
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {stage >= 9 ? "Sent" : "Ready"}
            </span>
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full bg-brand transition-all duration-1000 ease-out motion-reduce:transition-none ${
              stage >= 9 ? "w-full" : "w-0"
            }`}
          />
        </div>
      </div>
    </div>
  );
}
