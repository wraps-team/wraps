"use client";

import {
  ArrowRight,
  Cloud,
  DollarSign,
  Gauge,
  Layers,
  Lock,
  Shield,
  Terminal,
  Zap,
} from "lucide-react";
import { Image3D } from "@/components/image-3d";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const mainFeatures = [
  {
    icon: Lock,
    title: "Zero Vendor Lock-In",
    description:
      "Infrastructure stays in your AWS account. Stop paying us, keep using AWS.",
  },
  {
    icon: DollarSign,
    title: "AWS Pricing",
    description:
      "Pay AWS directly. 10-100x cheaper than SaaS alternatives at scale.",
  },
  {
    icon: Zap,
    title: "30-Second Setup",
    description:
      "Deploy production-ready infrastructure in one command. No 2-hour AWS tutorials.",
  },
  {
    icon: Layers,
    title: "Multi-Service Platform",
    description: "Email, SMS, queues, and IoT. One dashboard to rule them all.",
  },
];

const secondaryFeatures = [
  {
    icon: Gauge,
    title: "Resend-like DX",
    description:
      "Beautiful APIs and dashboards that just work. AWS power, SaaS experience.",
  },
  {
    icon: Shield,
    title: "Zero Stored Credentials",
    description:
      "OIDC and IAM roles mean we never see your AWS keys. Maximum security.",
  },
  {
    icon: Terminal,
    title: "Forever Free Local Console",
    description:
      "Full-featured local dashboard. No credit card, no limits, forever.",
  },
  {
    icon: Cloud,
    title: "Infrastructure Ownership",
    description:
      "You own it, you control it, your data never leaves your AWS account.",
  },
];

export function FeaturesSection() {
  return (
    <section className="bg-muted/30 py-24 sm:py-32" id="features">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge className="mb-4" variant="outline">
            Why Wraps?
          </Badge>
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            The Best of AWS and SaaS, None of the Downsides
          </h2>
          <p className="text-lg text-muted-foreground">
            Get Resend-like developer experience with AWS pricing. No vendor
            lock-in, no stored credentials, no surprises. Your infrastructure,
            your control, your data.
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
                Own your infrastructure, keep your data
              </h3>
              <p className="text-pretty text-base text-muted-foreground">
                Wraps deploys directly to your AWS account. You pay AWS
                directly, you own the infrastructure, and your data never leaves
                your control. Stop worrying about vendor lock-in.
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
                Beautiful DX meets maximum security
              </h3>
              <p className="text-pretty text-base text-muted-foreground">
                Clean APIs, gorgeous dashboards, and one-command deployments.
                All while using OIDC and IAM roles so we never touch your AWS
                credentials. The security of self-hosted, the UX of SaaS.
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
