"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight, Mail, Send, Workflow } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type UseCase = {
  id: string;
  icon: typeof Mail;
  label: string;
  tagline: string;
  competitor: {
    name: string;
    logo?: string;
    metric: string;
    price: number;
  };
  wraps: {
    plan: string;
    price: number;
    breakdown: string;
  };
  savings: number;
};

const useCases: UseCase[] = [
  {
    id: "marketing",
    icon: Mail,
    label: "Marketing",
    tagline: "Newsletters & campaigns",
    competitor: {
      name: "Mailchimp",
      metric: "10K contacts",
      price: 100,
    },
    wraps: {
      plan: "Pro",
      price: 34,
      breakdown: "$29 platform + ~$5 AWS",
    },
    savings: 66,
  },
  {
    id: "transactional",
    icon: Send,
    label: "Transactional",
    tagline: "Receipts & notifications",
    competitor: {
      name: "Resend",
      metric: "50K emails",
      price: 20,
    },
    wraps: {
      plan: "Free",
      price: 5,
      breakdown: "$0 platform + ~$5 AWS",
    },
    savings: 75,
  },
  {
    id: "automations",
    icon: Workflow,
    label: "Automations",
    tagline: "Behavioral triggers",
    competitor: {
      name: "Knock",
      metric: "50K messages",
      price: 250,
    },
    wraps: {
      plan: "Business",
      price: 204,
      breakdown: "$199 platform + ~$5 AWS",
    },
    savings: 18,
  },
];

export function PricingComparisonSection() {
  const [activeCase, setActiveCase] = useState<UseCase>(useCases[0]);

  return (
    <section className="py-20 overflow-hidden" id="comparison">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-orange-500 font-medium text-sm mb-3 tracking-wide uppercase">
            The real cost comparison
          </p>
          <h2 className="font-bold text-3xl md:text-4xl tracking-tight mb-4">
            Stop overpaying for email
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Same features. Same reliability. A fraction of the price.
          </p>
        </div>

        {/* Use Case Selector - Horizontal Pills */}
        <div className="flex justify-center gap-2 mb-10">
          {useCases.map((useCase) => {
            const Icon = useCase.icon;
            const isActive = activeCase.id === useCase.id;
            return (
              <button
                className={cn(
                  "group flex items-center gap-2 px-4 py-2.5 rounded-full border transition-all duration-200",
                  isActive
                    ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/25"
                    : "bg-background border-border hover:border-orange-500/50 text-muted-foreground hover:text-foreground"
                )}
                key={useCase.id}
                onClick={() => setActiveCase(useCase)}
                type="button"
              >
                <Icon
                  className={cn(
                    "size-4 transition-colors",
                    isActive
                      ? "text-white"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className="font-medium text-sm">{useCase.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Comparison Card */}
        <div className="relative">
          {/* Background decoration */}
          <div className="absolute inset-0 bg-linear-to-br from-orange-500/5 via-transparent to-orange-500/5 rounded-3xl" />

          <div className="relative rounded-3xl border bg-background/80 backdrop-blur-sm overflow-hidden">
            {/* Top section - The dramatic comparison */}
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              {/* Competitor Side */}
              <div className="p-8 md:p-10 relative">
                <div className="absolute top-6 right-6 text-muted-foreground/50 text-xs font-medium uppercase tracking-wider">
                  They charge
                </div>

                <div className="mt-4 mb-6">
                  <p className="text-muted-foreground text-sm mb-1">
                    {activeCase.competitor.name}
                  </p>
                  <p className="text-muted-foreground/70 text-xs">
                    for {activeCase.competitor.metric}
                  </p>
                </div>

                <div className="relative inline-block">
                  {/* Strikethrough line */}
                  <div className="absolute top-1/2 -left-2 -right-2 h-0.5 bg-red-500/60 -rotate-6" />
                  <span className="font-bold text-5xl md:text-6xl text-muted-foreground/40">
                    ${activeCase.competitor.price}
                  </span>
                  <span className="text-muted-foreground/40 text-xl ml-1">
                    /mo
                  </span>
                </div>
              </div>

              {/* Wraps Side */}
              <div className="p-8 md:p-10 bg-linear-to-br from-orange-500/8 to-transparent relative">
                <div className="absolute top-6 right-6 text-orange-500 text-xs font-medium uppercase tracking-wider">
                  You pay
                </div>

                <div className="mt-4 mb-6">
                  <p className="text-foreground font-medium text-sm mb-1">
                    Wraps {activeCase.wraps.plan}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {activeCase.wraps.breakdown}
                  </p>
                </div>

                <div>
                  <span className="font-bold text-5xl md:text-6xl text-foreground">
                    ${activeCase.wraps.price}
                  </span>
                  <span className="text-muted-foreground text-xl ml-1">
                    /mo
                  </span>
                </div>

                {/* Savings badge */}
                <div className="mt-6 inline-flex items-center gap-2 bg-green-500/10 text-green-600 dark:text-green-400 px-3 py-1.5 rounded-full">
                  <span className="font-bold text-lg">
                    {activeCase.savings}% less
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom section - Quick context */}
            <div className="border-t border-border bg-muted/30 px-8 md:px-10 py-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground text-sm">
                  <span className="text-foreground font-medium">
                    {activeCase.tagline}
                  </span>
                  {" · "}
                  Sends, contacts, and templates are always free
                </p>
                <Button
                  asChild
                  className="shrink-0"
                  size="sm"
                  variant="outline"
                >
                  <a
                    className="flex items-center gap-2"
                    href="/tools/ses-calculator"
                  >
                    Calculate exact costs
                    <ArrowRight className="size-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Trust line */}
        <p className="text-center text-muted-foreground text-sm mt-8">
          You pay Wraps for the platform. You pay AWS directly for sending.
        </p>
      </div>
    </section>
  );
}
