"use client";

import { Check } from "lucide-react";
import {
  type BillingInterval,
  getAnnualTotal,
  getPaidPlans,
  getPriceByInterval,
  hasEarlyAdopterPricing,
  PLANS,
  type PlanId,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

type PlanSelectorProps = {
  selectedPlan: PlanId;
  onSelectPlan: (plan: PlanId) => void;
  currentPlan?: PlanId | null;
  showCurrentBadge?: boolean;
  billingInterval?: BillingInterval;
  showFreeTier?: boolean;
};

export function PlanSelector({
  selectedPlan,
  onSelectPlan,
  currentPlan,
  showCurrentBadge = false,
  billingInterval = "monthly",
  showFreeTier = false,
}: PlanSelectorProps) {
  // Get paid plans only (exclude free tier unless explicitly requested)
  const paidPlans = getPaidPlans();

  // Include free tier as a proper card when requested
  const visiblePlans = showFreeTier
    ? [{ id: "free" as PlanId, plan: PLANS.free }, ...paidPlans]
    : paidPlans;

  return (
    <div
      className={cn(
        "grid gap-4",
        showFreeTier ? "md:grid-cols-3" : "md:grid-cols-2"
      )}
    >
      {visiblePlans.map(({ id, plan }) => {
        const isSelected = selectedPlan === id;
        const isCurrent = currentPlan === id;
        const isEarlyAdopter = hasEarlyAdopterPricing(plan);
        const displayPrice = getPriceByInterval(plan, billingInterval);
        const regularPrice =
          billingInterval === "annual" ? plan.annualPrice : plan.price;
        const annualTotal = getAnnualTotal(plan);

        return (
          <button
            className={cn(
              "relative rounded-xl border-2 px-6 pt-8 pb-6 text-left transition-all",
              "hover:border-primary/50 hover:bg-muted/50",
              isSelected && "border-primary bg-primary/5",
              !isSelected && "border-border",
              isCurrent && showCurrentBadge && "ring-2 ring-primary/20"
            )}
            key={id}
            onClick={() => onSelectPlan(id)}
            type="button"
          >
            {/* Early adopter badge */}
            {isEarlyAdopter && (
              <div className="-top-3 -translate-x-1/2 absolute left-1/2">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-3 py-1 font-medium text-primary-foreground text-xs">
                  Early Adopter
                </span>
              </div>
            )}

            {/* Current plan badge */}
            {isCurrent && showCurrentBadge && (
              <div className="-top-3 absolute right-4">
                <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs">
                  Current
                </span>
              </div>
            )}

            {/* Selection indicator */}
            <div
              className={cn(
                "absolute top-4 right-4 flex h-5 w-5 items-center justify-center rounded-full border-2",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30"
              )}
            >
              {isSelected && <Check className="h-3 w-3" />}
            </div>

            {/* Plan details */}
            <div className="mb-4">
              <h3 className="font-semibold text-lg">{plan.name}</h3>
              <p className="text-muted-foreground text-sm">
                {plan.description}
              </p>
            </div>

            {/* Price */}
            <div className="mb-4">
              <span className="font-bold text-3xl">
                {id === "free" ? "Free" : `$${displayPrice}`}
              </span>
              {id !== "free" && isEarlyAdopter && regularPrice && (
                <span className="ml-2 text-lg text-muted-foreground line-through">
                  ${regularPrice}
                </span>
              )}
              {id !== "free" && (
                <span className="text-muted-foreground">/mo</span>
              )}
              {id === "free" && (
                <p className="mt-1 text-muted-foreground text-sm">
                  No credit card required
                </p>
              )}
              {id !== "free" && billingInterval === "annual" && annualTotal && (
                <p className="mt-1 text-green-600 text-sm">${annualTotal}/yr</p>
              )}
            </div>

            {/* Key features */}
            <ul className="space-y-2">
              {plan.featureList.slice(0, 4).map((feature) => (
                <li className="flex items-start gap-2 text-sm" key={feature}>
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
              {plan.featureList.length > 4 && (
                <li className="text-muted-foreground text-sm">
                  + {plan.featureList.length - 4} more features
                </li>
              )}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
