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
  Check,
  Copy,
  ExternalLink,
  Gauge,
  Info,
  Lock,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { account } from "../lib/sample-data";
import { ChecklistItem } from "./checklist-item";

const READINESS = [
  {
    label: "Domain verified with DKIM signing",
    detail: "acme.com — 3 CNAME records confirmed",
    pass: true,
  },
  {
    label: "Bounce & complaint rates healthy",
    detail: "3.1% bounce, 0.04% complaint — below review lines",
    pass: true,
  },
  {
    label: "One-click List-Unsubscribe configured",
    detail: "RFC 8058 headers on all marketing sends",
    pass: true,
  },
  {
    label: "Suppression list enabled",
    detail: "Account-level suppression active for bounces & complaints",
    pass: true,
  },
];

const PREFILLED_REQUEST = `Mail type: Transactional and marketing
Website URL: https://acme.com
Use case description:
Acme sends account-related transactional email (password resets,
receipts, verification) and opt-in marketing to customers who have
explicitly subscribed. All recipients are double opt-in. We honor
one-click unsubscribe (RFC 8058) and maintain a suppression list for
bounces and complaints.

How you send: Amazon SES via the Wraps console in our own AWS account
(us-east-1), using dedicated IPs with configured warmup.
Bounce/complaint handling: Automated processing via SNS notifications;
addresses are suppressed immediately.
Expected volume: up to 200,000 messages/day.
Requested max send rate: 100 messages/second.`;

export function ProductionAccessConsole() {
  const [copied, setCopied] = useState(false);
  const quotaPct = Math.round(
    (account.sentLast24Hours / account.max24HourSend) * 100
  );
  const ratePct = Math.round((account.peakSendRate / account.maxSendRate) * 100);
  const allReady = READINESS.every((r) => r.pass);

  const copyRequest = async () => {
    try {
      await navigator.clipboard.writeText(PREFILLED_REQUEST);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quota utilization gauges */}
      <div className="grid gap-4 md:grid-cols-3">
        <QuotaCard
          caption={`${100 - quotaPct}% headroom remaining`}
          icon={<Gauge className="size-4 text-muted-foreground" />}
          pct={quotaPct}
          title="24-hour sending quota"
          value={`${account.sentLast24Hours.toLocaleString()} / ${account.max24HourSend.toLocaleString()}`}
        />
        <QuotaCard
          caption={`Peak ${account.peakSendRate} of ${account.maxSendRate} msg/s`}
          icon={<Zap className="size-4 text-muted-foreground" />}
          pct={ratePct}
          title="Max send rate"
          value={`${account.maxSendRate} msg/s`}
        />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Access status</CardTitle>
            <CardDescription>SES account mode</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border p-3",
                account.inSandbox
                  ? "border-warning/40 bg-warning/5"
                  : "border-success/30 bg-success/5"
              )}
            >
              <span className="font-medium text-sm">
                {account.inSandbox ? "Sandbox" : "Production enabled"}
              </span>
            </div>
            <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
              {account.inSandbox
                ? "Limited to verified recipients until AWS grants production access."
                : "Sending to any recipient is allowed. Request a higher quota below when you need more headroom."}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Guided flow */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Guided quota-increase request
          </CardTitle>
          <CardDescription>
            The scary AWS support ticket, pre-filled from your account. We
            prepare everything — you review and submit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Cannot-grant disclaimer */}
          <div className="flex items-start gap-3 rounded-lg border border-info/40 bg-info/5 p-3">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
            <p className="text-sm">
              <span className="font-medium">Only AWS can approve this.</span>{" "}
              Wraps cannot grant production access or raise your quota — we
              validate your readiness and pre-fill the request so approval is as
              fast and likely as possible.
            </p>
          </div>

          {/* Step 1: readiness */}
          <div>
            <div className="mb-1 flex items-center gap-2">
              <StepBadge n={1} />
              <h3 className="font-medium text-sm">Readiness checks</h3>
              {allReady ? (
                <span className="ml-auto flex items-center gap-1 text-success text-xs">
                  <Check className="size-3.5" /> All passing
                </span>
              ) : null}
            </div>
            <ul className="divide-y rounded-lg border px-3">
              {READINESS.map((item) => (
                <ChecklistItem
                  detail={item.detail}
                  key={item.label}
                  label={item.label}
                  pass={item.pass}
                />
              ))}
            </ul>
          </div>

          {/* Step 2: prefilled request */}
          <div>
            <div className="mb-1 flex items-center gap-2">
              <StepBadge n={2} />
              <h3 className="font-medium text-sm">Review the pre-filled case</h3>
              <Button
                className="ml-auto h-7 px-2 text-xs"
                onClick={copyRequest}
                size="sm"
                variant="outline"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-success" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" /> Copy request
                  </>
                )}
              </Button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-muted-foreground text-xs leading-relaxed">
              {PREFILLED_REQUEST}
            </pre>
          </div>

          {/* Step 3: submit */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <StepBadge n={3} />
              <h3 className="font-medium text-sm">Submit to AWS</h3>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                asChild
                className="bg-brand text-brand-foreground hover:bg-brand/90"
                disabled={!allReady}
              >
                <a
                  href="https://console.aws.amazon.com/support/home#/case/create"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="size-4" />
                  Open AWS support case
                </a>
              </Button>
              <Button variant="outline">
                <Info className="size-4" />
                What AWS reviews
              </Button>
            </div>
            <p className="mt-2 text-muted-foreground text-xs">
              Typical AWS turnaround is under 24 hours when readiness checks
              pass.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuotaCard({
  title,
  value,
  pct,
  caption,
  icon,
}: {
  title: string;
  value: string;
  pct: number;
  caption: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-mono font-semibold text-xl tabular-nums">{value}</p>
        <Progress
          aria-label={`${pct}% utilized`}
          indicatorClassName={cn(pct >= 80 ? "bg-warning" : "bg-brand")}
          value={pct}
        />
        <p className="text-muted-foreground text-xs">
          {pct}% utilized · {caption}
        </p>
      </CardContent>
    </Card>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex size-5 items-center justify-center rounded-full bg-brand font-mono font-semibold text-[11px] text-brand-foreground">
      {n}
    </span>
  );
}
