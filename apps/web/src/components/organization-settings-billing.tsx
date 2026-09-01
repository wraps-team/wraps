"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import {
  CheckCircle2Icon,
  CreditCardIcon,
  ExternalLinkIcon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  getOrganizationSubscription,
  type SubscriptionData,
} from "@/actions/subscriptions";
import { BillingToggle } from "@/components/billing-toggle";
import { EventUsageCard } from "@/components/event-usage-card";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  type BillingInterval,
  getAnnualTotal,
  getPaidPlans,
  getPriceByInterval,
  hasEarlyAdopterPricing,
  isTopPlan,
  PLANS,
  type PlanId,
  PUBLIC_PLAN_IDS,
  toPublicPlanId,
} from "@/lib/plans";

type OrganizationSettingsBillingProps = {
  organization: {
    id: string;
    name: string;
    slug: string | null;
  };
  userRole: string;
};

export function OrganizationSettingsBilling({
  organization,
  userRole,
}: OrganizationSettingsBillingProps) {
  const queryClient = useQueryClient();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [upgradeBillingInterval, setUpgradeBillingInterval] =
    useState<BillingInterval>("monthly");

  const canManageBilling =
    userRole === "owner" || userRole === "admin" || userRole === "billing";

  // Get subscription for this organization using our server action
  // This fetches directly from DB to include custom fields like `annual`
  const { data: subscriptionResult, isLoading: loadingSubscriptions } =
    useQuery({
      queryKey: ["subscription", organization.id],
      queryFn: () => {
        if (!organization.id) {
          return Promise.resolve({
            success: true,
            subscription: null,
          } as const);
        }
        return getOrganizationSubscription(organization.id);
      },
      enabled: !!organization.id,
    });

  // Get active subscription from result - only consider active/trialing as active
  const subscription = subscriptionResult?.success
    ? subscriptionResult.subscription
    : undefined;
  const activeSubscription: SubscriptionData | null | undefined =
    subscription?.status === "active" || subscription?.status === "trialing"
      ? subscription
      : null;

  const currentPlan = (activeSubscription?.plan || "free") as PlanId;
  const planConfig = PLANS[currentPlan] || PLANS.free;
  const isTrialing = activeSubscription?.status === "trialing";
  const isCancelled = activeSubscription?.cancelAtPeriodEnd === true;
  // Detect annual billing - check if billing period is yearly
  const isAnnual = activeSubscription?.annual === true;
  const currentBillingInterval: BillingInterval = isAnnual
    ? "annual"
    : "monthly";

  // Mutations
  const billingPortalMutation = useMutation({
    mutationFn: async () =>
      authClient.subscription.billingPortal({
        referenceId: organization.id,
        returnUrl: `${window.location.origin}/${organization.slug}/settings/billing`,
      }),
    onSuccess: (result) => {
      if (result.data?.url) {
        window.location.href = result.data.url;
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to open billing portal");
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async ({ plan, annual }: { plan: string; annual: boolean }) =>
      authClient.subscription.upgrade({
        plan,
        annual,
        referenceId: organization.id,
        successUrl: `${window.location.origin}/${organization.slug}/settings/billing?subscribed=true`,
        cancelUrl: `${window.location.origin}/${organization.slug}/settings/billing`,
      }),
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upgrade subscription");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () =>
      authClient.subscription.cancel({
        referenceId: organization.id,
        returnUrl: `${window.location.origin}/${organization.slug}/settings/billing`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["subscription", organization.id],
      });
      setShowCancelDialog(false);
      toast.success("Subscription cancelled successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to cancel subscription");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () =>
      authClient.subscription.restore({
        referenceId: organization.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["subscription", organization.id],
      });
      toast.success("Subscription restored successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to restore subscription");
    },
  });

  if (loadingSubscriptions) {
    return <Loader />;
  }

  const trialEndsAt = activeSubscription?.trialEnd
    ? new Date(activeSubscription.trialEnd)
    : null;

  const periodEndsAt = activeSubscription?.periodEnd
    ? new Date(activeSubscription.periodEnd)
    : null;

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Current Plan
                {isAnnual && (
                  <Badge className="bg-green-600 text-primary-foreground">
                    Annual
                  </Badge>
                )}
                {isTrialing && <Badge variant="secondary">Trial</Badge>}
                {isCancelled && <Badge variant="destructive">Cancelling</Badge>}
              </CardTitle>
              <CardDescription>
                {isTrialing && trialEndsAt
                  ? `Your trial ends on ${trialEndsAt.toLocaleDateString()}`
                  : isCancelled && periodEndsAt
                    ? `Access ends on ${periodEndsAt.toLocaleDateString()}`
                    : "You're currently on this plan"}
              </CardDescription>
            </div>
            {activeSubscription && canManageBilling && (
              <Button
                loading={billingPortalMutation.isPending}
                onClick={() => billingPortalMutation.mutate()}
                variant="outline"
              >
                <CreditCardIcon className="mr-2 size-4" />
                Manage Billing
                <ExternalLinkIcon className="ml-2 size-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-4xl">{planConfig.name}</span>
            {planConfig.price !== null && planConfig.price > 0 && (
              <span className="text-muted-foreground">
                ${getPriceByInterval(planConfig, currentBillingInterval)}/mo
                {isAnnual && getAnnualTotal(planConfig) && (
                  <span className="ml-2 text-green-600">
                    (${getAnnualTotal(planConfig)}/yr)
                  </span>
                )}
              </span>
            )}
          </div>

          <ul className="space-y-2">
            {planConfig.featureList.map((feature) => (
              <li className="flex items-start gap-2 text-sm" key={feature}>
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          {isCancelled && periodEndsAt && (
            <div className="flex items-center justify-between rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Your subscription will end on{" "}
                {periodEndsAt.toLocaleDateString()}
              </p>
              <Button
                disabled={!canManageBilling}
                loading={restoreMutation.isPending}
                onClick={() => restoreMutation.mutate()}
                size="sm"
                variant="outline"
              >
                Restore
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Usage */}
      {organization.slug && <EventUsageCard orgSlug={organization.slug} />}

      {/* Upgrade Options */}
      {!(isCancelled || isTopPlan(currentPlan)) && (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade Your Plan</CardTitle>
            <CardDescription>
              Unlock more features and increase your limits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Billing Interval Toggle */}
            <BillingToggle
              onChange={setUpgradeBillingInterval}
              value={upgradeBillingInterval}
            />

            <div className="grid gap-4 md:grid-cols-2">
              {/* One card per purchasable plan above the org's current one */}
              {getPaidPlans()
                .filter(
                  ({ id }) =>
                    PUBLIC_PLAN_IDS.indexOf(id) >
                    PUBLIC_PLAN_IDS.indexOf(toPublicPlanId(currentPlan))
                )
                .map(({ id, plan }, index) => (
                  <div className="space-y-4 rounded-lg border p-6" key={id}>
                    <div>
                      <h3 className="font-semibold text-lg">{plan.name}</h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="font-bold text-3xl">
                          ${getPriceByInterval(plan, upgradeBillingInterval)}
                        </span>
                        {hasEarlyAdopterPricing(plan) && (
                          <span className="text-muted-foreground text-sm line-through">
                            $
                            {upgradeBillingInterval === "annual"
                              ? plan.annualPrice
                              : plan.price}
                          </span>
                        )}
                        <span className="text-muted-foreground text-sm">
                          /mo
                        </span>
                      </div>
                      {upgradeBillingInterval === "annual" &&
                        getAnnualTotal(plan) && (
                          <p className="mt-1 text-green-600 text-sm">
                            ${getAnnualTotal(plan)} billed annually
                          </p>
                        )}
                      <p className="mt-1 text-muted-foreground text-sm">
                        {plan.description}
                      </p>
                    </div>

                    <ul className="space-y-2">
                      {plan.featureList.slice(0, 4).map((feature) => (
                        <li
                          className="flex items-start gap-2 text-sm"
                          key={feature}
                        >
                          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className="w-full"
                      disabled={!canManageBilling}
                      loading={upgradeMutation.isPending}
                      onClick={() =>
                        upgradeMutation.mutate({
                          plan: id,
                          annual: upgradeBillingInterval === "annual",
                        })
                      }
                      variant={index === 0 ? "default" : "outline"}
                    >
                      Upgrade to {plan.name}
                    </Button>
                  </div>
                ))}
            </div>

            {!canManageBilling && (
              <p className="mt-4 text-center text-muted-foreground text-xs">
                Only organization owners and admins can manage billing
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* AWS Infrastructure Costs */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ZapIcon className="size-5 text-primary" />
            <CardTitle>AWS Infrastructure Costs</CardTitle>
          </div>
          <CardDescription>
            Separate from your Wraps subscription
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-muted-foreground text-sm">
          <p>
            <strong className="text-foreground">Email Sending:</strong> $0.10
            per 1,000 emails à la carte, or $0.16 on AWS&apos;s default
            Essentials plan (paid directly to AWS)
          </p>
          <p>
            <strong className="text-foreground">Infrastructure:</strong>{" "}
            ~$2-5/month for DynamoDB, Lambda, EventBridge
          </p>
          <p className="text-xs">
            New AWS accounts get $200 in AWS Free Tier credits, valid for 6
            months.
          </p>
        </CardContent>
      </Card>

      {/* Cancel Subscription */}
      {activeSubscription && !isCancelled && (
        <div className="border-t pt-6">
          <Button
            className="text-muted-foreground hover:text-destructive"
            disabled={!canManageBilling}
            onClick={() => setShowCancelDialog(true)}
            variant="ghost"
          >
            Cancel Subscription
          </Button>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!cancelMutation.isPending) {
            setShowCancelDialog(open);
          }
        }}
        open={showCancelDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription?</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel? You'll lose access to the
              dashboard at the end of your billing period
              {periodEndsAt && ` on ${periodEndsAt.toLocaleDateString()}`}. You
              can still use the CLI and SDK for free.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={cancelMutation.isPending}
              onClick={() => setShowCancelDialog(false)}
              variant="outline"
            >
              Keep Subscription
            </Button>
            <Button
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
              variant="destructive"
            >
              Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
