"use client";

import { Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const currentPlan = {
  name: "Open Source & Free",
  description:
    "Deploy production-ready email infrastructure to your AWS account",
  features: [
    "One-command infrastructure deployment",
    "TypeScript SDK (@wraps.dev/email)",
    "Local console dashboard",
    "All AWS SES features (sending, tracking, analytics)",
    "Event tracking via EventBridge & DynamoDB",
    "Bounce & complaint handling",
    "Real-time email analytics",
    "Template management",
    "Domain verification tools",
    "Community support on GitHub",
    "Forever free, no credit card required",
  ],
};

const comingSoonFeatures = [
  {
    title: "Hosted Dashboard",
    description:
      "Access your email analytics from anywhere without running the local console",
    features: [
      "Cloud-hosted web interface",
      "Team collaboration",
      "Shared access across devices",
    ],
  },
  {
    title: "Advanced Features",
    description:
      "Email templates, A/B testing, and advanced analytics for growing teams",
    features: ["Template library", "A/B testing", "Advanced reporting"],
  },
];

export function PricingSection() {
  return (
    <section className="bg-muted/40 py-24 sm:py-32" id="pricing">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge className="mb-4" variant="outline">
            Pricing
          </Badge>
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            Free & Open Source
          </h2>
          <p className="text-lg text-muted-foreground">
            Deploy production-ready email infrastructure to your AWS account. No
            subscriptions, no per-email fees. You only pay AWS directly for what
            you use.
          </p>
        </div>

        {/* Current Free Offering */}
        <div className="mx-auto mb-16 max-w-3xl">
          <Card className="border-2 shadow-lg">
            <CardContent className="p-8 md:p-12">
              <div className="mb-8 text-center">
                <h3 className="mb-2 font-bold text-2xl">{currentPlan.name}</h3>
                <p className="mb-6 text-muted-foreground">
                  {currentPlan.description}
                </p>
                <div className="mb-6">
                  <div className="mb-1 font-bold text-5xl">$0</div>
                  <div className="text-muted-foreground">Forever free</div>
                </div>
                <Button asChild className="cursor-pointer" size="lg">
                  <a href="/docs/quickstart">Get Started Now</a>
                </Button>
              </div>

              <div className="border-t pt-8">
                <h4 className="mb-4 font-semibold">Everything you need:</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {currentPlan.features.map((feature, index) => (
                    <div className="flex items-start gap-3" key={index}>
                      <Check
                        className="mt-0.5 size-5 shrink-0 text-primary"
                        strokeWidth={2.5}
                      />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coming Soon Section */}
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <Badge className="mb-3" variant="secondary">
              <Sparkles className="mr-1 h-3 w-3" />
              Coming Soon
            </Badge>
            <h3 className="mb-2 font-bold text-2xl">Hosted Options</h3>
            <p className="text-muted-foreground">
              Optional paid plans for teams who want cloud-hosted dashboards and
              advanced features
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {comingSoonFeatures.map((feature, index) => (
              <Card className="border-dashed opacity-75" key={index}>
                <CardContent className="p-6">
                  <h4 className="mb-2 font-semibold text-lg">
                    {feature.title}
                  </h4>
                  <p className="mb-4 text-muted-foreground text-sm">
                    {feature.description}
                  </p>
                  <ul className="space-y-2">
                    {feature.features.map((item, itemIndex) => (
                      <li
                        className="flex items-center gap-2 text-sm"
                        key={itemIndex}
                      >
                        <Check className="size-4 text-muted-foreground" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* AWS Cost Note */}
        <div className="mx-auto mt-16 max-w-2xl rounded-lg border bg-muted/50 p-6 text-center">
          <p className="mb-2 font-semibold text-foreground">
            Pay AWS directly for infrastructure
          </p>
          <p className="mb-4 text-muted-foreground text-sm">
            With AWS SES pricing at{" "}
            <strong className="text-foreground">$0.10 per 1,000 emails</strong>,
            most apps pay{" "}
            <strong className="text-foreground">$5-50/month to AWS</strong>{" "}
            directly. You own the infrastructure and have zero vendor lock-in.
            Scale affordably as you grow.
          </p>
          <Button asChild className="cursor-pointer" variant="outline">
            <a href="/calculator">Calculate Your Costs →</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
