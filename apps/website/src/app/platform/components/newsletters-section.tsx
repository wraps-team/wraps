import { FlowBox } from "@/app/landing/components/flow-primitives";
import { SectionKicker } from "@/app/landing/components/section-kicker";

// Plan gates: apps/web/src/lib/plans.ts (batch on Free; topics, segments and
// campaigns, meaning scheduling, from Pro).
const FEATURES = [
  { name: "Send to everyone", pro: false, note: "Included on every plan" },
  {
    name: "Segments",
    pro: true,
    note: "Target by plan, location or engagement",
  },
  { name: "Scheduling", pro: true, note: "Pick a date and time" },
  {
    name: "Topics and preference page",
    pro: true,
    note: "People choose what they get",
  },
];

const BROADCASTS = [
  { name: "November product update", status: "Sent", tone: "text-success" },
  {
    name: "Black Friday early access",
    status: "Scheduled",
    tone: "text-info",
  },
  { name: "Webinar reminder", status: "Draft", tone: "text-muted-foreground" },
];

export function PlatformNewslettersSection() {
  return (
    <section className="scroll-mt-20 py-16 sm:py-24" id="newsletters">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <FlowBox className="order-2 lg:order-1" label="Broadcasts">
          <ul aria-hidden="true" className="grid gap-2 text-xs">
            {BROADCASTS.map((row) => (
              <li
                className="flex items-center justify-between border border-border px-3 py-2"
                key={row.name}
              >
                <span>{row.name}</span>
                <span className={`font-medium ${row.tone}`}>{row.status}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 inline-block border border-border px-2 py-0.5 text-muted-foreground text-xs">
            Example
          </p>
        </FlowBox>

        <div className="order-1 lg:order-2">
          <SectionKicker>Newsletters</SectionKicker>
          <h2 className="mb-6 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            Reach your whole list, or just the right part of it.
          </h2>
          <ul className="divide-y divide-border border-border border-y">
            {FEATURES.map((f) => (
              <li className="py-3" key={f.name}>
                <div className="flex items-center gap-2">
                  <b className="font-semibold text-sm">{f.name}</b>
                  {f.pro && (
                    <span className="border border-brand/50 px-1.5 font-semibold text-2xs text-brand-text uppercase tracking-eyebrow">
                      Pro
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground text-sm">{f.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
