"use client";

import { CheckIcon, CreditCardIcon, ZapIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";

type BillingStepProps = {
  onNext: () => void;
  onBack: () => void;
  organizationId: string;
};

const PLANS = [
  {
    name: "Free",
    id: "free",
    price: "$0",
    description: "Perfect for trying out Wraps",
    features: [
      "Pay only AWS costs ($0.10/1,000 emails)",
      "Basic email tracking",
      "Community support",
      "Unlimited domains",
    ],
    cta: "Continue with Free",
    popular: false,
    disabled: false,
  },
  {
    name: "Pro",
    id: "pro",
    price: "$29",
    description: "For growing teams and production apps",
    features: [
      "Everything in Free",
      "Advanced analytics dashboard",
      "90-day email history",
      "Real-time event tracking",
      "Priority support",
      "14-day free trial",
    ],
    cta: "Coming Soon",
    popular: true,
    disabled: true,
  },
  {
    name: "Enterprise",
    id: "enterprise",
    price: "Custom",
    description: "For high-volume senders",
    features: [
      "Everything in Pro",
      "Dedicated IP addresses",
      "1-year email retention",
      "Custom integrations",
      "SLA guarantee",
      "Dedicated support",
    ],
    cta: "Contact Sales",
    popular: false,
    disabled: false,
  },
];

export function BillingStep({
  onNext,
  onBack,
  organizationId,
}: BillingStepProps) {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const [selectedPlan, setSelectedPlan] = useState<string>("free");
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectPlan = async () => {
    setIsLoading(true);

    try {
      if (selectedPlan === "free") {
        // No payment required, just continue
        onNext();
        return;
      }

      if (selectedPlan === "enterprise") {
        // Redirect to contact sales
        window.open(
          "mailto:sales@wraps.dev?subject=Enterprise Plan Inquiry",
          "_blank"
        );
        onNext();
        return;
      }

      if (selectedPlan === "pro") {
        // Pro plan is currently disabled
        toast.error("Pro plan is not available yet. Coming soon!");
        setIsLoading(false);
        return;
      }

      // Pro plan - create Stripe checkout session
      // Mark onboarding complete before redirecting to Stripe
      await fetch(`/api/${orgSlug}/onboarding/complete`, {
        method: "POST",
      });

      await authClient.subscription.upgrade({
        plan: selectedPlan,
        referenceId: organizationId,
        successUrl: `${window.location.origin}/${orgSlug}/emails?subscribed=true`,
        cancelUrl: `${window.location.origin}/${orgSlug}/onboarding?step=5`,
      });

      // Stripe will redirect, no need to call onNext
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
          Start free, upgrade anytime. AWS costs are always separate.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Plans Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              className={cn(
                "relative cursor-pointer rounded-lg border-2 p-6 transition-all",
                selectedPlan === plan.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50",
                plan.popular && "ring-2 ring-primary ring-offset-2",
                plan.disabled && "cursor-not-allowed opacity-60"
              )}
              key={plan.id}
              onClick={() => !plan.disabled && setSelectedPlan(plan.id)}
            >
              {plan.popular && (
                <div className="-top-3 -translate-x-1/2 absolute left-1/2 rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground text-xs">
                  Most Popular
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">{plan.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="font-bold text-3xl">{plan.price}</span>
                    {plan.id !== "enterprise" && plan.id !== "free" && (
                      <span className="text-muted-foreground text-sm">
                        /month
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {plan.description}
                  </p>
                </div>

                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li
                      className="flex items-start gap-2 text-sm"
                      key={feature}
                    >
                      <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* AWS Costs Note */}
        <div className="space-y-2 rounded-lg bg-muted/50 p-4">
          <div className="flex items-center gap-2">
            <ZapIcon className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Note on AWS costs</h3>
          </div>
          <p className="text-muted-foreground text-sm">
            Your plan covers the Wraps dashboard and advanced features. You'll
            still pay AWS directly for email sending ($0.10 per 1,000 emails)
            and infrastructure (~$2-5/mo for most apps).
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between">
        <Button disabled={isLoading} onClick={onBack} variant="outline">
          Back
        </Button>
        <Button loading={isLoading} onClick={handleSelectPlan} size="lg">
          {PLANS.find((p) => p.id === selectedPlan)?.cta || "Continue"}
        </Button>
      </CardFooter>
    </Card>
  );
}
