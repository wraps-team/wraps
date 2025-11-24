"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  CreditCardIcon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type OrganizationSettingsBillingProps = {
  organization: {
    id: string;
    name: string;
    slug: string | null;
  };
  userRole: "owner" | "admin" | "member";
};

export function OrganizationSettingsBilling({
  organization,
  userRole,
}: OrganizationSettingsBillingProps) {
  const queryClient = useQueryClient();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Only owners and admins can manage billing
  const canManageBilling = userRole === "owner" || userRole === "admin";

  // Get subscriptions for this organization
  const { data: subscriptions, isLoading: loadingSubscriptions } = useQuery({
    queryKey: ["subscriptions", organization.id],
    queryFn: async () => {
      if (!organization.id) {
        return [];
      }
      return authClient.subscription.list({
        query: {
          referenceId: organization.id,
        },
      });
    },
    enabled: !!organization.id,
  });

  // Cancel subscription mutation
  const cancelMutation = useMutation({
    mutationFn: async (subscriptionId: string) =>
      authClient.subscription.cancel({
        referenceId: organization.id,
        subscriptionId,
        returnUrl: `${window.location.origin}/${organization.slug}/settings?tab=billing`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["subscriptions", organization.id],
      });
      setShowCancelDialog(false);
      toast.success("Subscription cancelled successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to cancel subscription");
    },
  });

  // Restore subscription mutation
  const restoreMutation = useMutation({
    mutationFn: async (subscriptionId: string) =>
      authClient.subscription.restore({
        referenceId: organization.id,
        subscriptionId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["subscriptions", organization.id],
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

  const activeSubscription = (subscriptions as any)?.data?.[0];
  const currentPlan = activeSubscription?.plan || "free";
  const isTrialing = activeSubscription?.status === "trialing";
  const isCancelled = activeSubscription?.cancelAtPeriodEnd === true;
  const trialEndsAt = activeSubscription?.trialEnd
    ? new Date(activeSubscription.trialEnd)
    : null;

  const handleUpgrade = async () => {
    if (!canManageBilling) {
      toast.error("Only organization owners and admins can manage billing");
      return;
    }

    try {
      // Include subscriptionId if switching plans (not creating new subscription)
      const upgradeParams: any = {
        plan: "pro",
        referenceId: organization.id,
        successUrl: `${window.location.origin}/${organization.slug}/settings?tab=billing&subscribed=true`,
        cancelUrl: `${window.location.origin}/${organization.slug}/settings?tab=billing`,
      };

      // If user has an existing subscription, pass it to avoid duplicate charges
      if (activeSubscription?.id) {
        upgradeParams.subscriptionId = activeSubscription.id;
      }

      await authClient.subscription.upgrade(upgradeParams);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start upgrade"
      );
    }
  };

  const handleCancelClick = () => {
    if (!canManageBilling) {
      toast.error("Only organization owners and admins can manage billing");
      return;
    }

    if (!activeSubscription?.id) {
      toast.error("No active subscription to cancel");
      return;
    }

    setShowCancelDialog(true);
  };

  const handleConfirmCancel = () => {
    if (activeSubscription?.id) {
      cancelMutation.mutate(activeSubscription.id);
    }
  };

  const handleBillingPortal = async () => {
    if (!canManageBilling) {
      toast.error("Only organization owners and admins can manage billing");
      return;
    }

    try {
      const { data, error } = await authClient.subscription.billingPortal({
        referenceId: organization.id,
        returnUrl: `${window.location.origin}/${organization.slug}/settings?tab=billing`,
      });

      if (error) {
        toast.error(error.message || "Failed to open billing portal");
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to open billing portal"
      );
    }
  };

  const handleRestore = () => {
    if (!canManageBilling) {
      toast.error("Only organization owners and admins can manage billing");
      return;
    }

    if (!activeSubscription?.id) {
      toast.error("No subscription to restore");
      return;
    }

    restoreMutation.mutate(activeSubscription.id);
  };

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                Manage your organization's subscription
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                className="capitalize"
                variant={currentPlan === "pro" ? "default" : "secondary"}
              >
                {currentPlan}
              </Badge>
              {isCancelled && <Badge variant="destructive">Cancelling</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isTrialing && trialEndsAt && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
              <p className="text-blue-900 text-sm dark:text-blue-100">
                <strong>Trial Period:</strong> Your 14-day free trial ends on{" "}
                {trialEndsAt.toLocaleDateString()}. You won't be charged until
                then.
              </p>
            </div>
          )}

          <div>
            <h3 className="mb-3 font-semibold">Plan Benefits</h3>
            <ul className="space-y-2">
              {PLAN_FEATURES[currentPlan as keyof typeof PLAN_FEATURES]?.map(
                (feature) => (
                  <li className="flex items-start gap-2 text-sm" key={feature}>
                    <CheckCircle2Icon className="mt-0.5 size-4 flex-shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                )
              )}
            </ul>
          </div>

          {activeSubscription && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium capitalize">
                  {activeSubscription.status}
                </span>
              </div>
              {activeSubscription.currentPeriodEnd && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {isCancelled
                      ? "Access ends on"
                      : isTrialing
                        ? "Trial ends"
                        : "Renews on"}
                  </span>
                  <span className="font-medium">
                    {new Date(
                      activeSubscription.currentPeriodEnd
                    ).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Billing Portal Button */}
          {currentPlan !== "free" && (
            <div className="border-t pt-4">
              <Button
                className="w-full"
                disabled={!canManageBilling}
                onClick={handleBillingPortal}
                variant="outline"
              >
                <CreditCardIcon className="mr-2 size-4" />
                Manage Billing & Payments
              </Button>
              {!canManageBilling && (
                <p className="mt-2 text-center text-muted-foreground text-xs">
                  Only organization owners and admins can manage billing
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Subscription Card */}
      {isCancelled && currentPlan === "pro" && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Restore Your Subscription</CardTitle>
            <CardDescription>
              Changed your mind? You can reactivate your subscription before it
              ends.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Your subscription is set to cancel on{" "}
              {activeSubscription?.currentPeriodEnd &&
                new Date(
                  activeSubscription.currentPeriodEnd
                ).toLocaleDateString()}
              . Click below to restore access and continue your Pro plan.
            </p>
            <Button
              className="w-full"
              disabled={!canManageBilling || restoreMutation.isPending}
              onClick={handleRestore}
            >
              {restoreMutation.isPending
                ? "Restoring..."
                : "Restore Subscription"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upgrade Option - Free to Pro */}
      {currentPlan === "free" && (
        <Card className="border-primary opacity-60">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <ArrowUpIcon className="size-5 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  Upgrade to Pro
                  <Badge variant="secondary">Coming Soon</Badge>
                </CardTitle>
                <CardDescription>
                  Unlock advanced features and priority support
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-3xl">$29</span>
              <span className="text-muted-foreground">/month</span>
            </div>

            <ul className="space-y-2">
              {PLAN_FEATURES.pro.map((feature) => (
                <li className="flex items-start gap-2 text-sm" key={feature}>
                  <CheckCircle2Icon className="mt-0.5 size-4 flex-shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Button className="w-full" disabled size="lg">
              <CreditCardIcon className="mr-2 size-4" />
              Coming Soon
            </Button>

            <p className="text-center text-muted-foreground text-xs">
              Pro plan is not available yet. Stay tuned!
            </p>
          </CardContent>
        </Card>
      )}

      {/* Upgrade Option - Pro to Enterprise */}
      {currentPlan === "pro" && (
        <Card className="border-primary">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <ArrowUpIcon className="size-5 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle>Upgrade to Enterprise</CardTitle>
                <CardDescription>
                  For high-volume senders with custom needs
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-3xl">Custom</span>
              <span className="text-muted-foreground">pricing</span>
            </div>

            <ul className="space-y-2">
              {PLAN_FEATURES.enterprise.map((feature) => (
                <li className="flex items-start gap-2 text-sm" key={feature}>
                  <CheckCircle2Icon className="mt-0.5 size-4 flex-shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              className="w-full"
              disabled={!canManageBilling}
              onClick={() =>
                window.open(
                  "mailto:sales@wraps.dev?subject=Enterprise Plan Inquiry",
                  "_blank"
                )
              }
              size="lg"
            >
              Contact Sales
            </Button>

            {!canManageBilling && (
              <p className="text-center text-muted-foreground text-xs">
                Only organization owners and admins can manage billing
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Downgrade Option */}
      {currentPlan === "pro" && !isCancelled && (
        <Card className="border-muted">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <ArrowDownIcon className="size-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-muted-foreground">
                  Downgrade to Free
                </CardTitle>
                <CardDescription>Switch back to the free plan</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Downgrading will remove access to Pro features at the end of your
              current billing period. You'll still have access until{" "}
              {activeSubscription?.currentPeriodEnd &&
                new Date(
                  activeSubscription.currentPeriodEnd
                ).toLocaleDateString()}
              .
            </p>

            <Button
              disabled={!canManageBilling}
              onClick={handleCancelClick}
              variant="outline"
            >
              Cancel Subscription
            </Button>
          </CardContent>
        </Card>
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
              Are you sure you want to cancel your Pro subscription? You'll lose
              access to Pro features at the end of your current billing period
              {activeSubscription?.currentPeriodEnd && (
                <>
                  {" "}
                  on{" "}
                  {new Date(
                    activeSubscription.currentPeriodEnd
                  ).toLocaleDateString()}
                </>
              )}
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={cancelMutation.isPending}
              onClick={() => setShowCancelDialog(false)}
              type="button"
              variant="outline"
            >
              Keep Subscription
            </Button>
            <Button
              disabled={cancelMutation.isPending}
              onClick={handleConfirmCancel}
              type="button"
              variant="destructive"
            >
              {cancelMutation.isPending
                ? "Cancelling..."
                : "Yes, Cancel Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AWS Costs Note */}
      <Card className="border-muted bg-muted/30">
        <CardContent className="flex items-start gap-3 pt-6">
          <ZapIcon className="mt-0.5 size-5 flex-shrink-0 text-primary" />
          <div className="space-y-1">
            <h3 className="font-semibold text-sm">Note on AWS Costs</h3>
            <p className="text-muted-foreground text-sm">
              Your plan covers the Wraps dashboard and advanced features. You'll
              still pay AWS directly for email sending ($0.10 per 1,000 emails)
              and infrastructure (~$2-5/mo for most apps).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
