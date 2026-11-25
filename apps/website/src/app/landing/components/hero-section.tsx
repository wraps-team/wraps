import { HeroDashboardPanel } from "./hero-dashboard-panel";
import { HomeHeroCtas } from "./home-hero-ctas";
import { SectionKicker } from "./section-kicker";

/**
 * PLACEHOLDER headline: Jarod approves the final wording at review. Change it
 * here and nowhere else. The orange part keeps its words on one line.
 */
const HERO_HEADLINE = {
  lead: "Email marketing without the ",
  emphasis: "per-contact tax.",
};

export function HeroSection() {
  return (
    <section className="border-border border-b pt-10 pb-12 sm:pt-14 sm:pb-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionKicker>Own your email</SectionKicker>
            <h1 className="text-balance font-heading font-semibold text-4xl text-foreground leading-tight tracking-tight sm:text-5xl xl:text-6xl">
              {HERO_HEADLINE.lead}
              <span className="whitespace-nowrap text-brand-text">
                {HERO_HEADLINE.emphasis}
              </span>
            </h1>
            <p className="mt-5 max-w-[48ch] text-pretty text-lg text-muted-foreground leading-relaxed">
              Newsletters, automations, contacts and app emails in one platform
              your whole team can use. Sending runs in your own AWS account, so
              every email goes out from your domain at Amazon&apos;s own rates.
            </p>
            <div className="mt-7">
              <HomeHeroCtas />
            </div>
          </div>
          <div className="lg:col-span-6">
            <HeroDashboardPanel />
          </div>
        </div>
      </div>
    </section>
  );
}
