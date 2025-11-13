"use client";

import { PricingPlans } from "@/components/pricing-plans";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BillingHistoryCard } from "./components/billing-history-card";
import { CurrentPlanCard } from "./components/current-plan-card";
import billingHistoryData from "./data/billing-history.json";
// Import data
import currentPlanData from "./data/current-plan.json";

export default function BillingSettings() {
  const handlePlanSelect = (planId: string) => {
    console.log("Plan selected:", planId);
    // Handle plan selection logic here
  };

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Plans & Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and billing information.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CurrentPlanCard plan={currentPlanData} />
        <BillingHistoryCard history={billingHistoryData} />
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Available Plans</CardTitle>
            <CardDescription>
              Choose a plan that works best for you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PricingPlans
              currentPlanId="professional"
              mode="billing"
              onPlanSelect={handlePlanSelect}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
