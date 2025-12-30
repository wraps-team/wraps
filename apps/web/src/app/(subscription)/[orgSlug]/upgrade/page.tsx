"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkles, Zap } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import Loader from "@/components/loader";
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

export default function UpgradePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orgSlug } = useParams<{ orgSlug: string }>();

  // Get plan from URL param, default to starter
  const planParam = searchParams.get("plan") as PlanId | null;
  const initialPlan: PlanId =
    planParam && ["starter", "pro", "growth", "scale"].includes(planParam)
      ? planParam
      : "starter";

  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch organizations to find the current one
  const { data: organizations, isPending: orgsLoading } =
    authClient.useListOrganizations();

  const organization = organizations?.find(
    (org) => org.slug === orgSlug || org.id === orgSlug
  );

  // Check if user already has an active subscription
  const { data: subscriptions, isLoading: subsLoading } = useQuery({
    queryKey: ["subscriptions", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return { data: [] };
      return authClient.subscription.list({
        query: { referenceId: organization.id },
      });
    },
    enabled: !!organization?.id,
  });

  const activeSubscription = (subscriptions as any)?.data?.find(
    (sub: any) => sub.status === "active" || sub.status === "trialing"
  );

  // If user has an active subscription, redirect to dashboard
  if (activeSubscription && !subsLoading) {
    router.push(`/${orgSlug}/emails`);
    return null;
  }

  async function handleSubscribe() {
    if (!organization?.id) {
      toast.error("Organization not found");
      return;
    }

    setIsLoading(true);

    try {
      const result = await authClient.subscription.upgrade({
        plan: selectedPlan,
        referenceId: organization.id,
        successUrl: `${window.location.origin}/${orgSlug}/emails?subscribed=true`,
        cancelUrl: `${window.location.origin}/${orgSlug}/upgrade?plan=${selectedPlan}`,
      });

      if (result.error) {
        toast.error(result.error.message || "Failed to start checkout");
        setIsLoading(false);
      }
      // Stripe will redirect automatically
    } catch (_error) {
      toast.error("Failed to start checkout. Please try again.");
      setIsLoading(false);
    }
  }

  if (orgsLoading || subsLoading) {
    return <Loader fullScreen />;
  }

  if (!organization) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Organization not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const plan = PLANS[selectedPlan];

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-4xl space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-bold text-2xl">Choose Your Plan</h1>
          <p className="mt-2 text-muted-foreground">
            Get full access to the Wraps hosted dashboard
          </p>
        </div>

        {/* Plan Selector */}
        <PlanSelector
          onSelectPlan={setSelectedPlan}
          selectedPlan={selectedPlan}
        />

        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {plan.name} Plan - ${getDisplayPrice(plan)}
              {hasEarlyAdopterPricing(plan) && (
                <span className="ml-1 text-muted-foreground line-through">
                  ${plan.price}
                </span>
              )}
              {plan.period}
            </CardTitle>
            <CardDescription>
              {plan.description}
              {hasEarlyAdopterPricing(plan) && (
                <span className="ml-2 text-green-600">
                  Early adopter pricing - locked forever
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* AWS Costs Note */}
            <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
              <Zap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-sm">AWS costs are separate</p>
                <p className="text-muted-foreground text-sm">
                  You pay AWS directly for email sending ($0.10 per 1,000
                  emails) and infrastructure (~$2-5/mo for most apps).
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 sm:flex-row sm:justify-between">
            <Button asChild variant="ghost">
              <a href="https://wraps.dev/docs/cli">Continue with CLI Only</a>
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={isLoading}
              onClick={handleSubscribe}
              size="lg"
            >
              {isLoading ? "Starting checkout..." : `Subscribe to ${plan.name}`}
            </Button>
          </CardFooter>
        </Card>

        <p className="text-center text-muted-foreground text-xs">
          Cancel anytime. No long-term contracts.
        </p>
      </div>
    </div>
  );
}
