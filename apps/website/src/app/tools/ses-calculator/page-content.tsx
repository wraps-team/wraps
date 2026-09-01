"use client";

import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wraps/ui/components/ui/collapsible";
import { Input } from "@wraps/ui/components/ui/input";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Switch } from "@wraps/ui/components/ui/switch";
import {
  ArrowRight,
  ChevronDown,
  DollarSign,
  Info,
  Mail,
  Minus,
  Plus,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { Suspense } from "react";
import { BillingToggle } from "@/app/landing/components/billing-toggle";
import type { BillingInterval } from "@/config/pricing";
import {
  getCtaLink,
  getDisplayPrice,
  PRICING_TIERS,
  PUBLIC_TIER_IDS,
  TIER_LIMITS,
} from "@/config/pricing";
import type { RetentionPeriod } from "@/lib/ses-cost";
import {
  AWS_FREE_TIER,
  AWS_INFRA_PRICING,
  calculateStorageGrowth,
  estimateCost,
  RETENTION_PERIODS,
  recommendSesPlan,
  SES_PLAN_IDS,
  SES_PLANS,
} from "@/lib/ses-cost";
import { cn } from "@/lib/utils";

const BILLING_INTERVALS = ["monthly", "annual"] as const;

const VOLUME_PRESETS = [
  { label: "Side Project", emails: 1000, events: 500, tier: "free" as const },
  {
    label: "Startup",
    emails: 50_000,
    events: 25_000,
    tier: "pro" as const,
  },
  {
    label: "Scale",
    emails: 1_000_000,
    events: 500_000,
    tier: "business" as const,
  },
];

/** Returns a human-friendly step size based on the current value. */
function getStepSize(value: number): number {
  if (value < 1000) {
    return 100;
  }
  if (value < 10_000) {
    return 1000;
  }
  if (value < 100_000) {
    return 5000;
  }
  if (value < 1_000_000) {
    return 50_000;
  }
  return 100_000;
}

const calculatorParsers = {
  emails: parseAsInteger.withDefault(25_000),
  events: parseAsInteger.withDefault(5000),
  tier: parseAsStringLiteral(PUBLIC_TIER_IDS).withDefault("free"),
  billing: parseAsStringLiteral(BILLING_INTERVALS).withDefault("monthly"),
  sesPlan: parseAsStringLiteral(SES_PLAN_IDS).withDefault("alacarte"),
  tracking: parseAsBoolean.withDefault(true),
  eventbridge: parseAsBoolean.withDefault(true),
  dynamodb: parseAsBoolean.withDefault(true),
  retention: parseAsStringLiteral(RETENTION_PERIODS).withDefault("90days"),
  eventTypes: parseAsInteger.withDefault(8),
  dedicatedIp: parseAsBoolean.withDefault(false),
  customDomain: parseAsBoolean.withDefault(false),
  https: parseAsBoolean.withDefault(false),
  waf: parseAsBoolean.withDefault(false),
};

function SESCalculatorInner() {
  const [state, setState] = useQueryStates(calculatorParsers, {
    history: "replace",
  });

  const emailsPerMonth = state.emails;
  const eventsPerMonth = state.events;
  const selectedTier = state.tier;
  const billingInterval = state.billing as BillingInterval;
  const eventTrackingEnabled = state.tracking;
  const eventBridgeEnabled = state.eventbridge;
  const dynamoDBEnabled = state.dynamodb;
  const retention = state.retention;
  const numEventTypes = state.eventTypes;
  const dedicatedIp = state.dedicatedIp;
  const customDomain = state.customDomain;
  const httpsTracking = state.https;
  const wafEnabled = state.waf;
  const sesPlan = state.sesPlan;

  const activePreset = VOLUME_PRESETS.find(
    (p) =>
      p.emails === emailsPerMonth &&
      p.events === eventsPerMonth &&
      p.tier === selectedTier
  );

  // All cost math lives in @/lib/ses-cost so the calculator, the
  // /api/pricing/estimate endpoint, and pricing.md can never disagree.
  const estimate = estimateCost({
    emailsPerMonth,
    eventsPerMonth,
    tier: selectedTier,
    billing: billingInterval,
    sesPlan,
    eventTracking: eventTrackingEnabled,
    eventBridge: eventBridgeEnabled,
    dynamodb: dynamoDBEnabled,
    retention,
    eventTypes: numEventTypes,
    dedicatedIp,
    httpsTracking,
    waf: wafEnabled,
  });

  const planRecommendation = recommendSesPlan(
    emailsPerMonth,
    sesPlan,
    dedicatedIp
  );

  const wrapsCosts = {
    ...estimate.wraps,
    totalWrapsCost: estimate.wraps.total,
  };
  const breakdown = estimate.aws.lines;
  const total = breakdown.reduce((sum, line) => sum + line.cost, 0);

  // Calculate storage growth for display
  const storageGrowth = dynamoDBEnabled
    ? calculateStorageGrowth(emailsPerMonth, retention, numEventTypes)
    : [];

  const costFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formatCost = (cost: number) => {
    if (cost === 0) {
      return costFormatter.format(0);
    }
    if (cost < 0.01) {
      return `< ${costFormatter.format(0.01)}`;
    }
    return costFormatter.format(cost);
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Volume Presets */}
          <div className="space-y-2">
            <Label>Quick Presets</Label>
            <div className="flex flex-wrap gap-2">
              {VOLUME_PRESETS.map((preset) => {
                const isActive = activePreset === preset;
                return (
                  <button
                    aria-pressed={isActive}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/25 text-muted-foreground hover:border-foreground/50 hover:text-foreground"
                    )}
                    key={preset.label}
                    onClick={() =>
                      setState({
                        emails: preset.emails,
                        events: preset.events,
                        tier: preset.tier,
                      })
                    }
                    type="button"
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wraps Plan Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Wraps Plan</Label>
              <BillingToggle
                compact
                onChange={(v) => setState({ billing: v })}
                value={billingInterval}
              />
            </div>
            <fieldset className="grid grid-cols-3 gap-2 border-none p-0 m-0">
              <legend className="sr-only">Wraps plan selection</legend>
              {PRICING_TIERS.map((tier) => {
                const isSelected = selectedTier === tier.id;
                const limits = TIER_LIMITS[tier.id];
                const displayPrice = getDisplayPrice(tier, billingInterval);
                return (
                  <button
                    aria-pressed={isSelected}
                    className={cn(
                      "rounded-lg border-2 p-3 text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                    key={tier.id}
                    onClick={() => {
                      setState({ tier: tier.id });
                    }}
                    type="button"
                  >
                    <div className="font-semibold">{tier.name}</div>
                    <div className="tabular-nums font-bold text-lg">
                      ${displayPrice}
                      <span className="font-normal text-muted-foreground text-sm">
                        /mo
                      </span>
                    </div>
                    <div className="mt-1 text-muted-foreground text-xs">
                      {limits.awsAccountsDisplay} AWS accounts
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {limits.historyDisplay} history
                    </div>
                  </button>
                );
              })}
            </fieldset>
          </div>

          {/* Monthly Custom Events — accepted for backward compatibility,
              does not currently affect the estimate (see lib/ses-cost.ts) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1" htmlFor="events">
              Monthly Custom Events
            </Label>
            <div className="flex items-center gap-1.5">
              <button
                aria-label="Decrease custom events"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                disabled={eventsPerMonth <= 0}
                onClick={() =>
                  setState({
                    events: Math.max(
                      0,
                      eventsPerMonth - getStepSize(eventsPerMonth)
                    ),
                  })
                }
                type="button"
              >
                <Minus aria-hidden="true" className="size-4" />
              </button>
              <div className="relative flex-1">
                <Zap
                  aria-hidden="true"
                  className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground"
                />
                <Input
                  autoComplete="off"
                  className="pl-9 text-center"
                  id="events"
                  inputMode="numeric"
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    setState({
                      events: Math.min(
                        Number.parseInt(raw, 10) || 0,
                        10_000_000
                      ),
                    });
                  }}
                  placeholder="0"
                  value={eventsPerMonth.toLocaleString()}
                />
              </div>
              <button
                aria-label="Increase custom events"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                disabled={eventsPerMonth >= 10_000_000}
                onClick={() =>
                  setState({
                    events: Math.min(
                      10_000_000,
                      eventsPerMonth + getStepSize(eventsPerMonth)
                    ),
                  })
                }
                type="button"
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </div>
            <p className="text-muted-foreground text-sm">
              Behavioral events you send to Wraps (user actions, workflow
              triggers)
            </p>
          </div>

          {/* Email Volume (AWS billing) */}
          <div className="space-y-2">
            <Label htmlFor="emails">Monthly Emails (AWS)</Label>
            <div className="flex items-center gap-1.5">
              <button
                aria-label="Decrease monthly emails"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                disabled={emailsPerMonth <= 0}
                onClick={() =>
                  setState({
                    emails: Math.max(
                      0,
                      emailsPerMonth - getStepSize(emailsPerMonth)
                    ),
                  })
                }
                type="button"
              >
                <Minus aria-hidden="true" className="size-4" />
              </button>
              <div className="relative flex-1">
                <Mail
                  aria-hidden="true"
                  className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground"
                />
                <Input
                  autoComplete="off"
                  className="pl-9 text-center"
                  id="emails"
                  inputMode="numeric"
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    setState({
                      emails: Math.min(
                        Number.parseInt(raw, 10) || 0,
                        10_000_000
                      ),
                    });
                  }}
                  placeholder="0"
                  value={emailsPerMonth.toLocaleString()}
                />
              </div>
              <button
                aria-label="Increase monthly emails"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                disabled={emailsPerMonth >= 10_000_000}
                onClick={() =>
                  setState({
                    emails: Math.min(
                      10_000_000,
                      emailsPerMonth + getStepSize(emailsPerMonth)
                    ),
                  })
                }
                type="button"
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </div>
            <p className="text-muted-foreground text-sm">
              Emails sent via AWS SES
            </p>
          </div>

          {/* SES pricing plan (per AWS account, per Region) */}
          <div className="space-y-2">
            <Label htmlFor="ses-plan">AWS SES Pricing Plan</Label>
            <Select
              onValueChange={(v) =>
                setState({ sesPlan: v as (typeof SES_PLAN_IDS)[number] })
              }
              value={sesPlan}
            >
              <SelectTrigger id="ses-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SES_PLAN_IDS.map((id) => {
                  const plan = SES_PLANS[id];
                  return (
                    <SelectItem key={id} value={id}>
                      {plan.name} —{" "}
                      {plan.monthlyFee > 0 ? `$${plan.monthlyFee}/mo + ` : ""}$
                      {plan.perThousandEmails.toFixed(2)}/1K
                      {plan.defaultForNewAccounts ? " (AWS default)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-sm">
              {SES_PLANS[sesPlan].summary}{" "}
              {sesPlan === "essentials"
                ? "AWS puts every new account on this plan — moving back to à la carte takes effect immediately."
                : "Set per AWS account, per Region."}
            </p>
            {planRecommendation.monthlySavings > 0 && (
              <div className="rounded-lg border border-primary/50 bg-primary/10 p-4">
                <p className="font-semibold text-primary">
                  Switch to {SES_PLANS[planRecommendation.cheapest].name} and
                  save {formatCost(planRecommendation.monthlySavings)}/mo (
                  {formatCost(planRecommendation.annualSavings)}/yr)
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  SES pricing plans are set per AWS account, per Region — moving
                  back to à la carte takes effect immediately.{" "}
                  <Link
                    className="underline underline-offset-2 hover:text-foreground"
                    href="/docs/cli-reference/email"
                  >
                    See how
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>

          {/* Email Event Tracking (SES events, not Wraps custom events) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="event-tracking">Email Event Tracking</Label>
                <p className="text-muted-foreground text-sm">
                  SES delivery events: opens, clicks, bounces (stored in your
                  AWS)
                </p>
              </div>
              <Switch
                checked={eventTrackingEnabled}
                id="event-tracking"
                onCheckedChange={(v) => setState({ tracking: v })}
              />
            </div>

            {eventTrackingEnabled && (
              <div className="ml-4 space-y-4 border-l-2 pl-3 sm:ml-6 sm:pl-4">
                {/* EventBridge */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="eventbridge">Real-time EventBridge</Label>
                    <p className="text-muted-foreground text-sm">
                      Process events in real-time
                    </p>
                  </div>
                  <Switch
                    checked={eventBridgeEnabled}
                    id="eventbridge"
                    onCheckedChange={(v) => setState({ eventbridge: v })}
                  />
                </div>

                {/* DynamoDB History */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="dynamodb">Email History</Label>
                    <p className="text-muted-foreground text-sm">
                      Store events in DynamoDB
                    </p>
                  </div>
                  <Switch
                    checked={dynamoDBEnabled}
                    id="dynamodb"
                    onCheckedChange={(v) => setState({ dynamodb: v })}
                  />
                </div>

                {/* Retention Period */}
                {dynamoDBEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="retention">Retention Period</Label>
                    <Select
                      onValueChange={(value: RetentionPeriod) => {
                        setState({ retention: value });
                      }}
                      value={retention}
                    >
                      <SelectTrigger id="retention">
                        <SelectValue placeholder="Select retention" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7days">7 Days</SelectItem>
                        <SelectItem value="30days">30 Days</SelectItem>
                        <SelectItem value="90days">90 Days</SelectItem>
                        <SelectItem value="1year">1 Year</SelectItem>
                        <SelectItem value="indefinite">
                          Indefinite (2+ years)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Event Types */}
                <div className="space-y-2">
                  <Label htmlFor="event-types">Event Types Tracked</Label>
                  <Select
                    onValueChange={(value) =>
                      setState({
                        eventTypes: Number.parseInt(value, 10),
                      })
                    }
                    value={numEventTypes.toString()}
                  >
                    <SelectTrigger className="w-full" id="event-types">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 (SEND, DELIVERY)</SelectItem>
                      <SelectItem value="4">4 (+ BOUNCE, COMPLAINT)</SelectItem>
                      <SelectItem value="6">6 (+ OPEN, CLICK)</SelectItem>
                      <SelectItem value="8">
                        8 (+ REJECT, RENDERING_FAILURE)
                      </SelectItem>
                      <SelectItem value="10">10 (All Events)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Options */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-sm">Advanced Options</h3>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dedicated-ip">Dedicated IP</Label>
                <p className="text-muted-foreground text-sm">
                  $24.95/month, needs 100k+ emails/day
                </p>
              </div>
              <Switch
                checked={dedicatedIp}
                id="dedicated-ip"
                onCheckedChange={(v) => setState({ dedicatedIp: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="custom-domain">Custom Tracking Domain</Label>
                <p className="text-muted-foreground text-sm">
                  No additional cost (use your DNS)
                </p>
              </div>
              <Switch
                checked={customDomain}
                id="custom-domain"
                onCheckedChange={(v) => setState({ customDomain: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="https-tracking">
                  HTTPS Tracking (CloudFront)
                </Label>
                <p className="text-muted-foreground text-sm">
                  SSL for custom tracking domain
                </p>
              </div>
              <Switch
                checked={httpsTracking}
                id="https-tracking"
                onCheckedChange={(checked) => {
                  setState({
                    https: checked,
                    ...(checked ? {} : { waf: false }),
                  });
                }}
              />
            </div>

            {httpsTracking && (
              <div className="ml-4 flex items-center justify-between border-l-2 pl-3 sm:ml-6 sm:pl-4">
                <div className="space-y-0.5">
                  <Label htmlFor="waf-enabled">WAF Rate Limiting</Label>
                  <p className="text-muted-foreground text-sm">
                    ~$6/mo base + $0.60/M requests
                  </p>
                </div>
                <Switch
                  checked={wafEnabled}
                  id="waf-enabled"
                  onCheckedChange={(v) => setState({ waf: v })}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cost Breakdown Panel */}
      <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
        {/* Total Cost Card */}
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign aria-hidden="true" className="size-5" />
              Estimated Monthly Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <div className="mb-2 tabular-nums font-bold text-4xl sm:text-5xl">
                {formatCost(wrapsCosts.totalWrapsCost + total)}
              </div>
              <div className="text-muted-foreground">Wraps + AWS combined</div>
            </div>

            <div className="space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between font-medium">
                <span>Wraps Platform</span>
                <span className="tabular-nums">
                  {formatCost(wrapsCosts.platformCost)}/mo
                </span>
              </div>
              {wrapsCosts.annualSavings > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span className="ml-4">Annual savings</span>
                  <span className="tabular-nums font-medium">
                    Save ${wrapsCosts.annualSavings}/yr
                  </span>
                </div>
              )}
              <div className="flex justify-between font-medium">
                <span>AWS Infrastructure</span>
                <span className="tabular-nums">{formatCost(total)}/mo</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>Total Monthly Cost</span>
                <span className="tabular-nums">
                  {formatCost(wrapsCosts.totalWrapsCost + total)}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-1 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Custom Events:</span>
                <span className="tabular-nums font-medium">
                  {eventsPerMonth.toLocaleString()}/mo
                </span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Emails Sent:</span>
                <span className="tabular-nums font-bold">
                  {emailsPerMonth.toLocaleString()}/mo
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cost Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between font-medium">
                <span>Wraps Platform</span>
                <span className="tabular-nums">
                  {formatCost(wrapsCosts.platformCost)}/mo
                </span>
              </div>
              <div className="flex justify-between font-medium">
                <span>AWS Infrastructure</span>
                <span className="tabular-nums">{formatCost(total)}/mo</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatCost(wrapsCosts.totalWrapsCost + total)}
                  /mo
                </span>
              </div>
            </div>

            {/* Collapsible AWS service breakdown */}
            <Collapsible className="mt-4">
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors [&[data-state=open]>svg]:rotate-180">
                View AWS breakdown
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition-transform duration-200"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                <div className="space-y-3 pt-3 border-t mt-2">
                  {breakdown.map((item) => (
                    <div
                      className="flex items-start justify-between gap-4 border-b pb-3 last:border-0"
                      key={item.name}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{item.name}</span>
                        {item.details && (
                          <p className="mt-1 text-muted-foreground text-xs">
                            {item.details}
                          </p>
                        )}
                      </div>
                      <span className="tabular-nums font-mono text-sm">
                        {formatCost(item.cost)}
                      </span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* Storage Growth Explanation */}
        {dynamoDBEnabled && storageGrowth.length > 0 && (
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info aria-hidden="true" className="size-5 text-blue-600" />
                Storage Growth Over Time
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Storage costs grow gradually as data accumulates, then plateau
                once retention period fills. Costs shown above reflect{" "}
                <strong>steady-state</strong> (after Month{" "}
                {storageGrowth.length - 1}).
              </p>

              {/* Simple growth visualization */}
              <div className="space-y-2">
                {storageGrowth.slice(0, 5).map((point) => {
                  const isLastMonth = point.month === storageGrowth.length - 1;
                  const storageCost =
                    Math.max(
                      0,
                      point.storageGB - AWS_FREE_TIER.DYNAMODB_STORAGE_GB
                    ) * AWS_INFRA_PRICING.DYNAMODB_STORAGE_PER_GB;

                  return (
                    <div
                      className="flex flex-wrap items-center justify-between gap-x-2 text-sm"
                      key={`month-${point.month}`}
                    >
                      <span className="text-muted-foreground">
                        Month {point.month}
                        {isLastMonth && "+ (steady-state)"}:
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums font-mono">
                          {point.storageGB.toFixed(3)} GB
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          ({formatCost(storageCost)} storage)
                        </span>
                      </div>
                    </div>
                  );
                })}
                {storageGrowth.length > 5 && (
                  <div className="pt-2 text-center text-muted-foreground text-xs">
                    ... continues to Month {storageGrowth.length - 1}{" "}
                    (steady-state)
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* AWS Free Tier Notice */}
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Info
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-green-600"
              />
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-green-900 dark:text-green-100">
                  AWS Free Tier Included
                </p>
                <ul className="space-y-1 text-green-800 dark:text-green-200">
                  <li>• 1M Lambda requests/month</li>
                  <li>• 400K Lambda GB-seconds/month</li>
                  <li>• 1M SQS requests/month</li>
                  <li>• 25 GB DynamoDB storage</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="flex flex-col gap-3">
          <Button asChild className="w-full" size="lg">
            <a
              href={(() => {
                const tier = PRICING_TIERS.find((t) => t.id === selectedTier);
                return tier
                  ? getCtaLink(tier, billingInterval)
                  : `https://app.wraps.dev/auth?mode=signup&plan=${selectedTier}`;
              })()}
            >
              Get Started with{" "}
              {PRICING_TIERS.find((t) => t.id === selectedTier)?.name ??
                "Wraps"}
              <ArrowRight aria-hidden="true" className="ml-2 size-4" />
            </a>
          </Button>
          <Button asChild className="w-full" size="lg" variant="outline">
            <Link href="/docs">Read Documentation</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SESCalculatorPageContent() {
  return (
    <Suspense>
      <SESCalculatorInner />
    </Suspense>
  );
}
