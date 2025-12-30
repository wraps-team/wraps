"use client";

import { CreditCardIcon, ZapIcon } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PlanSelector } from "@/components/plan-selector";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import {
  getDisplayPrice,
  hasEarlyAdopterPricing,
  PLANS,
  type PlanId,
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

  // Get plan from URL param, default to starter
  const planParam = searchParams.get("plan") as PlanId | null;
  const initialPlan: PlanId =
    planParam && ["starter", "pro", "growth", "scale"].includes(planParam)
      ? planParam
      : "starter";

  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [isLoading, setIsLoading] = useState(false);

  const plan = PLANS[selectedPlan];

  const handleSubscribe = async () => {
    setIsLoading(true);

    try {
      // Mark onboarding complete before redirecting to Stripe
      await fetch(`/api/${orgSlug}/onboarding/complete`, {
        method: "POST",
      });

      // Start Stripe checkout for selected plan
      const result = await authClient.subscription.upgrade({
        plan: selectedPlan,
        referenceId: organizationId,
        successUrl: `${window.location.origin}/${orgSlug}/emails?subscribed=true`,
        cancelUrl: `${window.location.origin}/${orgSlug}/onboarding?step=5&plan=${selectedPlan}`,
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
          Get full access to the Wraps hosted dashboard.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Plan Selector */}
        <PlanSelector
          onSelectPlan={setSelectedPlan}
          selectedPlan={selectedPlan}
        />

        {/* Selected Plan Summary */}
        <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{plan.name} Plan</h3>
              <p className="text-muted-foreground text-sm">{plan.description}</p>
            </div>
            <div className="text-right">
              <span className="font-bold text-2xl">
                ${getDisplayPrice(plan)}
              </span>
              {hasEarlyAdopterPricing(plan) && (
                <span className="ml-1 text-muted-foreground line-through">
                  ${plan.price}
                </span>
              )}
              <span className="text-muted-foreground">{plan.period}</span>
            </div>
          </div>
          {hasEarlyAdopterPricing(plan) && (
            <p className="mt-2 text-green-600 text-xs">
              Early adopter pricing - your rate stays locked forever
            </p>
          )}
        </div>

        {/* AWS Costs Note */}
        <div className="space-y-2 rounded-lg bg-muted/50 p-4">
          <div className="flex items-center gap-2">
            <ZapIcon className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">AWS costs are separate</h3>
          </div>
          <p className="text-muted-foreground text-sm">
            Your subscription covers the Wraps dashboard. You'll pay AWS
            directly for email sending ($0.10 per 1,000 emails) and
            infrastructure (~$2-5/mo for most apps).
          </p>
        </div>

        {/* CLI-only alternative */}
        <div className="rounded-lg border border-dashed p-4 text-center">
          <p className="text-muted-foreground text-sm">
            Just want the CLI?{" "}
            <a
              className="font-medium text-primary hover:underline"
              href="https://wraps.dev/docs/cli"
              rel="noopener noreferrer"
              target="_blank"
            >
              Use Wraps free forever
            </a>{" "}
            without a dashboard account.
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between">
        <Button disabled={isLoading} onClick={onBack} variant="outline">
          Back
        </Button>
        <Button loading={isLoading} onClick={handleSubscribe} size="lg">
          Subscribe to {plan.name}
        </Button>
      </CardFooter>
    </Card>
  );
}
