"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Progress } from "@wraps/ui/components/ui/progress";
import { Separator } from "@wraps/ui/components/ui/separator";
import { cn } from "@wraps/ui/lib/utils";
import {
  ArrowRight,
  Clock,
  DollarSign,
  Gauge,
  Globe,
  Network,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import {
  account,
  bounceStatus,
  complaintStatus,
  complianceChecklist,
  costs,
  domains,
  reputation,
} from "../lib/sample-data";
import { StatusBadge } from "./status-badge";

function currency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 100 ? 2 : 0,
  });
}

export function DeliverabilityOverview({ orgSlug }: { orgSlug: string }) {
  const worstReputation =
    bounceStatus(reputation.bounceRate) === "review" ||
    complaintStatus(reputation.complaintRate) === "review"
      ? "review"
      : "healthy";
  const quotaPct = Math.round(
    (account.sentLast24Hours / account.max24HourSend) * 100
  );
  const domainFailing = domains.filter((d) => d.dmarc === "fail").length;
  const complianceFail = complianceChecklist.filter((c) => !c.pass).length;
  const monthlyIpCost = costs.dedicatedIps * costs.perIpMonthly;
  const emailCost = costs.emailsSent * costs.perEmail;
  const dataCost = costs.dataProcessedGb * costs.perGb;

  const base = `/${orgSlug}/deliverability`;

  return (
    <div className="space-y-6">
      {/* Active alerts strip */}
      <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-warning"
          />
          <div>
            <p className="font-medium text-sm">
              2 items need attention before they become account risks
            </p>
            <p className="text-muted-foreground text-sm">
              Bounce rate is trending toward the AWS review line, and{" "}
              <span className="font-mono">mail.acme.com</span> has a DMARC
              failure from DNS drift.
            </p>
          </div>
        </div>
      </div>

      {/* Rollup cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RollupCard
          href={`${base}/reputation`}
          icon={<Gauge className="size-5" />}
          title="Account reputation"
        >
          <div className="flex items-center justify-between">
            <StatusBadge status={worstReputation} />
            <span className="text-muted-foreground text-xs">
              {account.region}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Bounce rate</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {reputation.bounceRate}%{" "}
                <span className="font-normal text-muted-foreground text-xs">
                  / 5% review
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Complaint rate</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {reputation.complaintRate}%{" "}
                <span className="font-normal text-muted-foreground text-xs">
                  / 0.1%
                </span>
              </dd>
            </div>
          </dl>
        </RollupCard>

        <RollupCard
          href={`${base}/production-access`}
          icon={<ShieldCheck className="size-5" />}
          title="Production access"
        >
          <StatusBadge
            label={account.inSandbox ? "In sandbox" : "Production enabled"}
            status={account.inSandbox ? "review" : "healthy"}
          />
          <p className="mt-3 text-muted-foreground text-sm">
            {account.inSandbox
              ? "Limited to verified recipients. Guided flow ready to request access."
              : "Full sending enabled. Sending to any recipient is allowed."}
          </p>
        </RollupCard>

        <RollupCard
          href={`${base}/production-access`}
          icon={<Clock className="size-5" />}
          title="Quota headroom"
        >
          <div className="flex items-baseline justify-between">
            <span className="font-mono font-semibold text-sm tabular-nums">
              {account.sentLast24Hours.toLocaleString()}
            </span>
            <span className="text-muted-foreground text-xs">
              / {account.max24HourSend.toLocaleString()} per 24h
            </span>
          </div>
          <Progress
            className="mt-3"
            indicatorClassName={cn(quotaPct >= 80 ? "bg-warning" : "bg-brand")}
            value={quotaPct}
          />
          <p className="mt-2 text-muted-foreground text-xs">
            {100 - quotaPct}% headroom · peak {account.peakSendRate}/
            {account.maxSendRate} msg/s
          </p>
        </RollupCard>

        <RollupCard
          href={`${base}/reputation`}
          icon={<Globe className="size-5" />}
          title="Domain authentication"
        >
          <div className="flex items-center justify-between">
            <StatusBadge
              label={domainFailing ? `${domainFailing} failing` : "All aligned"}
              status={domainFailing ? "review" : "healthy"}
            />
            <span className="text-muted-foreground text-xs">
              {domains.length} domains
            </span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {domains.map((d) => (
              <li className="flex items-center justify-between" key={d.domain}>
                <span className="truncate font-mono text-xs">{d.domain}</span>
                <span
                  className={cn(
                    "text-xs",
                    d.dmarc === "pass" ? "text-success" : "text-destructive"
                  )}
                >
                  DMARC {d.dmarc}
                </span>
              </li>
            ))}
          </ul>
        </RollupCard>

        <RollupCard
          href={`${base}/reputation`}
          icon={<ShieldCheck className="size-5" />}
          title="Bulk-sender compliance"
        >
          <StatusBadge
            label={
              complianceFail
                ? `${complianceFail} of ${complianceChecklist.length} failing`
                : "Fully compliant"
            }
            status={complianceFail ? "review" : "healthy"}
          />
          <p className="mt-3 text-muted-foreground text-sm">
            Gmail &amp; Yahoo 2024 bulk-sender rules. One-click unsubscribe,
            DMARC enforcement, and spam-rate ceiling tracked automatically.
          </p>
        </RollupCard>

        <RollupCard
          href={`${base}/ip-pools`}
          icon={<Network className="size-5" />}
          title="IP pools"
        >
          <div className="flex items-center justify-between">
            <StatusBadge label="1 warming" status="review" />
            <span className="text-muted-foreground text-xs">
              {costs.dedicatedIps} dedicated IPs
            </span>
          </div>
          <p className="mt-3 text-muted-foreground text-sm">
            Transactional and marketing traffic isolated on separate pools so a
            marketing spike can&apos;t poison password-reset delivery.
          </p>
        </RollupCard>
      </div>

      {/* Cost transparency — the ownership promise made concrete */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="size-4 text-brand" />
            SES cost transparency
          </CardTitle>
          <CardDescription>
            Real AWS pricing, billed to your own account — no per-email markup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <CostStat
              label={`${(costs.emailsSent / 1_000_000).toFixed(2)}M emails`}
              sub="$0.10 / 1,000"
              value={currency(emailCost)}
            />
            <CostStat
              label={`${costs.dedicatedIps} dedicated IPs`}
              sub="$24.95 / IP / mo"
              value={currency(monthlyIpCost)}
            />
            <CostStat
              label={`${costs.dataProcessedGb} GB tracking`}
              sub="$0.12 / GB"
              value={currency(dataCost)}
            />
            <CostStat
              highlight
              label="Est. this month"
              sub="all-in, at cost"
              value={currency(emailCost + monthlyIpCost + dataCost)}
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function RollupCard({
  href,
  icon,
  title,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="group relative transition-colors hover:border-brand/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">{icon}</span>
            {title}
          </span>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {children}
        <Link className="absolute inset-0" href={href}>
          <span className="sr-only">Open {title}</span>
        </Link>
      </CardContent>
    </Card>
  );
}

function CostStat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        highlight && "border-brand/40 bg-brand/5"
      )}
    >
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-mono font-semibold text-lg tabular-nums">
        {value}
      </dd>
      <Separator className="my-2" />
      <span className="text-muted-foreground text-xs">{sub}</span>
    </div>
  );
}
