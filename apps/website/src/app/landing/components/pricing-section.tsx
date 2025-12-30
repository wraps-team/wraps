"use client";

import { Check, Sparkles, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionWrapper } from "./section-card";

const plans = [
  {
    id: "cli",
    name: "CLI & SDK",
    price: "$0",
    regularPrice: null,
    period: "forever",
    description: "Deploy and send emails with the command line",
    highlight: false,
    earlyAdopter: false,
    cta: "Get Started",
    ctaLink: "/docs/quickstart",
    features: [
      "One-command infrastructure deployment",
      "TypeScript SDK (@wraps.dev/email)",
      "Local console dashboard",
      "Email analytics & history",
      "Event tracking via EventBridge & DynamoDB",
      "Bounce & complaint handling",
      "Domain verification tools",
      "Community support on GitHub",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$10",
    regularPrice: "$19",
    period: "/month",
    description: "Transactional email + simple broadcasts",
    highlight: false,
    earlyAdopter: true,
    cta: "Subscribe",
    ctaLink: "https://app.wraps.dev/auth?mode=signup&plan=starter",
    features: [
      "5,000 contacts",
      "Transactional + batch sending",
      "Hosted dashboard at wraps.dev",
      "Unlimited templates",
      "50 AI generations/month",
      "1 AWS account",
      "Email support (48hr response)",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$30",
    regularPrice: "$49",
    period: "/month",
    description: "Add audience management",
    highlight: true,
    popular: true,
    earlyAdopter: true,
    cta: "Subscribe",
    ctaLink: "https://app.wraps.dev/auth?mode=signup&plan=pro",
    features: [
      "25,000 contacts",
      "Everything in Starter",
      "Topics (subscription management)",
      "Segments (property-based targeting)",
      "Campaigns (scheduled, targeted)",
      "Preference center",
      "250 AI generations/month",
      "3 AWS accounts",
      "Priority support (24hr)",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: "$149",
    regularPrice: null,
    period: "/month",
    description: "Add automation & behavioral targeting",
    highlight: false,
    earlyAdopter: false,
    comingSoon: true,
    cta: "Coming Soon",
    ctaLink: null,
    features: [
      "100,000 contacts",
      "Everything in Pro",
      "Workflows (visual automation)",
      "Event tracking (behavioral triggers)",
      "Advanced segments (event-based)",
      "Multi-tenant orchestration",
      "1,000 AI generations/month",
      "Unlimited AWS accounts",
      "Dedicated support",
    ],
  },
];

export function PricingSection() {
  return (
    <SectionWrapper
      badge="Pricing"
      description="Use the CLI and SDK free forever. Add the hosted dashboard starting at $10/month."
      id="pricing"
      title="Simple, Transparent Pricing"
    >
      {/* Pricing Cards */}
      <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <div
            className={`relative overflow-hidden rounded-2xl border bg-background ${plan.highlight ? "border-2 border-orange-500" : ""}`}
            key={plan.name}
          >
            {/* Early Adopter badge */}
            {plan.earlyAdopter && (
              <div className="absolute left-4 top-4">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2 py-1 text-white text-xs font-medium">
                  Early Adopter
                </span>
              </div>
            )}

            {/* Popular badge */}
            {plan.popular && (
              <div className="absolute right-4 top-4">
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-1 text-white text-xs font-medium">
                  <Sparkles className="h-3 w-3" />
                  Popular
                </span>
              </div>
            )}

            <div
              className={`p-6 ${plan.earlyAdopter || plan.popular ? "pt-12" : ""}`}
            >
              <div className="mb-4">
                <div className="mb-2 flex items-center gap-2">
                  {plan.id === "cli" && (
                    <Terminal className="h-5 w-5 text-muted-foreground" />
                  )}
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  {plan.description}
                </p>
              </div>

              <div className="mb-4">
                <span className="font-bold text-3xl">{plan.price}</span>
                {plan.regularPrice && (
                  <span className="ml-2 text-muted-foreground text-lg line-through">
                    {plan.regularPrice}
                  </span>
                )}
                <span className="text-muted-foreground">{plan.period}</span>
              </div>

              {plan.ctaLink ? (
                <Button
                  asChild
                  className={`mb-6 w-full cursor-pointer ${plan.highlight ? "bg-orange-500 hover:bg-orange-600" : ""}`}
                  size="default"
                  variant={plan.highlight ? "default" : "outline"}
                >
                  <a href={plan.ctaLink}>{plan.cta}</a>
                </Button>
              ) : (
                <Button
                  className="mb-6 w-full cursor-not-allowed opacity-60"
                  disabled
                  size="default"
                  variant="outline"
                >
                  {plan.cta}
                </Button>
              )}

              <ul className="space-y-2">
                {plan.features.map((feature) => (
                  <li className="flex items-start gap-2" key={feature}>
                    <Check
                      className={`mt-0.5 size-4 shrink-0 ${plan.highlight ? "text-orange-500" : "text-muted-foreground"}`}
                      strokeWidth={2.5}
                    />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* Early Adopter note */}
      <div className="mb-8 rounded-xl border border-green-200 bg-green-50 p-4 text-center dark:border-green-900 dark:bg-green-950">
        <p className="font-medium text-green-800 text-sm dark:text-green-200">
          Early Adopter Pricing - Lock in these rates before they increase.
        </p>
        <p className="mt-1 text-green-700 text-xs dark:text-green-300">
          Prices will rise to $19/mo and $49/mo when we add SMS features. Your
          rate stays locked forever.
        </p>
      </div>

      {/* Scale tier note */}
      <p className="mb-8 text-center text-muted-foreground text-sm">
        Need more?{" "}
        <strong className="text-foreground">Scale ($299/mo)</strong> for 500K
        contacts with custom retention and priority SLA.{" "}
        <a
          className="text-primary hover:underline"
          href="mailto:support@wraps.dev"
        >
          Contact us
        </a>
      </p>

      {/* AWS Cost Note */}
      <div className="rounded-xl border bg-muted/30 p-6 text-center">
        <p className="mb-2 font-semibold text-foreground">
          AWS costs are separate
        </p>
        <p className="mb-4 text-muted-foreground text-sm">
          You pay AWS directly for email sending at{" "}
          <strong className="text-foreground">$0.10 per 1,000 emails</strong>{" "}
          plus infrastructure (~$2-5/mo). You own everything, zero vendor
          lock-in.
        </p>
        <Button asChild className="cursor-pointer" variant="outline">
          <a href="/calculator">Calculate Your Costs</a>
        </Button>
      </div>
    </SectionWrapper>
  );
}
