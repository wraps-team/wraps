import Link from "next/link";
import type * as React from "react";
import { BroadcastFlow } from "./broadcast-flow";
import { HealthFlow } from "./health-flow";
import { SectionKicker } from "./section-kicker";
import { SendFlow } from "./send-flow";
import { WorkflowFlow } from "./workflow-flow";

const AUDIENCE = [
  "Contacts",
  "Segments",
  "Topics",
  "Double opt-in",
  "Scheduling",
];

const WORKFLOW_PARTS = ["Triggers", "Delays", "Conditions", "Email", "SMS"];

function Tags({ items }: { items: string[] }) {
  return (
    <p className="mt-5 max-w-prose text-foreground text-sm leading-relaxed">
      {items.join(" · ")}
    </p>
  );
}

/** An animated beat visual. The animation is decorative; the caption is what assistive tech reads. */
function FlowFigure({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="m-0">
      {children}
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

const ALSO = [
  { label: "How access works", href: "/security" },
  { label: "Inbound email", href: "/inbound" },
  { label: "SMS", href: "/sms" },
  { label: "Agents & MCP", href: "/agents" },
  { label: "Bring your own cloud", href: "/byoc" },
];

type Beat = {
  index: string;
  title: string;
  body: string;
  aside?: React.ReactNode;
  visual: React.ReactNode;
};

const beats: Beat[] = [
  {
    index: "01",
    title: "Send with one call.",
    body: "A typed TypeScript SDK that talks straight to SES. Every send, delivery, open and click lands in a table you own.",
    visual: (
      <FlowFigure caption="One call to email.send in your app sends a welcome email through Amazon SES in your AWS account. It arrives in the inbox, and its delivered, opened and clicked events land in a table you own.">
        <SendFlow />
      </FlowFigure>
    ),
  },
  {
    index: "02",
    title: "Send a broadcast.",
    body: "Write it once, choose who gets it, and send now or schedule it. Every recipient can unsubscribe in one click, and you see the whole funnel afterwards.",
    aside: <Tags items={AUDIENCE} />,
    visual: (
      <FlowFigure caption="A broadcast moves through setup, content, audience and review, goes to all contacts, and its results fill in: sent, delivered, opened and clicked, with a one-click unsubscribe on every email.">
        <BroadcastFlow />
      </FlowFigure>
    ),
  },
  {
    index: "03",
    title: "Automate the rest.",
    body: "Workflows send for you when something happens: a signup, an event, a topic change, a schedule. Wait, check what the contact did, then send the next email or text.",
    aside: <Tags items={WORKFLOW_PARTS} />,
    visual: (
      <FlowFigure caption="A contact signs up, gets a welcome email, waits two days, and because they opened it, gets the getting-started tips email; the reminder text branch is skipped.">
        <WorkflowFlow />
      </FlowFigure>
    ),
  },
  {
    index: "04",
    title: "Keep your sending healthy.",
    body: "Wraps watches your bounce and complaint rates and your domain's authentication, and alerts your team early so you can fix the cause. One command shows what is behind a climbing rate.",
    visual: (
      <FlowFigure caption="The dashboard flags that sending needs attention because DKIM is failing. The wraps email check command names the issue, the DKIM record is fixed, and the dashboard is back to all systems healthy.">
        <HealthFlow />
      </FlowFigure>
    ),
  },
];

export function WhatItDoesSection() {
  return (
    <section className="border-border border-b py-16 md:py-24" id="features">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionKicker>What Wraps does</SectionKicker>
        <h2 className="max-w-xl text-balance font-heading font-semibold text-3xl text-foreground leading-none tracking-tight md:text-4xl">
          Send, broadcast, automate, and keep it healthy.
        </h2>

        <ol className="mt-10 divide-y divide-border md:mt-14">
          {beats.map((beat) => (
            <li
              className="grid gap-6 py-10 first:pt-0 last:pb-0 md:py-14 lg:grid-cols-5 lg:items-start lg:gap-16"
              key={beat.index}
            >
              <div className="lg:col-span-2">
                <p className="mb-3 font-mono text-muted-foreground text-xs tracking-widest">
                  {beat.index}
                </p>
                <h3 className="max-w-sm text-balance font-heading font-semibold text-2xl text-foreground leading-tight tracking-tight md:text-3xl">
                  {beat.title}
                </h3>
                <p className="mt-3 max-w-md text-pretty text-base text-muted-foreground leading-relaxed">
                  {beat.body}
                </p>
                {beat.aside}
              </div>
              <div className="min-w-0 lg:col-span-3">{beat.visual}</div>
            </li>
          ))}
        </ol>

        <p className="mt-16 flex flex-wrap items-center gap-x-6 gap-y-2 border-border border-t pt-6 text-sm md:mt-24">
          <span className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
            Also
          </span>
          {ALSO.map((item) => (
            <Link
              className="text-foreground underline-offset-4 hover:underline"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </p>
      </div>
    </section>
  );
}
