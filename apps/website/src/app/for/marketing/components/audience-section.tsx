import { SectionKicker } from "@/app/landing/components/section-kicker";

export function MarketingAudienceSection() {
  return (
    <section className="border-border/60 border-y bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <SectionKicker>Segments &amp; topics</SectionKicker>
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            Two different ways to stop sending everyone the same thing.
          </h2>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="rounded-xl border border-border bg-card/60 p-6">
            <h3 className="mb-3 font-heading font-semibold text-xl tracking-tight">
              Segments — what you decide
            </h3>
            <p className="mb-4 text-muted-foreground leading-relaxed">
              A visual builder with AND/OR groups over engagement, dates,
              counts, topic membership, and any custom property you put on a
              contact. Save it once and it resolves fresh every time you send.
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm">
              {[
                "Opened something in the last 30 days but never clicked",
                "Signed up before June and still hasn’t confirmed",
                "Subscribed to product news, not to billing alerts",
                "Any custom property your app writes — plan, region, role",
              ].map((example) => (
                <li className="flex gap-2.5" key={example}>
                  <span
                    aria-hidden="true"
                    className="mt-2 h-px w-3 shrink-0 bg-orange-500"
                  />
                  <span>{example}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-border/60 border-t pt-4 text-muted-foreground text-xs leading-relaxed">
              Preview any segment for a count and sample addresses before you
              commit. Behavioral filters — triggered or didn&rsquo;t trigger a
              given event, within a window — are on the Business plan.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-6">
            <h3 className="mb-3 font-heading font-semibold text-xl tracking-tight">
              Topics — what they decide
            </h3>
            <p className="mb-4 text-muted-foreground leading-relaxed">
              Named subscriptions your contacts opt into individually, with
              double opt-in and a hosted preference center linked from the
              footer of every send. You style it; we host it and keep the link
              signed.
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm">
              {[
                "Someone tired of the newsletter drops one topic, not you entirely",
                "Confirmation emails go out from a sender you verify",
                "Set the title, description, and copy; preview before publishing",
                "Unsubscribes land on the contact, so every future send respects them",
              ].map((example) => (
                <li className="flex gap-2.5" key={example}>
                  <span
                    aria-hidden="true"
                    className="mt-2 h-px w-3 shrink-0 bg-orange-500"
                  />
                  <span>{example}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-border/60 border-t pt-4 text-muted-foreground text-xs leading-relaxed">
              A granular unsubscribe is the cheapest retention work available.
              The alternative is losing the whole address.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
