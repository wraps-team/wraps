"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { PLANS } from "@/lib/plans";

export default function UpgradePage() {
  const router = useRouter();
  const { orgSlug } = useParams<{ orgSlug: string }>();
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

  async function handleUpgrade() {
    if (!organization?.id) {
      toast.error("Organization not found");
      return;
    }

    setIsLoading(true);

    try {
      const result = await authClient.subscription.upgrade({
        plan: "starter",
        referenceId: organization.id,
        successUrl: `${window.location.origin}/${orgSlug}/emails`,
        cancelUrl: `${window.location.origin}/${orgSlug}/upgrade`,
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

  const starterPlan = PLANS.starter;

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Subscribe to Wraps</CardTitle>
          <CardDescription>
            Get full access to the Wraps hosted dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <span className="font-bold text-4xl">${starterPlan.price}</span>
            <span className="text-muted-foreground">{starterPlan.period}</span>
          </div>

          <ul className="space-y-3">
            {starterPlan.featureList.map((feature) => (
              <li className="flex items-start gap-3" key={feature}>
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <span className="text-sm">{feature}</span>
              </li>
            ))}
          </ul>

          <div className="space-y-3">
            <Button
              className="w-full"
              disabled={isLoading}
              onClick={handleUpgrade}
              size="lg"
            >
              {isLoading ? "Starting checkout..." : "Subscribe Now"}
            </Button>
            <Button asChild className="w-full" variant="ghost">
              <a href="https://wraps.dev/docs/cli">Continue with CLI Only</a>
            </Button>
          </div>

          <p className="text-center text-muted-foreground text-xs">
            AWS infrastructure costs are separate ($0.10/1,000 emails).
            <br />
            Cancel anytime.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
