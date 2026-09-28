import {
  getSesFeatureEntitlement,
  isSesPricingPlan,
  SES_PLAN_RATES,
} from "@wraps/core/ses-plans";
import type { awsAccount } from "@wraps/db";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import type { InferSelectModel } from "drizzle-orm";

type VdmStatusCardProps = {
  account: Pick<InferSelectModel<typeof awsAccount>, "healthDetail" | "region">;
};

/**
 * Read-only summary of Virtual Deliverability Manager for this account —
 * on/off state, a plan-aware entitlement line, and open advisor
 * recommendations from the last hourly health sweep. Server component: reads
 * the already org-scoped `account` row the parent page passes down, same
 * pattern as `stale-policy-banner.tsx`. Visible to every viewer.
 */
export function VdmStatusCard({ account }: VdmStatusCardProps) {
  const vdm = account.healthDetail?.vdm;

  // Never measured yet — say nothing rather than guess.
  if (!vdm) {
    return null;
  }

  const rawPlan = account.healthDetail?.sesPricingPlan?.current;
  const plan = rawPlan && isSesPricingPlan(rawPlan) ? rawPlan : null;

  const entitlement = plan ? getSesFeatureEntitlement(plan, "vdm") : null;

  let description: string;
  if (!entitlement) {
    description =
      "Could not read your SES plan. VDM is included on Essentials, Pro and Enterprise and billed as an add-on on à la carte pricing.";
  } else if (entitlement.status === "included") {
    const planLabel = plan ? SES_PLAN_RATES[plan].label : "";
    description = vdm.enabled
      ? `VDM is included in your ${planLabel} plan and is switched on.`
      : `VDM is included in your ${planLabel} plan and is switched off.`;
  } else if (entitlement.status === "addon") {
    description = `VDM is billed as an add-on on your plan (${entitlement.price}).`;
  } else {
    description = `VDM is not available on your plan: ${entitlement.reason}`;
  }

  const showEnableCommand = entitlement?.status === "included" && !vdm.enabled;
  const badgeVariant = vdm.enabled
    ? "success"
    : entitlement?.status === "included"
      ? "warning"
      : "info";

  const recommendations = vdm.recommendations;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Virtual Deliverability Manager</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Badge variant={badgeVariant}>{vdm.enabled ? "On" : "Off"}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {showEnableCommand && (
          <code className="block rounded bg-muted px-2 py-1 font-mono text-xs">
            wraps email vdm --enable --region {account.region}
          </code>
        )}

        {recommendations.status === "ok" &&
          recommendations.open.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No open recommendations.
            </p>
          )}

        {recommendations.status === "ok" && recommendations.open.length > 0 && (
          <div className="space-y-2">
            <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
              {recommendations.open.map((rec) => (
                <li key={`${rec.type}-${rec.resourceArn ?? "account"}`}>
                  <span className="font-medium text-foreground">
                    {rec.type}
                  </span>
                  {rec.impact && ` (${rec.impact} impact)`} — {rec.description}
                </li>
              ))}
            </ul>
            {recommendations.truncated && (
              <p className="text-muted-foreground text-xs">
                Showing the 20 highest-impact open recommendations.
              </p>
            )}
          </div>
        )}

        {recommendations.status === "permission_missing" && (
          <p className="text-muted-foreground text-sm">
            Wraps can&apos;t read VDM recommendations: this account&apos;s
            wraps-console-access-role is missing ses:ListRecommendations.{" "}
            <a className="underline" href="#iam-role">
              Update the IAM role
            </a>
            .
          </p>
        )}

        {recommendations.status === "unavailable" && (
          <p className="text-muted-foreground text-sm">
            VDM recommendations couldn&apos;t be read on the last check.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
