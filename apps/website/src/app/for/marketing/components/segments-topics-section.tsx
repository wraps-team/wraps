import { Check } from "lucide-react";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { getTier } from "@/config/pricing";

const cards = [
  {
    label: "Segments · you decide",
    title: "Groups that update themselves",
    body: "Build a group from opens, clicks, dates and anything you know about a contact. Save it once and it refreshes every time you send.",
    examples: [
      "Opened in the last 30 days but never clicked",
      "Signed up before June and still hasn’t confirmed",
      "Any property your app writes, like plan or region",
    ],
  },
  {
    label: "Topics · they decide",
    title: "Subscriptions people choose",
    body: "Contacts opt into the topics they care about, with double opt-in and a hosted preference page linked from every email.",
    examples: [
      "Someone tired of the newsletter drops one topic, not you",
      "You style the preference page; we host it",
      "Every future send respects an unsubscribe",
    ],
  },
];

export function MarketingSegmentsTopicsSection() {
  const proPrice = getTier("pro").price;
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <SectionKicker>Segments and topics</SectionKicker>
          <h2 className="font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            Stop sending everyone the same thing.
          </h2>
        </div>

        <div className="grid gap-x-8 gap-y-10 lg:grid-cols-2">
          {cards.map((card) => (
            <FlowBox
              className="h-full sm:px-6 sm:pb-6"
              key={card.label}
              label={card.label}
            >
              <h3 className="mb-3 font-heading font-semibold text-xl tracking-tight">
                {card.title}
              </h3>
              <p className="mb-4 text-muted-foreground leading-relaxed">
                {card.body}
              </p>
              <ul className="space-y-2 text-sm">
                {card.examples.map((example) => (
                  <li className="flex gap-2.5" key={example}>
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-brand-text"
                    />
                    <span>{example}</span>
                  </li>
                ))}
              </ul>
            </FlowBox>
          ))}
        </div>

        <p className="mt-6 text-muted-foreground text-xs">
          Segments, topics and scheduling are on Pro, ${proPrice} a month.
          Sending to everyone is free on every plan.
        </p>
      </div>
    </section>
  );
}
