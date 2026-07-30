"use client";

import { Button } from "@wraps/ui/components/ui/button";
import {
  ArrowRight,
  Cloud,
  GitFork,
  Lock,
  Mail,
  Shield,
  ShieldAlert,
  Terminal,
  Workflow,
} from "lucide-react";
import { memo } from "react";
import { Image3D } from "@/components/image-3d";
import { IconBox, SectionWrapper } from "./section-card";

const mainFeatures = [
  {
    icon: Terminal,
    title: "One-Command Deploy",
    description:
      "Run 'npx @wraps.dev/cli email init' and get production-ready email infrastructure in under 2 minutes.",
    status: "Available",
  },
  {
    icon: Mail,
    title: "TypeScript-First SDK",
    description:
      "Clean API with full type safety. Just `email.send()` - no boilerplate, no callbacks.",
    status: "Available",
  },
  {
    icon: ShieldAlert,
    title: "Reputation Protection",
    description:
      "Bounces and complaints tracked automatically. Suppression lists prevent re-sending to bad addresses, protecting your sender reputation.",
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
    title: "AWS Pricing, No Markup",
    description:
      "Pay AWS directly at $0.10 per 1,000 emails (à la carte) — or $0.16 on AWS's new default Essentials plan. Scale affordably without worrying about tier limits or surprise bills.",
  },
  {
    icon: Shield,
    title: "Infrastructure Presets",
    description:
      "Starter (~$0.05/mo) for MVPs, Production (~$2-5/mo) for apps, Enterprise (~$50-100/mo) for high-volume. Choose what you need.",
  },
  {
    icon: GitFork,
    title: "Open Source & Auditable",
    description:
      "CLI and SDK are open source (AGPLv3). Audit the code, fork it, customize the Pulumi infrastructure.",
  },
  {
    icon: Workflow,
    title: "Future-Proof Roadmap",
    description:
      "Starting with email, expanding to SMS (End User Messaging) and workflows (SQS + Lambda).",
  },
];

export const FeaturesSection = memo(function FeaturesSection() {
  return (
    <SectionWrapper
      badge="Free · Open Source"
      description="You shouldn't have to choose between cost and developer experience. Get the SDK, tracking, and dashboard you actually want—at AWS prices."
      id="features"
      title="SES Pricing. Modern DX."
    >
      {/* First Feature Section */}
      <div className="mb-24 grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
        {/* Left Image */}
        <Image3D
          alt="Analytics dashboard"
          darkSrc="feature-1-dark.webp"
          direction="left"
          lightSrc="feature-1-light.webp"
        />
        {/* Right Content */}
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
              Everything You Need, Nothing You Don't
            </h3>
            <p className="text-pretty text-base text-muted-foreground">
              Wraps deploys SES, DynamoDB, Lambda, EventBridge, and IAM roles to
              your AWS account in one command. You get event tracking,
              analytics, and a dashboard while paying AWS directly.
            </p>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {mainFeatures.map((feature) => (
              <li
                className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent/5"
                key={feature.title}
              >
                <IconBox highlighted icon={feature.icon} size="sm" />
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
            <Button
              className="cursor-pointer bg-orange-500 hover:bg-orange-600"
              size="lg"
            >
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
              Send, Track, Iterate
            </h3>
            <p className="text-pretty text-base text-muted-foreground">
              Use the TypeScript SDK to send emails. Track opens, clicks,
              bounces, and complaints in real-time. Query the data directly from
              DynamoDB or view it in the dashboard. All in your AWS account.
            </p>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {secondaryFeatures.map((feature) => (
              <li
                className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent/5"
                key={feature.title}
              >
                <IconBox highlighted icon={feature.icon} size="sm" />
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
            <Button
              className="cursor-pointer bg-orange-500 hover:bg-orange-600"
              size="lg"
            >
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
          darkSrc="feature-2-dark.webp"
          direction="right"
          lightSrc="feature-2-light.webp"
        />
      </div>
    </SectionWrapper>
  );
});
