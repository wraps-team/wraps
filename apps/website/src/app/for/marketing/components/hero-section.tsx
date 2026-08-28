import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { ContactPriceCurve } from "./contact-price-curve";
import { MarketingHeroCTA } from "./hero-cta";

export function MarketingHeroSection() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-background/80 pt-20 pb-16 sm:pt-28">
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
              <span className="size-1.5 rounded-full bg-orange-500" />
              <span>wraps · for marketing</span>
            </div>

            <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
              Grow the list.{" "}
              <span className="text-orange-500">Watch the bill stay put.</span>
            </h1>

            <p className="mb-6 max-w-md text-muted-foreground">
              Broadcasts, segments, topics, and a hosted preference center — the
              lifecycle toolkit you expect, priced on the events you track
              instead of the contacts you store. Every plan carries unlimited
              contacts, so a good acquisition month never arrives as an invoice
              problem.
            </p>

            <MarketingHeroCTA />
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-orange-500/10 opacity-60 blur-2xl" />
            <div className="relative">
              <ContactPriceCurve />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
