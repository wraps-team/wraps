"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  ArrowRight,
  Blocks,
  Bot,
  FileCode2,
  HardDrive,
  Mail,
  MessageSquare,
  Sparkles,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { DocsLayout } from "@/components/docs-layout";

const cliGuides = [
  {
    title: "Email",
    description:
      "Deploy production-ready email infrastructure using AWS SES. Send transactional emails, track delivery, and manage bounces.",
    href: "/docs/quickstart/email",
    icon: Mail,
    features: [
      "AWS SES setup",
      "Domain verification",
      "TypeScript SDK",
      "Analytics dashboard",
    ],
  },
  {
    title: "CDN",
    description:
      "Deploy S3 + CloudFront CDN for global file delivery with browser-based image optimization.",
    href: "/docs/quickstart/cdn",
    icon: HardDrive,
    features: [
      "S3 bucket + CDN",
      "Custom domain",
      "Image optimization",
      "AWS pricing",
    ],
  },
  {
    title: "SMS",
    description:
      "Send SMS messages through AWS End User Messaging. Perfect for OTP codes, notifications, and alerts.",
    href: "/docs/quickstart/sms",
    icon: MessageSquare,
    features: [
      "Toll-free number",
      "Batch sending",
      "Opt-out management",
      "Delivery tracking",
    ],
  },
  {
    title: "Templates",
    description:
      "Build email templates as React components with hot-reload preview and push to AWS SES from your codebase.",
    href: "/docs/quickstart/email/templates",
    icon: FileCode2,
    features: ["React Email", "Hot-reload preview", "Push to SES", "Brand kit"],
  },
  {
    title: "Agents",
    description:
      "Wire Wraps into your agent's tool calls. Send from your AWS account, no stored credentials, MCP-ready.",
    href: "/docs/quickstart/email/agents",
    icon: Bot,
    features: [
      "Agent tool signature",
      "MCP via Context7",
      "Your AWS SES",
      "@wraps.dev/email SDK",
    ],
  },
];

const platformGuide = {
  title: "Platform",
  description:
    "Use the type-safe Platform SDK to manage contacts, segments, and send batch emails programmatically.",
  href: "/docs/quickstart/platform",
  icon: Blocks,
  features: [
    "Contact management",
    "Batch email sends",
    "Type-safe API client",
    "Full TypeScript support",
  ],
};

const workflowsGuide = {
  title: "Workflows",
  description:
    "Define automated email sequences as TypeScript. Build drip campaigns, onboarding flows, and re-engagement sequences — all as code.",
  href: "/docs/quickstart/email/workflows",
  icon: Workflow,
  features: [
    "Workflows as code",
    "Delays & conditions",
    "Custom event triggers",
    "Cross-channel cascade",
  ],
};

export default function QuickstartPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Quickstart Guides
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Get Started with Wraps
        </h1>
        <p className="text-lg text-muted-foreground">
          Choose a service to get started. Each quickstart guide will walk you
          through deploying infrastructure to your AWS account and sending your
          first message.
        </p>
      </div>

      {/* CLI Quickstart Cards - Email, Storage & SMS */}
      <div className="mb-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cliGuides.map((guide) => {
          const Icon = guide.icon;
          return (
            <Card
              className="group relative overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg"
              key={guide.title}
            >
              <CardHeader>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">{guide.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">{guide.description}</p>
                <ul className="grid grid-cols-2 gap-2 text-muted-foreground text-sm">
                  {guide.features.map((feature) => (
                    <li className="flex items-center gap-2" key={feature}>
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button asChild className="w-full">
                  <a href={guide.href}>
                    Get Started with {guide.title}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Platform Card */}
      <Card className="group relative overflow-hidden transition-all hover:border-brand/50 hover:shadow-lg">
        <CardHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand/10">
            <Blocks className="h-6 w-6 text-brand-text" />
          </div>
          <CardTitle className="text-2xl">{platformGuide.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{platformGuide.description}</p>
          <ul className="grid grid-cols-2 gap-2 text-muted-foreground text-sm md:grid-cols-4">
            {platformGuide.features.map((feature) => (
              <li className="flex items-center gap-2" key={feature}>
                <div className="h-1.5 w-1.5 rounded-full bg-brand" />
                {feature}
              </li>
            ))}
          </ul>
          <Button asChild className="w-full md:w-auto" variant="brand">
            <a
              href="https://app.wraps.dev/auth?mode=signup&plan=starter"
              rel="noopener noreferrer"
              target="_blank"
            >
              Subscribe to Platform
              <Sparkles className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Workflows Card */}
      <Card className="mt-6 group relative overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg">
        <CardHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Workflow className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">{workflowsGuide.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{workflowsGuide.description}</p>
          <ul className="grid grid-cols-2 gap-2 text-muted-foreground text-sm md:grid-cols-4">
            {workflowsGuide.features.map((feature) => (
              <li className="flex items-center gap-2" key={feature}>
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                {feature}
              </li>
            ))}
          </ul>
          <Button asChild className="w-full md:w-auto">
            <a href={workflowsGuide.href}>
              Get Started with Workflows
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="mt-12 bg-muted/50">
        <CardContent className="p-8 text-center">
          <h3 className="mb-2 font-bold text-xl">Not sure where to start?</h3>
          <p className="mb-4 text-muted-foreground">
            Most developers start with Email. It's the most common use case and
            takes about 2 minutes to set up.
          </p>
          <Button asChild variant="outline">
            <Link href="/docs/quickstart/email">
              Start with Email
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </DocsLayout>
  );
}
