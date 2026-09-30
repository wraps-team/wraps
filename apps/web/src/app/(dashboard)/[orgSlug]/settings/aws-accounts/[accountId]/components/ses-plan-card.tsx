"use client";

import {
  getSesFeatureEntitlement,
  isSesPricingPlan,
  planComparison,
  SES_PLAN_FEATURE_LABELS,
  SES_PLAN_FEATURES,
  SES_PLAN_RATES,
  type SesPlanComparison,
  type SesPricingPlan,
} from "@wraps/core/ses-plans";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import { CheckCircle2, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ClientAccount } from "../lib/client-account";

type SesPlanCardProps = {
  account: Pick<ClientAccount, "region" | "healthDetail" | "features">;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatMoney(amount: number): string {
  return currencyFormatter.format(amount);
}

/** `+$12.00` / `-$12.00` for a non-zero delta, an em dash otherwise. */
function formatDelta(delta: number | undefined): string {
  if (!delta) {
    return "—";
  }
  return `${delta > 0 ? "+" : ""}${formatMoney(delta)}`;
}

function PlanCostTable({
  comparison,
  sentLast24Hours,
}: {
  comparison: SesPlanComparison;
  sentLast24Hours: number;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SES plan</TableHead>
          <TableHead>Monthly base</TableHead>
          <TableHead>Estimated monthly cost</TableHead>
          <TableHead>vs. current</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {comparison.rows.map((row) => (
          <TableRow key={row.plan}>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                {row.label}
                {row.isCurrent && <Badge variant="info">Current</Badge>}
                {row.isCheapest && (
                  <Badge variant="success">Cheapest at this volume</Badge>
                )}
              </div>
            </TableCell>
            <TableCell>{formatMoney(row.monthlyBase)}</TableCell>
            <TableCell>{formatMoney(row.monthlyCost)}</TableCell>
            <TableCell>{formatDelta(row.deltaVsCurrent)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableCaption>
        Estimated from {sentLast24Hours} emails sent in the last 24 hours × 30.
        Compares sending cost only.
      </TableCaption>
    </Table>
  );
}

function PlanRateTable({ current }: { current: SesPricingPlan }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SES plan</TableHead>
          <TableHead>Monthly base</TableHead>
          <TableHead>Rate per 1,000 emails</TableHead>
          <TableHead>vs. current</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.entries(SES_PLAN_RATES).map(([plan, rate]) => (
          <TableRow key={plan}>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                {rate.label}
                {plan === current && <Badge variant="info">Current</Badge>}
              </div>
            </TableCell>
            <TableCell>{formatMoney(rate.monthlyBase)}</TableCell>
            <TableCell>{formatMoney(rate.tiers[0].per1K)}</TableCell>
            <TableCell>—</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableCaption>
        No sends in the last 24 hours. Rates shown per 1,000 emails.
      </TableCaption>
    </Table>
  );
}

function SwitchToAlaCarteHint({
  annualSavings,
  current,
  region,
}: {
  annualSavings: number;
  current: SesPricingPlan;
  region: string;
}) {
  const [copied, setCopied] = useState(false);
  const command = `wraps email plan --region ${region} --set NONE`;

  const copyCommand = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/50 p-3 text-sm">
      <p>
        À la carte is {formatMoney(annualSavings)} a year cheaper at this
        volume, counting sending cost only. Plans bundle features too, so check
        what you use first.
      </p>
      {current === "ESSENTIALS" && (
        <p className="text-muted-foreground">
          If AWS put this account on Essentials by default (new accounts, and
          accounts with no SES activity since June 1, 2025), switching to à la
          carte takes effect immediately. Otherwise it applies at the start of
          your next billing cycle.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
          {command}
        </code>
        <Button onClick={copyCommand} size="sm" type="button" variant="outline">
          {copied ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <p className="text-muted-foreground">
        Run it with your own AWS credentials. Wraps&apos; read-only role cannot
        change your plan.
      </p>
    </div>
  );
}

function IncludedFeaturesList({
  current,
  dedicatedIpCount,
}: {
  current: SesPricingPlan;
  dedicatedIpCount: number | undefined;
}) {
  const includedFeatures = SES_PLAN_FEATURES.map((feature) => ({
    feature,
    entitlement: getSesFeatureEntitlement(current, feature),
  })).filter(({ entitlement }) => entitlement.status === "included");

  if (includedFeatures.length === 0) {
    return null;
  }

  const showDedicatedIpCount =
    getSesFeatureEntitlement(current, "managedDedicatedIps").status ===
      "included" && typeof dedicatedIpCount === "number";

  return (
    <div className="space-y-2">
      <h4 className="font-medium text-sm">Included in this plan</h4>
      <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
        {includedFeatures.map(({ feature, entitlement }) => (
          <li key={feature}>
            {SES_PLAN_FEATURE_LABELS[feature]}
            {entitlement.status === "included" && entitlement.allowance && (
              <> — {entitlement.allowance}</>
            )}
          </li>
        ))}
        {showDedicatedIpCount && (
          <li>Dedicated IPs in this Region: {dedicatedIpCount}</li>
        )}
      </ul>
      <p className="text-muted-foreground text-xs">
        AWS turns none of these on when you choose a plan. Each one is enabled
        separately.
      </p>
    </div>
  );
}

export function SesPlanCard({ account }: SesPlanCardProps) {
  const sesPricingPlan = account.healthDetail?.sesPricingPlan;

  // Case 1: not checked yet.
  if (!account.healthDetail || sesPricingPlan === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AWS SES pricing plan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Not checked yet. Wraps reads the plan during its hourly health
            check.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { current, next } = sesPricingPlan;

  // Case 2: no plan reported, or a value Wraps doesn't recognise.
  if (current === null || !isSesPricingPlan(current)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AWS SES pricing plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground text-sm">
            AWS reported no SES pricing plan for {account.region}.
          </p>
          {current !== null && (
            <p className="text-muted-foreground text-sm">
              AWS reported &quot;{current}&quot;, which Wraps doesn&apos;t
              recognise yet.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const currentLabel = SES_PLAN_RATES[current].label;
  const nextPlan: SesPricingPlan | null =
    typeof next === "string" && isSesPricingPlan(next) ? next : null;

  const sent = account.healthDetail.sentLast24Hours;
  const hasVolume = typeof sent === "number" && sent > 0;
  const comparison = hasVolume
    ? planComparison((sent as number) * 30, current)
    : null;

  const showSwitchHint =
    comparison !== null &&
    comparison.cheapestPlan !== current &&
    comparison.cheapestPlan === "NONE";

  const dedicatedIpCount = account.features?.email?.dedicatedIpCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AWS SES pricing plan</CardTitle>
        <CardDescription>
          {account.region}. AWS sets the plan per account, per Region.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{currentLabel}</Badge>
          {nextPlan && nextPlan !== current && (
            <span className="text-muted-foreground text-sm">
              Changes to {SES_PLAN_RATES[nextPlan].label} at the start of the
              next billing cycle.
            </span>
          )}
        </div>

        {comparison ? (
          <PlanCostTable
            comparison={comparison}
            sentLast24Hours={sent as number}
          />
        ) : (
          <PlanRateTable current={current} />
        )}

        {showSwitchHint && comparison && (
          <SwitchToAlaCarteHint
            annualSavings={comparison.annualSavings ?? 0}
            current={current}
            region={account.region}
          />
        )}

        <IncludedFeaturesList
          current={current}
          dedicatedIpCount={dedicatedIpCount}
        />
      </CardContent>
    </Card>
  );
}
