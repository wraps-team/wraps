import { SectionKicker } from "@/app/landing/components/section-kicker";

// Deliberately on the page. A marketer who discovers these in week two churns;
// one who reads them here either self-selects out or arrives unsurprised.
const limits = [
  {
    claim: "There is no drag-and-drop email builder.",
    reality:
      "Templates are React Email components with a live preview beside them. In practice you start from the gallery or describe what you want to the AI panel — “a newsletter with three sections”, “add a hero image and a button” — and edit from there. Version history is on by default, so nothing you try is unrecoverable. But if a visual block editor is non-negotiable for your team, this will feel wrong.",
  },
  {
    claim: "There is no A/B testing.",
    reality:
      "Not in broadcasts, not in workflows. You can rank subject lines by engagement after the fact, and split an audience into even cohorts with a partition filter, but nothing automatically picks the winner. If your program runs on holdouts and lift measurement, this is a real gap today.",
  },
  {
    claim: "You cannot upload a CSV to a single send.",
    reality:
      "Recipients come from your contacts — everyone, a topic, or a segment. You can bulk-import a CSV into contacts, with column mapping and duplicate handling, then target it. But the one-off “here is a list, mail it” flow does not exist.",
  },
];

export function MarketingHonestSection() {
  return (
    <section className="border-border/60 border-y bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <SectionKicker>Before you switch</SectionKicker>
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            Three things you would find out in week two anyway.
          </h2>
          <p className="text-lg text-muted-foreground">
            Worth knowing now, while switching still costs you nothing.
          </p>
        </div>

        <div className="space-y-6">
          {limits.map(({ claim, reality }) => (
            <div
              className="border-orange-500/40 border-l-2 pl-5 sm:pl-6"
              key={claim}
            >
              <h3 className="mb-2 font-medium text-lg tracking-tight">
                {claim}
              </h3>
              <p className="text-muted-foreground leading-relaxed">{reality}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
