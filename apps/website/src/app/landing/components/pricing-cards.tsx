"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { Check } from "lucide-react";
import { memo, useState } from "react";
import {
  type BillingInterval,
  getCtaLink,
  getDisplayPrice,
  PRICING_TIERS,
  type PricingTier,
} from "@/config/pricing";
import { BillingToggle } from "./billing-toggle";

function PricingCard({
  plan,
  billingInterval,
}: {
  plan: PricingTier;
  billingInterval: BillingInterval;
}) {
  const isFree = plan.id === "free";
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-background ${isFree ? "border-2 border-orange-500" : ""}`}
    >
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="font-bold text-lg">{plan.name}</h3>
            {isFree && (
              <span className="rounded-full bg-orange-500/10 px-2 py-0.5 font-semibold text-orange-600 text-[10px] dark:text-orange-400">
                Free Forever
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">{plan.description}</p>
        </div>

        <div className="mb-4">
          <span className="font-bold text-3xl">
            {isFree ? "Free" : `$${getDisplayPrice(plan, billingInterval)}`}
          </span>
          {!isFree && (
            <span className="text-muted-foreground">{plan.period}</span>
          )}
        </div>

        <ul className="mb-6 flex-1 space-y-2">
          {plan.features.map((feature) => (
            <li className="flex items-start gap-2" key={feature}>
              <Check className="mt-0.5 size-3 shrink-0 text-orange-500/70" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>

        {plan.ctaLink ? (
          <Button
            asChild
            className={`w-full cursor-pointer ${isFree ? "bg-orange-500 hover:bg-orange-600" : ""}`}
            size="default"
            variant={isFree ? "default" : "outline"}
          >
            <a href={getCtaLink(plan, billingInterval)}>
              {isFree ? "Get Started Free" : plan.cta}
            </a>
          </Button>
        ) : (
          <Button
            className="w-full cursor-not-allowed opacity-60"
            disabled
            size="default"
            variant="outline"
          >
            {plan.cta}
          </Button>
        )}
      </div>
    </div>
  );
}

export const PricingCards = memo(function PricingCardsInner({
  tiers,
}: {
  tiers?: PricingTier[];
}) {
  const plans = tiers ?? PRICING_TIERS;
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("monthly");

  return (
    <>
      <div className="mb-8 flex justify-center">
        <BillingToggle onChange={setBillingInterval} value={billingInterval} />
      </div>

      <div
        className={`mb-12 grid gap-6 md:grid-cols-2 ${plans.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
      >
        {plans.map((plan) => (
          <PricingCard
            billingInterval={billingInterval}
            key={plan.name}
            plan={plan}
          />
        ))}
      </div>
    </>
  );
});
