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
import { PLANS } from "@/lib/plans";

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
  const orgSlug = params.orgSlug as string;
  const [isLoading, setIsLoading] = useState(false);

  const starterPlan = PLANS.starter;

  const handleSubscribe = async () => {
    setIsLoading(true);

    try {
      // Mark onboarding complete before redirecting to Stripe
      await fetch(`/api/${orgSlug}/onboarding/complete`, {
        method: "POST",
      });

      // Start Stripe checkout for starter plan
      const result = await authClient.subscription.upgrade({
        plan: "starter",
        referenceId: organizationId,
        successUrl: `${window.location.origin}/${orgSlug}/emails?subscribed=true`,
        cancelUrl: `${window.location.origin}/${orgSlug}/onboarding?step=5`,
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
        <CardTitle>Subscribe to Wraps</CardTitle>
        <CardDescription>
          Get full access to the Wraps hosted dashboard.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Starter Plan Card */}
        <div className="rounded-lg border-2 border-primary bg-primary/5 p-6">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="font-semibold text-xl">{starterPlan.name}</h3>
              <div className="mt-2 flex items-baseline justify-center gap-1">
                <span className="font-bold text-4xl">${starterPlan.price}</span>
                <span className="text-muted-foreground">
                  {starterPlan.period}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                {starterPlan.description}
              </p>
            </div>

            <ul className="grid gap-2 sm:grid-cols-2">
              {starterPlan.featureList.map((feature) => (
                <li className="flex items-start gap-2 text-sm" key={feature}>
                  <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
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
          Subscribe Now
        </Button>
      </CardFooter>
    </Card>
  );
}
