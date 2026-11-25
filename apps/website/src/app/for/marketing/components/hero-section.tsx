import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { ContactFeeChart } from "@/app/landing/components/contact-fee-chart";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { TrackedCtaPair } from "@/components/tracked-cta-pair";

export function MarketingHeroSection() {
  return (
    <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28">
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          <div>
            <nav aria-label="Breadcrumb" className="mb-6">
              <ol className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <li>
                  <a
                    className="underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring"
                    href="/"
                  >
                    Home
                  </a>
                </li>
                <li aria-hidden="true">/</li>
                <li>Solutions</li>
                <li aria-hidden="true">/</li>
                <li aria-current="page">Marketing teams</li>
              </ol>
            </nav>

            <SectionKicker>For marketing teams</SectionKicker>

            <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
              Grow your list without paying{" "}
              <span className="text-brand-text">per contact.</span>
            </h1>

            <p className="mb-8 max-w-lg text-lg text-muted-foreground leading-relaxed">
              Newsletters, segments, topics and a hosted preference center.
              Every plan has unlimited contacts, so a good signup month never
              turns into a bigger invoice from us. Amazon bills each email you
              send, at its own rates.
            </p>

            <TrackedCtaPair
              location="for_marketing_hero"
              secondary={{
                label: "Compare with Klaviyo",
                href: "/compare/klaviyo-vs-wraps",
              }}
            />
          </div>

          <ContactFeeChart note="Wraps' fee is flat by plan; Amazon bills sending separately at its own rates." />
        </div>
      </div>
    </section>
  );
}
