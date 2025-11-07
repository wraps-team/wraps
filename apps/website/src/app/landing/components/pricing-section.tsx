"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const plans = [
  {
    name: "Free",
    description: "Perfect for side projects and learning",
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      "Local console dashboard",
      "All services (Email, SMS, Queues, IoT)",
      "Unlimited team members (local use)",
      "1 AWS account",
      "Community support (GitHub)",
      "Forever free",
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Starter",
    description: "Solo developers and small startups",
    monthlyPrice: 10,
    yearlyPrice: 8.33,
    features: [
      "Hosted dashboard",
      "Unlimited templates",
      "Batch sending (100 recipients)",
      "Email & SMS history (60 days)",
      "Up to 3 queues, 10 IoT devices",
      "1 AWS account",
      "Email support (48hr)",
    ],
    cta: "Start Free Trial",
    popular: true,
    includesPrevious: "Everything in Free, plus",
  },
  {
    name: "Pro",
    description: "Small teams and growing businesses",
    monthlyPrice: 49,
    yearlyPrice: 40.83,
    features: [
      "Everything in Starter",
      "Unlimited batch recipients",
      "A/B testing",
      "Advanced analytics",
      "3 AWS accounts (dev, staging, prod)",
      "Team collaboration (up to 10 members)",
      "Email support (24hr)",
    ],
    cta: "Start Free Trial",
    popular: false,
    includesPrevious: "",
  },
  {
    name: "Enterprise",
    description: "Large teams and regulated industries",
    monthlyPrice: 399,
    yearlyPrice: 332.5,
    features: [
      "Everything in Pro",
      "Unlimited AWS accounts",
      "SSO/SAML integration",
      "Audit logs (unlimited retention)",
      "Approval workflows",
      "SOC 2 compliance",
      "Dedicated support (4hr SLA)",
    ],
    cta: "Contact Sales",
    popular: false,
    includesPrevious: "",
  },
];

export function PricingSection() {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <section className="bg-muted/40 py-24 sm:py-32" id="pricing">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <Badge className="mb-4" variant="outline">
            Simple Pricing
          </Badge>
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            One price, all services
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Start free with the local console. Upgrade to hosted dashboard when
            you're ready. All services included—no additional fees as we add
            SMS, queues, and IoT.
          </p>

          {/* Billing Toggle */}
          <div className="mb-2 flex items-center justify-center">
            <ToggleGroup
              className="cursor-pointer rounded-full border-none bg-secondary p-1 text-secondary-foreground shadow-none"
              onValueChange={(value) => setIsYearly(value === "yearly")}
              type="single"
              value={isYearly ? "yearly" : "monthly"}
            >
              <ToggleGroupItem
                className="cursor-pointer rounded-full! border border-transparent px-6 transition-colors hover:bg-transparent data-[state=on]:border-border data-[state=on]:bg-background data-[state=on]:text-foreground"
                value="monthly"
              >
                Monthly
              </ToggleGroupItem>
              <ToggleGroupItem
                className="cursor-pointer rounded-full! border border-transparent px-6 transition-colors hover:bg-transparent data-[state=on]:border-border data-[state=on]:bg-background data-[state=on]:text-foreground"
                value="yearly"
              >
                Annually
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <p className="text-muted-foreground text-sm">
            <span className="font-semibold text-primary">Save 20%</span> On
            Annual Billing
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="mx-auto max-w-7xl">
          <div className="rounded-xl border">
            <div className="grid md:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan, index) => (
                <div
                  className={`row-span-4 grid grid-rows-subgrid gap-6 p-8 ${
                    plan.popular
                      ? "mx-4 my-2 rounded-xl border-transparent bg-card shadow-xl ring-1 ring-foreground/10 backdrop-blur"
                      : ""
                  }`}
                  key={index}
                >
                  {/* Plan Header */}
                  <div>
                    <div className="mb-2 font-medium text-lg tracking-tight">
                      {plan.name}
                    </div>
                    <div className="text-balance text-muted-foreground text-sm">
                      {plan.description}
                    </div>
                  </div>

                  {/* Pricing */}
                  <div>
                    <div className="mb-1 font-bold text-4xl">
                      {plan.name === "Free"
                        ? "$0"
                        : `$${(isYearly ? plan.yearlyPrice : plan.monthlyPrice).toFixed(0)}`}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {plan.name === "Free"
                        ? "Forever"
                        : isYearly
                          ? "Per month, billed annually"
                          : "Per month"}
                    </div>
                  </div>

                  {/* CTA Button */}
                  <div>
                    <Button
                      className={`my-2 w-full cursor-pointer ${
                        plan.popular
                          ? "border-[0.5px] border-white/25 bg-primary text-primary-foreground shadow-black/20 shadow-md ring-1 ring-primary/15 hover:bg-primary/90"
                          : "border border-transparent bg-background shadow-black/15 shadow-sm ring-1 ring-foreground/10 hover:bg-muted/50"
                      }`}
                      variant={plan.popular ? "default" : "secondary"}
                    >
                      {plan.cta}
                    </Button>
                  </div>

                  {/* Features */}
                  <div>
                    <ul className="space-y-3 text-sm" role="list">
                      {plan.includesPrevious && (
                        <li className="flex items-center gap-3 font-medium">
                          {plan.includesPrevious}:
                        </li>
                      )}
                      {plan.features.map((feature, featureIndex) => (
                        <li
                          className="flex items-center gap-3"
                          key={featureIndex}
                        >
                          <Check
                            className="size-4 shrink-0 text-muted-foreground"
                            strokeWidth={2.5}
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AWS Cost Note */}
        <div className="mx-auto mt-16 max-w-2xl text-center">
          <p className="mb-4 text-muted-foreground">
            <strong className="text-foreground">Plus AWS costs:</strong> You pay
            AWS directly for infrastructure usage. Most users pay $10-100/month
            to AWS depending on volume.
          </p>
          <p className="text-muted-foreground text-sm">
            Questions?{" "}
            <Button
              asChild
              className="h-auto cursor-pointer p-0"
              variant="link"
            >
              <a href="#contact">Contact our team</a>
            </Button>
          </p>
        </div>
      </div>
    </section>
  );
}
