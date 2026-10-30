"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@wraps/ui/components/ui/hover-card";
import { Info, Lock } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";

const LOCKED_TYPES = ["Bounce", "Complaint", "Suppressed"];

/**
 * A locked event-type pill. Every occurrence, in every preset, opens the
 * same explainer. Bounce, Complaint, and Suppressed are never deselectable:
 * this is settled, not a demo limitation, and the lock ships in the preview
 * too.
 */
function LockedTypePill({ label }: { label: string }) {
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 font-medium text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          type="button"
        >
          <Lock aria-hidden="true" className="size-3" />
          {label}
          <Info aria-hidden="true" className="size-3 text-muted-foreground" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="center" className="w-80" side="top">
        <div className="space-y-3">
          <div>
            <h4 className="mb-1 font-semibold text-sm">
              Why these three stay on
            </h4>
            <p className="text-muted-foreground text-sm">
              Suppression depends on them. If bounce and complaint events
              stopped reaching Wraps, the dashboard, SDK, and automations would
              keep sending to addresses that already hard bounced or marked you
              as spam. That damages the domain reputation in your own AWS
              account, and Wraps would have caused it.
            </p>
          </div>
          <p className="text-muted-foreground text-sm">
            These three carry no engagement telemetry. A bounce or suppression
            event records the address, a timestamp, and a reason code. A
            complaint event records the address and a timestamp. Opens and
            clicks are the events that carry a recipient user agent, and those
            you can turn off.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function EventTypePill({ label }: { label: string }) {
  if (LOCKED_TYPES.includes(label)) {
    return <LockedTypePill label={label} />;
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 font-medium text-xs">
      {label}
    </span>
  );
}

type Preset = {
  name: string;
  isDefault?: boolean;
  forwards: string[];
  keep: string[];
  lose: string[];
};

const PRESETS: Preset[] = [
  {
    name: "Full",
    isDefault: true,
    forwards: [
      "Send",
      "Delivery",
      "Open",
      "Click",
      "Bounce",
      "Complaint",
      "Suppressed",
      "Reject",
      "Delivery Delay",
      "Rendering Failure",
    ],
    keep: ["Everything works"],
    lose: ["Nothing"],
  },
  {
    name: "Deliverability only",
    forwards: [
      "Bounce",
      "Complaint",
      "Suppressed",
      "Reject",
      "Delivery Delay",
      "Rendering Failure",
    ],
    keep: ["Suppression", "Sending health", "Error reporting"],
    lose: [
      "Open/click analytics",
      "Engagement-triggered workflows",
      "Contact engagement scores",
    ],
  },
  {
    name: "Minimum viable",
    forwards: ["Bounce", "Complaint", "Suppressed"],
    keep: ["Suppression only"],
    lose: [
      "Open/click analytics",
      "Engagement-triggered workflows",
      "Contact engagement scores",
      "Delivery confirmation in the dashboard",
    ],
  },
];

export function EventControlsPreviewSection() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SectionKicker className="mb-0">
            What you could turn off
          </SectionKicker>
          <Badge variant="outline">Coming soon, not yet available</Badge>
        </div>
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
          Choosing what forwards to Wraps.
        </h2>
        <p className="mb-6 max-w-2xl text-muted-foreground">
          This is a preview of a control we are building, not something you can
          turn on today. It changes only what forwards to Wraps, not what your
          SES configuration set emits.{" "}
          <strong className="text-foreground">
            Your own DynamoDB keeps every event either way
          </strong>
          . Dropping a preset below Full reduces what Wraps receives; it does
          not reduce what lands in your account.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {PRESETS.map((preset) => (
            <div
              className="flex flex-col rounded-lg border border-border bg-background/50 p-5"
              key={preset.name}
            >
              <div className="mb-3 flex items-center gap-2">
                <h3 className="font-medium">{preset.name}</h3>
                {preset.isDefault ? (
                  <Badge variant="secondary">Default today</Badge>
                ) : null}
              </div>

              <p className="mb-2 text-muted-foreground text-xs uppercase tracking-widest">
                Forwards to Wraps
              </p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {preset.forwards.map((type) => (
                  <EventTypePill key={type} label={type} />
                ))}
              </div>

              <p className="mb-1 font-medium text-xs">You keep</p>
              <ul className="mb-3 space-y-0.5 text-muted-foreground text-sm">
                {preset.keep.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <p className="mb-1 font-medium text-xs">You lose</p>
              <ul className="space-y-0.5 text-muted-foreground text-sm">
                {preset.lose.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-6 text-muted-foreground text-sm">
          Bounce, Complaint, and Suppressed are locked in every preset,
          including Full. Hover or focus a locked type above for why. Interested
          in this before it ships? Tell us at{" "}
          <a
            className="text-brand-text underline underline-offset-2 hover:text-brand-text"
            href="/contact"
          >
            /contact
          </a>
          .
        </p>
      </div>
    </section>
  );
}
