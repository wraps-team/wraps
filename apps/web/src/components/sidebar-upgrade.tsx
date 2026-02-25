"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useActiveOrganization } from "@/contexts/organization-context";
import { PLANS } from "@/lib/plans";
import { useProductsStore } from "@/stores/products-store";

/**
 * Shows an upgrade prompt in the sidebar footer when the user
 * is missing features they could unlock by upgrading.
 */
export function SidebarUpgrade() {
  const { state } = useSidebar();
  const { activeOrganization } = useActiveOrganization();
  const productsStatus = useProductsStore((s) => s.status);

  const orgSlug = activeOrganization?.slug;
  const planId = productsStatus?.planId;
  const planFeatures = productsStatus?.planFeatures;

  // Don't show if no org, no plan, or sidebar is collapsed
  if (!(orgSlug && planId && planFeatures) || state === "collapsed") {
    return null;
  }

  // Determine what features they're missing
  const missingFeatures: string[] = [];

  if (!(planFeatures.topics && planFeatures.segments)) {
    missingFeatures.push("Audience Segments");
  }
  if (!planFeatures.automations) {
    missingFeatures.push("Automations");
  }

  // Don't show if they have all features
  if (missingFeatures.length === 0) {
    return null;
  }

  // Get next plan info
  const _currentPlan = PLANS[planId];
  const nextPlanId =
    planId === "free"
      ? "starter"
      : planId === "starter"
        ? "growth"
        : planId === "growth"
          ? "scale"
          : null;
  const nextPlan = nextPlanId ? PLANS[nextPlanId] : null;

  if (!nextPlan) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Link
          className="flex items-start gap-3 rounded-lg border border-border/50 bg-gradient-to-br from-sidebar-accent/50 to-sidebar-accent/20 p-3 text-sm transition-colors hover:border-border hover:bg-sidebar-accent"
          href={`/${orgSlug}/settings/billing`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">Upgrade to {nextPlan.name}</span>
            <span className="text-muted-foreground text-xs">
              Unlock {missingFeatures.slice(0, 2).join(", ")}
              {missingFeatures.length > 2 &&
                ` +${missingFeatures.length - 2} more`}
            </span>
          </div>
        </Link>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
