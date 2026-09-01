import { SectionKicker } from "@/app/landing/components/section-kicker";

export function OperatorsExclusionSection() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionKicker>Targeting</SectionKicker>
            <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
              Marketing uses segments to include. You use them to exclude.
            </h2>
            <p className="mb-6 text-lg text-muted-foreground">
              The same builder, pointed the other way. Conditions nest in AND/OR
              groups, so &ldquo;engaged in the last 90 days, minus anyone we
              already mailed this week, minus the ones who never
              confirmed&rdquo; is one saved definition instead of a tribal rule
              nobody wrote down.
            </p>
            <p className="mb-6 text-muted-foreground leading-relaxed">
              Every segment previews to a count and a sample of matching
              addresses before you save it. Definitions resolve at send time
              rather than freezing a list that quietly rots, and a partition
              filter splits a large audience into even cohorts when you want to
              ramp a domain instead of hitting it all at once.
            </p>
            <p className="border-orange-500/40 border-l-2 pl-4 text-muted-foreground leading-relaxed">
              And when a segment is deleted or its filters no longer compile,
              recipient selection fails closed — the send resolves to nobody,
              not to everybody. The worst outcome is a broadcast that
              didn&rsquo;t go out.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-5">
            <div className="mb-4 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
              filters available
            </div>
            <ul className="space-y-3 font-mono text-[12.5px]">
              {[
                [
                  "Email status",
                  "active · unsubscribed · bounced · complained",
                ],
                ["Last activity", "within · before · after · exists"],
                ["Last email sent / opened / clicked", "date comparisons"],
                ["Emails sent / opened / clicked", "numeric thresholds"],
                ["Topic subscription", "is subscribed to · is not"],
                ["Confirmed date", "exists · within"],
                ["Custom property", "equals · contains · exists"],
                ["Partition", "deterministic cohort split"],
              ].map(([field, ops]) => (
                <li className="flex flex-col gap-0.5" key={field}>
                  <span className="text-foreground">{field}</span>
                  <span className="text-muted-foreground/80">{ops}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-border/60 border-t pt-4 text-muted-foreground text-xs leading-relaxed">
              Behavioral filters — has or has not triggered a given event, and
              within what window — are on the Business plan.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
