"use client";

import {
  ArrowRight,
  Cloud,
  Gauge,
  Lock,
  Mail,
  Shield,
  Terminal,
  Workflow,
} from "lucide-react";
import { Image3D } from "@/components/image-3d";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const mainFeatures = [
  {
    icon: Terminal,
    title: "One-Command Deploy",
    description:
      "Run 'npx wraps init' and get production-ready email infrastructure in under 2 minutes.",
    status: "Available",
  },
  {
    icon: Mail,
    title: "Resend-like SDK",
    description:
      "TypeScript-first SDK (@wraps-js/email) with the same clean API you love from Resend.",
    status: "Available",
  },
  {
    icon: Gauge,
    title: "Event Tracking & Analytics",
    description:
      "Real-time delivery, open, click tracking with DynamoDB storage and beautiful dashboards.",
    status: "Available",
  },
  {
    icon: Lock,
    title: "Zero Stored Credentials",
    description:
      "OIDC and IAM roles mean we never see your AWS keys. Your infrastructure, your control.",
    status: "Available",
  },
];

const secondaryFeatures = [
  {
    icon: Cloud,
    title: "Pay AWS Directly",
    description:
      "$0.10 per 1,000 emails vs Resend's $1. Most apps pay $5-20/month instead of $100+.",
  },
  {
    icon: Shield,
    title: "Production-Ready Configs",
    description:
      "Choose Starter ($0.05/mo), Production ($2-5/mo), or Enterprise ($50-100/mo) presets.",
  },
  {
    icon: Terminal,
    title: "Local-First Dashboard",
    description:
      "Run the console locally with zero setup. Upgrade to hosted when you're ready.",
  },
  {
    icon: Workflow,
    title: "Future-Proof Roadmap",
    description:
      "Starting with email, expanding to SMS (End User Messaging) and workflows (SQS + Lambda).",
  },
];

export function FeaturesSection() {
  return (
    <section className="bg-muted/30 py-24 sm:py-32" id="features">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge className="mb-4" variant="outline">
            How It Works
          </Badge>
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            Enterprise Email Infrastructure, Zero Hassle
          </h2>
          <p className="text-lg text-muted-foreground">
            Deploy production-grade AWS SES infrastructure with event tracking,
            analytics, and beautiful dashboards in one command. No AWS expertise
            required.
          </p>
        </div>

        {/* First Feature Section */}
        <div className="mb-24 grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
          {/* Left Image */}
          <Image3D
            alt="Analytics dashboard"
            darkSrc="feature-1-dark.png"
            direction="left"
            lightSrc="feature-1-light.png"
          />
          {/* Right Content */}
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
                Everything You Need, Nothing You Don't
              </h3>
              <p className="text-pretty text-base text-muted-foreground">
                Wraps deploys AWS SES, DynamoDB, Lambda, EventBridge, and IAM
                roles to your AWS account in one command. You get event
                tracking, analytics, and a beautiful dashboard while paying AWS
                directly at their rates.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {mainFeatures.map((feature, index) => (
                <li
                  className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent/5"
                  key={index}
                >
                  <div className="mt-0.5 flex shrink-0 items-center justify-center">
                    <feature.icon
                      aria-hidden="true"
                      className="size-5 text-primary"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground">
                        {feature.title}
                      </h3>
                      {feature.status && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            feature.status === "Available"
                              ? "bg-green-500/10 text-green-700 dark:text-green-400"
                              : feature.status === "Next"
                                ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {feature.status}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {feature.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-4 pe-4 pt-2 sm:flex-row">
              <Button className="cursor-pointer" size="lg">
                <a className="flex items-center" href="#pricing">
                  Get Started Free
                  <ArrowRight aria-hidden="true" className="ms-2 size-4" />
                </a>
              </Button>
              <Button className="cursor-pointer" size="lg" variant="outline">
                <a
                  href="https://github.com/wraps-team/wraps"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View on GitHub
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Second Feature Section - Flipped Layout */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
          {/* Left Content */}
          <div className="order-2 space-y-6 lg:order-1">
            <div className="space-y-4">
              <h3 className="text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
                Developer Experience That Rivals Resend
              </h3>
              <p className="text-pretty text-base text-muted-foreground">
                Use our TypeScript SDK with the same clean API you love from
                Resend. Track opens, clicks, bounces, and complaints in
                real-time. View analytics in a beautiful dashboard. All while
                saving 90% on costs.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {secondaryFeatures.map((feature, index) => (
                <li
                  className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent/5"
                  key={index}
                >
                  <div className="mt-0.5 flex shrink-0 items-center justify-center">
                    <feature.icon
                      aria-hidden="true"
                      className="size-5 text-primary"
                    />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {feature.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-4 pe-4 pt-2 sm:flex-row">
              <Button className="cursor-pointer" size="lg">
                <a className="flex items-center" href="/docs">
                  Read the Docs
                  <ArrowRight aria-hidden="true" className="ms-2 size-4" />
                </a>
              </Button>
              <Button className="cursor-pointer" size="lg" variant="outline">
                <a href="#pricing">View Pricing</a>
              </Button>
            </div>
          </div>

          {/* Right Image */}
          <Image3D
            alt="Performance dashboard"
            className="order-1 lg:order-2"
            darkSrc="feature-2-dark.png"
            direction="right"
            lightSrc="feature-2-light.png"
          />
        </div>
      </div>
    </section>
  );
}
