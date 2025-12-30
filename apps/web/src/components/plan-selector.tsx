"use client";

import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getDisplayPlans,
  getDisplayPrice,
  hasEarlyAdopterPricing,
  type PlanId,
} from "@/lib/plans";

type PlanSelectorProps = {
  selectedPlan: PlanId;
  onSelectPlan: (plan: PlanId) => void;
  currentPlan?: PlanId | null;
  showCurrentBadge?: boolean;
};

export function PlanSelector({
  selectedPlan,
  onSelectPlan,
  currentPlan,
  showCurrentBadge = false,
}: PlanSelectorProps) {
  const displayPlans = getDisplayPlans();

  // Filter to show Starter and Pro only (Growth coming soon)
  const visiblePlans = displayPlans.filter(({ id }) =>
    ["starter", "pro"].includes(id)
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {visiblePlans.map(({ id, plan }) => {
        const isSelected = selectedPlan === id;
        const isCurrent = currentPlan === id;
        const isPopular = id === "pro";
        const isEarlyAdopter = hasEarlyAdopterPricing(plan);
        const displayPrice = getDisplayPrice(plan);

        return (
          <button
            className={cn(
              "relative rounded-xl border-2 px-6 pb-6 pt-8 text-left transition-all",
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
            {isEarlyAdopter && !isPopular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-3 py-1 text-white text-xs font-medium">
                  Early Adopter
                </span>
              </div>
            )}

            {/* Popular badge (with early adopter note) */}
            {isPopular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-primary-foreground text-xs font-medium">
                  <Sparkles className="h-3 w-3" />
                  {isEarlyAdopter ? "Popular - Early Adopter" : "Popular"}
                </span>
              </div>
            )}

            {/* Current plan badge */}
            {isCurrent && showCurrentBadge && (
              <div className="absolute -top-3 right-4">
                <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs">
                  Current
                </span>
              </div>
            )}

            {/* Selection indicator */}
            <div
              className={cn(
                "absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full border-2",
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
              <p className="text-muted-foreground text-sm">{plan.description}</p>
            </div>

            {/* Price */}
            <div className="mb-4">
              <span className="font-bold text-3xl">${displayPrice}</span>
              {isEarlyAdopter && (
                <span className="ml-2 text-muted-foreground text-lg line-through">
                  ${plan.price}
                </span>
              )}
              <span className="text-muted-foreground">{plan.period}</span>
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
