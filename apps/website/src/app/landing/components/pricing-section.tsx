import { Button } from "@wraps/ui/components/ui/button";
import { Check } from "lucide-react";
import Link from "next/link";
import {
  PRICING_COPY,
  PRICING_TIERS,
  type PricingTier,
} from "@/config/pricing";
import { SectionKicker } from "./section-kicker";

function tierLabel(tier: PricingTier): string {
  if (tier.id === "free") {
    return "Free forever";
  }
  if (tier.highlight) {
    return "Most popular";
  }
  return "";
}

export function PricingSection() {
  return (
    <section className="border-border border-b py-20 md:py-24" id="pricing">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionKicker>Pricing</SectionKicker>
        <h2 className="mb-2 max-w-[28ch] font-heading font-semibold text-3xl text-foreground leading-none tracking-tight md:text-4xl">
          {PRICING_COPY.headline}
        </h2>
        <p className="mb-8 max-w-[52ch] text-lg text-muted-foreground leading-relaxed">
          {PRICING_COPY.subheadline}
        </p>

        {/* Tier grid — hairline rules, no boxed border (echoes the compare table) */}
        <div className="grid grid-cols-1 border-border border-y sm:grid-cols-2 lg:grid-cols-3">
          {PRICING_TIERS.map((tier) => {
            const label = tierLabel(tier);
            return (
              <div
                className={`flex flex-col border-border p-7 [&:not(:last-child)]:border-b sm:[&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r lg:[&:not(:last-child)]:border-b-0 ${
                  tier.highlight
                    ? "border-l-2 border-l-brand bg-brand/[0.03]"
                    : ""
                }`}
                key={tier.id}
              >
                <div className="mb-2.5 min-h-4 font-mono text-2xs text-brand-text uppercase tracking-widest">
                  {label}
                </div>
                <h3 className="mb-1 font-semibold text-lg text-foreground">
                  {tier.name}
                </h3>
                <p className="mb-5 min-h-[34px] text-sm text-muted-foreground">
                  {tier.description}
                </p>
                <div className="font-bold text-3xl text-foreground tracking-tight">
                  {tier.price === 0 ? "$0" : `$${tier.price}`}
                </div>
                <div className="mb-5 text-xs text-muted-foreground">
                  {tier.price === 0 ? "you pay AWS directly" : "per month"}
                </div>
                <ul className="mb-6 grid flex-1 content-start gap-2.5">
                  {tier.features.map((feature) => (
                    <li
                      className="flex gap-2.5 text-sm text-muted-foreground leading-normal"
                      key={feature}
                    >
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 size-[15px] shrink-0 text-brand-text"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="w-full cursor-pointer"
                  variant={tier.highlight ? "brand" : "outline"}
                >
                  <a href={tier.ctaLink}>{tier.cta}</a>
                </Button>
              </div>
            );
          })}
        </div>

        {/* Unlimited-set note */}
        <p className="mt-6 text-center text-muted-foreground text-sm">
          Every plan includes unlimited sends, domains, contacts, templates, and
          team members.
        </p>

        {/* Enterprise note */}
        <p className="mt-6 text-center text-muted-foreground text-sm">
          {PRICING_COPY.enterpriseNote.split("Contact us")[0]}
          <a
            className="text-brand-text hover:underline"
            href="mailto:support@wraps.dev"
          >
            Contact us for Enterprise
          </a>
        </p>

        {/* AWS Cost Note */}
        <div className="relative mt-8 rounded-xl border border-border bg-muted/30 p-6">
          <p className="mb-2 font-semibold text-foreground">
            AWS costs are separate
          </p>
          <p className="mb-4 text-muted-foreground text-sm">
            You pay AWS directly for sending at{" "}
            <strong className="text-foreground">$0.10 per 1,000 emails</strong>{" "}
            on à la carte — AWS now defaults new accounts to $0.16, and Wraps
            tells you which plan applies — plus infrastructure (~$2-5/mo). The
            infrastructure lives in your account, so you can leave anytime and
            keep everything.
          </p>
          <Button asChild className="cursor-pointer" variant="outline">
            <Link href="/tools/ses-calculator">Calculate Your Costs</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
