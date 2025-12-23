"use client";

import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PLANS, type PlanId } from "@/lib/plans";

type FeatureGateProps = {
  children: ReactNode;
  currentPlanId: PlanId;
  feature: string;
  featureDescription: string;
  isAllowed: boolean;
  orgSlug: string;
  requiredPlanId: PlanId;
};

export function FeatureGate({
  children,
  currentPlanId,
  feature,
  featureDescription,
  isAllowed,
  orgSlug,
  requiredPlanId,
}: FeatureGateProps) {
  if (isAllowed) {
    return <>{children}</>;
  }

  const requiredPlan = PLANS[requiredPlanId];
  const currentPlan = PLANS[currentPlanId];

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <div className="mb-4 rounded-full bg-muted p-3">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="mb-2 font-semibold text-xl">{feature}</h2>
      <p className="mb-6 max-w-md text-muted-foreground">{featureDescription}</p>
      <div className="mb-6 rounded-lg bg-muted/50 px-4 py-3">
        <p className="text-sm">
          <span className="text-muted-foreground">Your plan:</span>{" "}
          <span className="font-medium">{currentPlan.name}</span>
          <span className="mx-2 text-muted-foreground">|</span>
          <span className="text-muted-foreground">Required:</span>{" "}
          <span className="font-medium text-primary">{requiredPlan.name}</span>
          <span className="ml-1 text-muted-foreground">
            (${requiredPlan.price}/mo)
          </span>
        </p>
      </div>
      <Button asChild>
        <Link href={`/${orgSlug}/settings/billing`}>
          Upgrade to {requiredPlan.name}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
