"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { Check } from "lucide-react";
import { useState } from "react";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import {
  type BillingInterval,
  PRICING_COPY,
  PRICING_TIERS,
  type PricingTier,
} from "@/config/pricing";
import { BillingToggle } from "./billing-toggle";

const allTiers = PRICING_TIERS;

export function DashboardPricingSection() {
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("monthly");

  const getCtaLink = (tier: PricingTier) => {
    const annual = billingInterval === "annual" ? "&annual=true" : "";
    return `https://app.wraps.dev/auth?mode=signup&plan=${tier.id}${annual}`;
  };

  const getDisplayPrice = (tier: PricingTier) => {
    if (billingInterval === "annual" && tier.annualPrice) {
      return Math.round(tier.annualPrice / 12);
    }
    return tier.price;
  };

  return (
    <section className="relative pt-32 pb-24" id="pricing">
      {/* Diagonal transition from premium bg */}
      <div
        className="absolute inset-x-0 top-0 h-20 bg-muted/30"
        style={{
          clipPath: "polygon(0 0, 100% 0, 0 100%)",
        }}
      />

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <SectionKicker>Grow Without Limits</SectionKicker>
          <h2 className="mb-4 font-heading font-semibold text-3xl tracking-tight md:text-4xl">
            Simple, predictable pricing
          </h2>
          <p className="mb-6 max-w-2xl text-muted-foreground">
            Unlimited sends, domains, contacts & templates. No per-seat fees.
          </p>
          <BillingToggle
            className="items-start"
            onChange={setBillingInterval}
            value={billingInterval}
          />
        </div>

        {/* Pricing cards */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {allTiers.map((tier) => {
            return (
              <div
                className={`relative flex flex-col overflow-hidden rounded-2xl border bg-background ${
                  tier.highlight ? "border-orange-500" : "border-border"
                }`}
                key={tier.name}
              >
                {/* Header */}
                <div
                  className={`border-border border-b px-6 py-6 ${
                    tier.highlight ? "bg-orange-500/5" : "bg-muted/30"
                  }`}
                >
                  <div
                    className={`mb-1 font-semibold ${
                      tier.highlight ? "text-orange-500" : "text-foreground"
                    }`}
                  >
                    {tier.name}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-4xl">
                      ${getDisplayPrice(tier)}
                    </span>
                    <span className="text-muted-foreground">/mo</span>
                  </div>
                  {tier.annualPrice &&
                    (billingInterval === "annual" ? (
                      <div className="mt-1 text-foreground text-sm">
                        ${tier.annualPrice} billed annually{" "}
                      </div>
                    ) : (
                      <div className="mt-1 text-muted-foreground text-sm">
                        or ${tier.annualPrice}/yr{" "}
                      </div>
                    ))}
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="block font-medium text-foreground">
                        {tier.limits.historyDisplay}
                      </span>
                      history
                    </div>
                    <div>
                      <span className="block font-medium text-foreground">
                        {tier.limits.workflowsDisplay}
                      </span>
                      workflows
                    </div>
                  </div>
                  <p className="mt-3 text-muted-foreground text-sm">
                    {tier.description}
                  </p>
                </div>

                {/* Features */}
                <div className="flex flex-1 flex-col p-6">
                  <ul className="mb-6 space-y-2.5">
                    <li className="flex items-start gap-2 text-sm">
                      <Check
                        className={`mt-0.5 size-4 shrink-0 ${
                          tier.highlight
                            ? "text-orange-500"
                            : "text-muted-foreground"
                        }`}
                      />
                      <span>
                        Unlimited sends, domains, contacts & templates
                      </span>
                    </li>
                    {tier.features.slice(2).map((feature) => (
                      <li
                        className="flex items-start gap-2 text-sm"
                        key={feature}
                      >
                        <Check
                          className={`mt-0.5 size-4 shrink-0 ${
                            tier.highlight
                              ? "text-orange-500"
                              : "text-muted-foreground"
                          }`}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    className={`mt-auto w-full ${tier.highlight ? "bg-orange-500 hover:bg-orange-600" : ""}`}
                    size="lg"
                    variant={tier.highlight ? "default" : "outline"}
                  >
                    <a href={getCtaLink(tier)}>Get Started</a>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Founding Member Program */}
        <div className="mt-10 rounded-xl border border-border bg-muted/30 p-6">
          <div className="mb-3 flex items-center gap-2">
            <span aria-hidden="true" className="h-px w-6 bg-orange-500" />
            <p className="font-semibold text-foreground">
              {PRICING_COPY.foundingMemberTitle}
            </p>
          </div>
          <div className="grid gap-2 text-muted-foreground text-sm sm:grid-cols-2">
            {PRICING_COPY.foundingMemberPerks.map((perk) => (
              <div className="flex items-center gap-2" key={perk}>
                <Check className="size-4 shrink-0" strokeWidth={2.5} />
                <span>{perk}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-muted-foreground text-sm">
          AWS costs billed separately by AWS (~$0.10 per 1,000 emails à la
          carte, or ~$0.16 on AWS&apos;s new default Essentials plan). Free tier
          available, no credit card required.
        </p>
      </div>
    </section>
  );
}
