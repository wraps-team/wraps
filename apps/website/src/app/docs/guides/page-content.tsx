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
  Activity,
  ArrowRight,
  ArrowRightLeft,
  Ban,
  Bot,
  Cloud,
  CopyCheck,
  FileCode2,
  Gauge,
  Globe,
  KeyRound,
  MailWarning,
  MessagesSquare,
  Network,
  Plug,
  Rocket,
  Server,
  ShieldCheck,
  Sliders,
  Users,
  Webhook,
  Workflow,
} from "lucide-react";
import { DocsLayout } from "@/components/docs-layout";

const guides = [
  {
    title: "AWS Setup",
    description:
      "Configure your AWS credentials to deploy email infrastructure. Guides for beginners and experienced users.",
    href: "/docs/guides/aws-setup",
    icon: Cloud,
    readTime: "2-10 min",
  },
  {
    title: "Production Access",
    description:
      "Move out of the AWS SES sandbox to send emails to any recipient. Learn what's required and how to get approved quickly.",
    href: "/docs/guides/production-access",
    icon: ShieldCheck,
    readTime: "5 min read",
  },
  {
    title: "Domain Verification",
    description:
      "Set up DKIM, SPF, and DMARC for your domain. Improve deliverability and protect your sender reputation.",
    href: "/docs/guides/domain-verification",
    icon: Globe,
    readTime: "10 min read",
  },
  {
    title: "Configuration Presets",
    description:
      "Understand Starter, Production, and Enterprise presets — features, costs, and how to choose the right one for your use case.",
    href: "/docs/guides/configuration-presets",
    icon: Sliders,
    readTime: "5 min read",
  },
  {
    title: "Templates as Code",
    description:
      "Write email templates as React components, preview them locally with hot-reload, and push to SES and the dashboard.",
    href: "/docs/guides/templates",
    icon: FileCode2,
    readTime: "5 min read",
  },
  {
    title: "Building Workflows",
    description:
      "Create automated email and SMS sequences using the Wraps workflow DSL. Define triggers, delays, conditions, and actions.",
    href: "/docs/guides/workflows",
    icon: Workflow,
    readTime: "5 min read",
  },
  {
    title: "Vercel Setup",
    description:
      "Deploy email infrastructure with Vercel OIDC federation. Zero stored credentials, automatic rotation, and seamless integration.",
    href: "/docs/guides/vercel-setup",
    icon: Rocket,
    readTime: "10 min read",
  },
  {
    title: "Migration Guide",
    description:
      "Switch from SendGrid, Postmark, or Resend to Wraps. Side-by-side code comparisons and step-by-step migration instructions.",
    href: "/docs/guides/migration",
    icon: ArrowRightLeft,
    readTime: "5 min read",
  },
  {
    title: "Domain Reputation",
    description:
      "What actually moves a complaint rate on SES, how to watch it per configuration set, and the runbook for a rate that starts climbing.",
    href: "/docs/guides/reputation",
    icon: Gauge,
    readTime: "6 min read",
  },
  {
    title: "Preventing Duplicate Sends",
    description:
      "SQS is at-least-once, so a retried worker sends the email twice. Dedupe keys, a DynamoDB claim table, and the queue settings that cause duplicates.",
    href: "/docs/guides/idempotency",
    icon: CopyCheck,
    readTime: "7 min read",
  },
  {
    title: "Sharing Templates With Marketing",
    description:
      "Engineers own the template in git, marketing edits copy in the dashboard, and lastEditedFrom is where the two meet.",
    href: "/docs/guides/template-handoff",
    icon: Users,
    readTime: "6 min read",
  },
  {
    title: "Webhooks",
    description:
      "Receive real-time SES email events at your HTTPS endpoint. Set up delivery, authenticate requests, and handle events in your application.",
    href: "/docs/guides/webhooks",
    icon: Webhook,
    readTime: "5 min read",
  },
  {
    title: "Bounce & Complaint Handling",
    description:
      "What bounceType and bounceSubType mean, why transient bounces should not suppress, the AWS rate thresholds that pause sending, and how to test with the mailbox simulator.",
    href: "/docs/guides/bounce-handling",
    icon: MailWarning,
    readTime: "8 min read",
  },
  {
    title: "Suppression Lists",
    description:
      "Manage the SES account-level suppression list from the SDK: check, add, remove, and list addresses, filter campaigns before sending, and know when removal is safe.",
    href: "/docs/guides/suppression-lists",
    icon: Ban,
    readTime: "6 min read",
  },
  {
    title: "Custom Events",
    description:
      "Emit custom events from your application to trigger workflows, track user behavior, and resume waiting automation steps.",
    href: "/docs/guides/custom-events",
    icon: Activity,
    readTime: "5 min read",
  },
  {
    title: "Cross-Channel Orchestration",
    description:
      "Build cascading notification flows that try email first and fall back to SMS using the cascade() helper.",
    href: "/docs/guides/orchestration",
    icon: Network,
    readTime: "5 min read",
  },
  {
    title: "Reply Threading",
    description:
      "Thread inbound replies to the original conversation with HMAC-signed reply-to addresses, per-domain secrets, and auto-reply detection.",
    href: "/docs/guides/reply-threading",
    icon: MessagesSquare,
    readTime: "6 min read",
  },
  {
    title: "Better Auth",
    description:
      "Sync Better Auth signups to Wraps contacts and send verification, password reset, magic link, OTP, and invitation emails from your own SES account.",
    href: "/docs/guides/better-auth",
    icon: KeyRound,
    readTime: "6 min read",
  },
  {
    title: "SMTP Credentials",
    description:
      "Generate SMTP credentials for your SES infrastructure. Use with WordPress, Nodemailer, PHPMailer, or any SMTP-compatible system.",
    href: "/docs/guides/smtp",
    icon: Plug,
    readTime: "4 min read",
  },
  {
    title: "AI-Assisted Development",
    description:
      "Give your AI coding assistant current Wraps documentation. Set up Context7 in Cursor, Claude Code, Windsurf, or any MCP-compatible editor.",
    href: "/docs/guides/context7",
    icon: Bot,
    readTime: "3 min read",
  },
  {
    title: "Self-Hosted Deployment",
    description:
      "Deploy the full Wraps control plane to your own AWS account: API, dashboard, database, and email infrastructure.",
    href: "/docs/guides/self-hosted",
    icon: Server,
    readTime: "10 min read",
  },
];

export default function GuidesPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guides
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Getting Production-Ready
        </h1>
        <p className="text-lg text-muted-foreground">
          Step-by-step guides to help you move from development to production
          with confidence.
        </p>
      </div>

      {/* Guide Cards */}
      <div className="grid gap-6">
        {guides.map((guide) => {
          const Icon = guide.icon;
          return (
            <Card
              className="group transition-all hover:border-primary/50 hover:shadow-md"
              key={guide.title}
            >
              <CardHeader className="flex flex-row items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{guide.title}</CardTitle>
                    <span className="text-muted-foreground text-sm">
                      {guide.readTime}
                    </span>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    {guide.description}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild variant="outline">
                  <a href={guide.href}>
                    Read Guide
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </DocsLayout>
  );
}
