"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2Icon,
  CreditCardIcon,
  ExternalLinkIcon,
  ZapIcon,
} from "lucide-react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import Loader from "@/components/loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

const PLAN_FEATURES = {
  free: [
    "Pay only AWS costs ($0.10/1,000 emails)",
    "Basic email tracking",
    "Community support",
    "Unlimited domains",
  ],
  pro: [
    "Everything in Free",
    "Advanced analytics dashboard",
    "90-day email history",
    "Real-time event tracking",
    "Priority support",
  ],
  enterprise: [
    "Everything in Pro",
    "Dedicated IP addresses",
    "1-year email retention",
    "Custom integrations",
    "SLA guarantee",
    "Dedicated support",
  ],
};

export default function BillingSettings() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const queryClient = useQueryClient();

  // Fetch organization to get the ID
  const { data: organizations } = authClient.useListOrganizations();
  const organization = organizations?.find(
    (org) => org.slug === orgSlug || org.id === orgSlug
  );

  // Fetch subscription data using Better-Auth
  const { data: subscriptions, isLoading: loadingSubscriptions } = useQuery({
    queryKey: ["subscriptions", organization?.id],
    queryFn: async () => {
      if (!organization?.id) {
        return { data: [] };
      }
      return authClient.subscription.list({
        query: {
          referenceId: organization.id,
        },
      });
    },
    enabled: !!organization?.id,
  });

  const activeSubscription = subscriptions?.data?.find(
    (sub: { status: string }) =>
      sub.status === "active" || sub.status === "trialing"
  );

  // Mutation for accessing billing portal
  const billingPortalMutation = useMutation({
    mutationFn: async () =>
      authClient.subscription.billingPortal({
        returnUrl: `${window.location.origin}/settings/billing`,
      }),
    onError: (error: Error) => {
      toast.error(error.message || "Failed to open billing portal");
    },
  });

  // Mutation for upgrading subscription
  const upgradeMutation = useMutation({
    mutationFn: async (plan: string) => {
      if (!organization?.id) {
        throw new Error("Organization not found");
      }

      return authClient.subscription.upgrade({
        plan,
        referenceId: organization.id,
        successUrl: `${window.location.origin}/settings/billing?success=true`,
        cancelUrl: `${window.location.origin}/settings/billing`,
        subscriptionId: activeSubscription?.stripeSubscriptionId,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upgrade subscription");
    },
  });

  // Mutation for canceling subscription
  const _cancelMutation = useMutation({
    mutationFn: async () => {
      if (!activeSubscription?.id) {
        throw new Error("No active subscription");
      }

      return authClient.subscription.cancel({
        subscriptionId: activeSubscription.id,
        returnUrl: `${window.location.origin}/settings/billing`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["subscriptions", organization?.id],
      });
      toast.success("Subscription canceled successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to cancel subscription");
    },
  });

  if (loadingSubscriptions) {
    return <Loader />;
  }

  const currentPlan = activeSubscription?.plan || "free";
  const isTrialing = activeSubscription?.status === "trialing";
  const trialEndsAt = activeSubscription?.trialEnd
    ? new Date(activeSubscription.trialEnd)
    : null;

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Plans & Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and billing information.
        </p>
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Current Plan
                {isTrialing && (
                  <Badge className="ml-2" variant="secondary">
                    Free Trial
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {isTrialing && trialEndsAt
                  ? `Your trial ends on ${trialEndsAt.toLocaleDateString()}`
                  : "You're currently on this plan"}
              </CardDescription>
            </div>
            {activeSubscription && (
              <Button
                loading={billingPortalMutation.isPending}
                onClick={() => billingPortalMutation.mutate()}
                variant="outline"
              >
                <CreditCardIcon className="mr-2 h-4 w-4" />
                Manage Billing
                <ExternalLinkIcon className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-4xl capitalize">
                {currentPlan}
              </span>
              {currentPlan !== "free" && currentPlan !== "enterprise" && (
                <span className="text-muted-foreground">$29/month</span>
              )}
            </div>

            <ul className="space-y-2">
              {PLAN_FEATURES[currentPlan as keyof typeof PLAN_FEATURES]?.map(
                (feature) => (
                  <li className="flex items-start gap-2 text-sm" key={feature}>
                    <CheckCircle2Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                )
              )}
            </ul>

            {activeSubscription?.cancelAtPeriodEnd && (
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  Your subscription will be canceled at the end of the current
                  billing period on{" "}
                  {new Date(activeSubscription.periodEnd!).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AWS Costs Note */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ZapIcon className="h-5 w-5 text-primary" />
            <CardTitle>AWS Infrastructure Costs</CardTitle>
          </div>
          <CardDescription>
            Separate from your Wraps subscription
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-muted-foreground text-sm">
          <p>
            <strong>Email Sending:</strong> $0.10 per 1,000 emails (paid
            directly to AWS)
          </p>
          <p>
            <strong>Infrastructure:</strong> ~$2-5/month for DynamoDB, Lambda,
            EventBridge
          </p>
          <p className="text-xs">
            Free tier: First 62,000 emails/month are free for new AWS accounts
          </p>
        </CardContent>
      </Card>

      {/* Available Plans */}
      {currentPlan === "free" && (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade Your Plan</CardTitle>
            <CardDescription>
              Get access to advanced features and priority support
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4 rounded-lg border bg-card p-6">
              <div>
                <h3 className="font-semibold text-lg">Pro</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-bold text-3xl">$29</span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">
                  Perfect for growing teams
                </p>
              </div>

              <ul className="space-y-2">
                {PLAN_FEATURES.pro.map((feature) => (
                  <li className="flex items-start gap-2 text-sm" key={feature}>
                    <CheckCircle2Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="w-full"
                loading={upgradeMutation.isPending}
                onClick={() => upgradeMutation.mutate("pro")}
              >
                Start 14-Day Free Trial
              </Button>
            </div>

            <div className="space-y-4 rounded-lg border bg-card p-6">
              <div>
                <h3 className="font-semibold text-lg">Enterprise</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-bold text-3xl">Custom</span>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">
                  For high-volume senders
                </p>
              </div>

              <ul className="space-y-2">
                {PLAN_FEATURES.enterprise.map((feature) => (
                  <li className="flex items-start gap-2 text-sm" key={feature}>
                    <CheckCircle2Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button asChild className="w-full" variant="outline">
                <a href="mailto:sales@wraps.dev?subject=Enterprise Plan Inquiry">
                  Contact Sales
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
