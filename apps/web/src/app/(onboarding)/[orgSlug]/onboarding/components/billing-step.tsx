"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { CreditCardIcon, ZapIcon } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";
import { toast } from "sonner";
import { createFreeSubscription } from "@/actions/subscriptions";
import { BillingToggle } from "@/components/billing-toggle";
import { PlanSelector } from "@/components/plan-selector";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  type BillingInterval,
  getPriceByInterval,
  isPlanId,
  PLANS,
  type PlanId,
  toPublicPlanId,
} from "@/lib/plans";

type BillingStepProps = {
  onNext: () => void;
  onBack: () => void;
  organizationId: string;
};

export function BillingStep({
  onNext,
  onBack,
  organizationId,
}: BillingStepProps) {
  const params = useParams();
  const searchParams = useSearchParams();
  const orgSlug = params.orgSlug as string;

  // Get plan from URL param or localStorage, default to free
  const planParam = searchParams.get("plan");
  const storedPlan =
    typeof window !== "undefined"
      ? localStorage.getItem(`onboarding_plan_${orgSlug}`)
      : null;
  const initialPlan: PlanId = toPublicPlanId(
    (planParam && isPlanId(planParam)
      ? planParam
      : storedPlan && isPlanId(storedPlan)
        ? storedPlan
        : null) ?? "free"
  );

  // Get billing interval from URL param or localStorage, default to monthly
  const intervalParam = searchParams.get("interval") as BillingInterval | null;
  const storedInterval =
    typeof window !== "undefined"
      ? (localStorage.getItem(
          `onboarding_interval_${orgSlug}`
        ) as BillingInterval | null)
      : null;
  const initialInterval: BillingInterval =
    (intervalParam && ["monthly", "annual"].includes(intervalParam)
      ? intervalParam
      : storedInterval && ["monthly", "annual"].includes(storedInterval)
        ? storedInterval
        : null) ?? "monthly";

  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>(initialInterval);
  const [isLoading, setIsLoading] = useState(false);

  const plan = PLANS[selectedPlan];

  // Track plan selection changes
  const handlePlanChange = (newPlan: PlanId) => {
    setSelectedPlan(newPlan);
    posthog.capture("onboarding_plan_selected", {
      step: 1,
      step_name: "Choose Plan",
      organization_id: organizationId,
      plan: newPlan,
      billing_interval: billingInterval,
      monthly_price: getPriceByInterval(PLANS[newPlan], billingInterval),
    });
  };

  // Track billing interval changes
  const handleIntervalChange = (newInterval: BillingInterval) => {
    setBillingInterval(newInterval);
    posthog.capture("onboarding_billing_interval_changed", {
      step: 1,
      step_name: "Choose Plan",
      organization_id: organizationId,
      billing_interval: newInterval,
      plan: selectedPlan,
    });
  };

  const handleBack = () => {
    posthog.capture("onboarding_step_back", {
      step: 1,
      step_name: "Choose Plan",
      organization_id: organizationId,
    });
    onBack();
  };

  const handleContinue = async () => {
    setIsLoading(true);

    // Free tier - create subscription record and continue
    if (selectedPlan === "free") {
      posthog.capture("onboarding_free_tier_selected", {
        step: 1,
        step_name: "Choose Plan",
        organization_id: organizationId,
        plan: "free",
      });

      // Create a subscription record for free users
      const result = await createFreeSubscription(organizationId);
      if (!result.success) {
        toast.error(result.error || "Failed to activate free plan");
        setIsLoading(false);
        return;
      }

      posthog.capture("onboarding_step_completed", {
        step: 1,
        step_name: "Choose Plan",
        organization_id: organizationId,
        plan: "free",
      });
      onNext();
      return;
    }

    // Track subscription checkout started
    posthog.capture("onboarding_subscription_started", {
      step: 1,
      step_name: "Choose Plan",
      organization_id: organizationId,
      plan: selectedPlan,
      billing_interval: billingInterval,
      monthly_price: getPriceByInterval(plan, billingInterval),
    });

    // Fire step_completed before Stripe redirect — the paid path leaves via redirect
    // and never reaches onNext(), so the event must fire at commit-time
    posthog.capture("onboarding_step_completed", {
      step: 1,
      step_name: "Choose Plan",
      organization_id: organizationId,
      plan: selectedPlan,
      billing_interval: billingInterval,
    });

    try {
      // Start Stripe checkout for selected plan
      // After successful payment, user will return to onboarding to complete AWS setup
      const result = await authClient.subscription.upgrade({
        plan: selectedPlan,
        annual: billingInterval === "annual",
        referenceId: organizationId,
        successUrl: `${window.location.origin}/${orgSlug}/onboarding?step=2&subscribed=true`,
        cancelUrl: `${window.location.origin}/${orgSlug}/onboarding?step=1&plan=${selectedPlan}&interval=${billingInterval}`,
      });

      if (result.error) {
        toast.error(result.error.message || "Failed to start checkout");
        setIsLoading(false);
      }
      // Stripe will redirect automatically
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start subscription"
      );
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <CreditCardIcon className="h-5 w-5 text-primary" />
        </div>
        <CardTitle>Choose Your Plan</CardTitle>
        <CardDescription>
          Get full access to the Wraps Platform.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Billing Interval Toggle */}
        <BillingToggle
          onChange={handleIntervalChange}
          value={billingInterval}
        />

        {/* Plan Selector */}
        <PlanSelector
          billingInterval={billingInterval}
          onSelectPlan={handlePlanChange}
          selectedPlan={selectedPlan}
          showFreeTier
        />

        {/* AWS Costs Note */}
        <div className="space-y-2 rounded-lg bg-muted/50 p-4">
          <div className="flex items-center gap-2">
            <ZapIcon className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">AWS costs are separate</h3>
          </div>
          <p className="text-muted-foreground text-sm">
            Your subscription covers the Wraps dashboard. You&apos;ll pay AWS
            directly for email sending ($0.10 per 1,000 emails on à la carte, or
            $0.16 on AWS&apos;s default Essentials plan) and infrastructure
            (~$2-5/mo for most apps).
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between">
        <Button disabled={isLoading} onClick={handleBack} variant="outline">
          Back
        </Button>
        <Button loading={isLoading} onClick={handleContinue} size="lg">
          {selectedPlan === "free"
            ? "Continue with Free"
            : `Subscribe to ${plan.name}`}
        </Button>
      </CardFooter>
    </Card>
  );
}
