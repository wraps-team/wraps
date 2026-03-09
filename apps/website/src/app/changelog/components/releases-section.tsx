import {
  Blocks,
  Cloud,
  Gauge,
  Gift,
  HardDrive,
  Inbox,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Lightbulb,
  Lock,
  type LucideIcon,
  MessageSquare,
  Package,
  Rocket,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tags,
  Terminal,
  Users,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

type Release = {
  version: string;
  date: string;
  icon: LucideIcon;
  iconColor: string;
  title: string;
  items: ReactNode[];
};

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-green-600 text-xs dark:text-green-400">
    {children}
  </code>
);

const releases: Release[] = [
  {
    version: "CLI v2.14–2.17",
    date: "February 2026",
    icon: Terminal,
    iconColor:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    title: "CLI Polish & Multi-Domain Management",
    items: [
      <>
        <Code>--json</Code> output on all commands for CI/CD integration
      </>,
      "Guided multi-domain management with subdomain suggestions for reputation isolation",
      "Root domain support for inbound email receiving",
      "Auto-clear Pulumi stack locks on deploy retry",
      "Hosting provider change in the upgrade menu",
      "Pulumi detection fix for SDK-installed binaries",
      <>
        <Code>wraps email templates preview</Code> with live reload via SSE
      </>,
      "Terminal dashboard UI (TUI) with email init wizard",
    ],
  },
  {
    version: "Platform v0.15.0",
    date: "February 2026",
    icon: LayoutDashboard,
    iconColor:
      "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    title: "Dashboard Overhaul",
    items: [
      "Unified overview page with channel-granular health monitoring",
      <>
        Universal <Code>Cmd-K</Code> command palette with server-side search
      </>,
      "Analytics charts on contacts, events, emails, and inbound pages",
      "CSV import with column mapping and custom properties",
      "CSV export on all dashboard tables",
      "Bulk template actions — select multiple to delete, publish, or change type",
      <>
        Natural language date input for broadcast scheduling (e.g.{" "}
        <Code>next Tuesday at 9am</Code>)
      </>,
      "Send volume sparklines on API key cards",
      "Undo/redo in the visual workflow builder",
      "Pre-enable readiness checks that validate workflows before going live",
      "Searchable condition combobox replacing free-text input",
      "Unsaved changes guard in the workflow builder",
      <>SDK quick start snippets in topic subscribers sheet</>,
    ],
  },
  {
    version: "SDK v0.10.0",
    date: "February 2026",
    icon: Package,
    iconColor:
      "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
    title: "Zero-Config Vercel OIDC & Config Helpers",
    items: [
      <>
        Zero-config Vercel OIDC — SDK auto-detects <Code>AWS_ROLE_ARN</Code>{" "}
        from env, no secrets or env vars needed
      </>,
      <>
        <Code>defineConfig</Code> and <Code>defineBrand</Code> helpers for
        templates-as-code
      </>,
      "Workflow definition helpers for workflows-as-code",
      <>
        <Code>inbox.forward()</Code> and <Code>inbox.reply()</Code> for inbound
        email
      </>,
      "Security patch for fast-xml-parser (CVE override)",
    ],
  },
  {
    version: "SMS v0.1.2",
    date: "February 2026",
    icon: Smartphone,
    iconColor:
      "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400",
    title: "Multi-Channel SMS Launch",
    items: [
      "SMS moved from waitlist to generally available",
      "Multi-channel database schema — templates, contacts, and workflows support both email and SMS",
      "Cascade nodes in the workflow builder for multi-step, multi-channel sequences",
      "SMS dashboard cleanup with correct event status mapping",
      "SMS SDK v0.1.2 with proper error type mapping",
    ],
  },
  {
    version: "Workflow Engine",
    date: "February 2026",
    icon: Wrench,
    iconColor: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
    title: "Workflow Reliability Hardening",
    items: [
      "DLQ consumer with CloudWatch alarms for failed workflow and batch messages",
      "Fixed dual-resume race condition in the workflow processor",
      "Definition snapshots — in-flight executions are immune to live dashboard edits",
      "Repaired broken EventBridge schedule chains with reconciliation watchdog",
      "Hardened webhook SSRF validation — blocks loopback, link-local, and private networks",
      "8 critical and high severity workflow bugs resolved in one pass",
      "Atomic idempotency keys on step execution inserts to prevent duplicate sends",
    ],
  },
  {
    version: "Security & Observability",
    date: "February 2026",
    icon: Lock,
    iconColor:
      "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400",
    title: "Security Patches & Structured Logging",
    items: [
      "Patched XSS, cross-org IDOR, and RCE vulnerabilities",
      "Timing-safe secret comparison across all auth paths",
      "Resolved 22 Dependabot alerts via dependency upgrades and pnpm overrides",
      "Migrated entire API from console logging to structured JSON logging",
      "Canonical log lines per authenticated request for debugging and analytics",
      "PostHog error tracking on API and Stripe webhooks",
      <>
        Cross-org IDOR prevention: all queries scoped by{" "}
        <Code>organizationId</Code> from auth context
      </>,
      "Guardrail system with Biome GritQL plugins and architecture tests",
    ],
  },
  {
    version: "Website",
    date: "February 2026",
    icon: Gauge,
    iconColor:
      "border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400",
    title: "14 New Doc Pages & Performance",
    items: [
      "14 new documentation pages: inbound email, EventBridge events, Vercel setup, webhooks, and migration guide",
      "Redesigned pricing comparison with scroll-driven tabs",
      "New about and contact pages with author bylines",
      "Inbound email marketing page",
      "SEO-optimized SES cost calculator",
      "Converted 13 large PNGs to WebP — 95% size reduction (30MB → 1.3MB)",
      "Auto-discovering sitemap replacing hardcoded page list",
      "Vercel Speed Insights integration",
      <>SSR static content on tools pages for SEO</>,
    ],
  },
  {
    version: "CLI v2.13.0",
    date: "February 2026",
    icon: Zap,
    iconColor:
      "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    title: "Webhook Events",
    items: [
      "Configure an HTTPS webhook endpoint to receive real-time SES email events",
      <>
        CLI: <Code>wraps email upgrade</Code> → "Configure webhook endpoint"
      </>,
      "Events delivered via EventBridge API Destination with secret-based authentication",
      <>
        Supports all SES event types: delivery, bounce, complaint, open, click,
        and more
      </>,
      <>
        <Code>X-Wraps-Signature</Code> header for request verification
      </>,
      "Manage, regenerate secrets, or disable from the same upgrade menu",
    ],
  },
  {
    version: "Platform v0.14.0",
    date: "February 2026",
    icon: Sparkles,
    iconColor:
      "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
    title: "AI Template Editor & Workflows-as-Code",
    items: [
      "AI code assistant with live preview pane and resizable split view",
      "Brand kit picker and local image uploads in AI assistant",
      "Bulk template actions with SES sync on delete",
      <>
        Natural language date input for broadcast scheduling (e.g.{" "}
        <Code>next Tuesday at 9am</Code>)
      </>,
      "Workflows-as-code: define and push automations from the CLI",
      "CloudFormation template brought to full CLI parity",
      "Activation email series and product update templates",
      <>
        Auto-create contacts for <Code>SUBSCRIPTION</Code> events
      </>,
    ],
  },
  {
    version: "CLI v2.12",
    date: "February 2026",
    icon: ShieldCheck,
    iconColor:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    title: "Reliability & Security",
    items: [
      "Batch send security, correctness, and maintainability fixes",
      "Device auth flow fixes for telemetry, errors, and config",
      "Delete S3 metadata on destroy to prevent stuck state after partial failure",
      "Graceful Pulumi destroy failure handling instead of leaving stale metadata",
      "Domain verification check before test email send",
      "Prevent Pulumi import collision when stack already has resources",
      <>
        Fix CI detection silently disabling telemetry for Vercel and Netlify
        users
      </>,
      <>
        <Code>wraps email templates preview</Code> command
      </>,
    ],
  },
  {
    version: "CLI v2.7.0 + SDK v0.6.0",
    date: "February 2026",
    icon: Inbox,
    iconColor:
      "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    title: "Inbound Email",
    items: [
      "Receive emails in your AWS account with SES receipt rules",
      "Parse incoming emails with headers, body, and attachments",
      "Spam and virus scanning via SES verdicts",
      <>
        CLI: <Code>wraps email inbound init</Code>, <Code>status</Code>,{" "}
        <Code>test</Code>, and <Code>destroy</Code> commands
      </>,
      <>
        SDK: <Code>inbox.list()</Code>, <Code>get()</Code>, <Code>reply()</Code>
        , <Code>forward()</Code> methods
      </>,
      <>
        EventBridge <Code>email.received</Code> events for real-time webhooks
      </>,
      "Dashboard: Receiving tab with inbound email viewer",
    ],
  },
  {
    version: "CLI v2.6.1",
    date: "February 2026",
    icon: Cloud,
    iconColor:
      "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
    title: "S3 Remote State",
    items: [
      "Pulumi state automatically stored in S3 for multi-machine deploys",
      "Auto-creates encrypted, versioned state bucket on first deploy",
      "Seamless migration of existing local state to S3",
      "Connection metadata synced across machines with timestamp-based merging",
      <>
        Set <Code>WRAPS_LOCAL_ONLY=1</Code> to opt out and keep local-only state
      </>,
      "Graceful fallback to local state if S3 is unreachable",
    ],
  },
  {
    version: "Platform v0.13.0",
    date: "January 2026",
    icon: Gift,
    iconColor:
      "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
    title: "Free Plan",
    items: [
      "Free tier with contacts, topics, broadcasts, and workflows",
      "Getting Started dashboard with guided activation checklist",
      "Google and GitHub OAuth sign-in",
      "Events log with search, filtering, and usage tracking",
      "Monthly and annual billing toggle with promo code support",
      <>
        CLI: <Code>wraps permissions</Code> command for IAM troubleshooting
      </>,
    ],
  },
  {
    version: "CLI v2.4.0",
    date: "January 2026",
    icon: Layers,
    iconColor: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    title: "Infrastructure as Code",
    items: [
      <>
        Published <Code>@wraps.dev/cdk</Code> and <Code>@wraps.dev/pulumi</Code>{" "}
        npm packages
      </>,
      "One-click CloudFormation deployment from the dashboard",
      "Multi-provider DNS support (Route53, Cloudflare, Vercel)",
      <>
        CLI: <Code>wraps platform connect</Code> to link CLI deployments to the
        dashboard
      </>,
      "CloudWatch reputation alerting for SES metrics",
      "DKIM, SPF, and DMARC DNS record outputs for all IaC providers",
    ],
  },
  {
    version: "CLI v2.1.0",
    date: "January 2026",
    icon: HardDrive,
    iconColor:
      "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
    title: "CDN Infrastructure",
    items: [
      "S3 bucket + CloudFront CDN deployment",
      "Custom domain support with ACM SSL certificates",
      "Browser-based image optimization",
      "Origin Access Control for secure S3 access",
      <>
        CLI: <Code>wraps cdn init</Code>, <Code>verify</Code>,{" "}
        <Code>upgrade</Code>, and <Code>destroy</Code> commands
      </>,
      "Pay AWS directly (~$5-7/mo for typical usage)",
    ],
  },
  {
    version: "Platform v0.10.0",
    date: "January 2026",
    icon: Workflow,
    iconColor:
      "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400",
    title: "Workflow Automations",
    items: [
      "Visual workflow builder with React Flow canvas",
      "AI-powered Flow Designer for natural language automation",
      "Conditional branching and wait-for-event patterns",
      <>
        CLI: <Code>wraps doctor</Code> and <Code>wraps setup</Code> with SSO
        support
      </>,
      <>
        SDK: <Code>@wraps.dev/client</Code> events and workflow trigger
        endpoints
      </>,
    ],
  },
  {
    version: "Platform v0.9.0",
    date: "January 2026",
    icon: Send,
    iconColor:
      "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
    title: "Broadcasts",
    items: [
      "Scheduled broadcasts with bulk SES sending",
      "Brand kits for consistent email styling",
      "Broadcast analytics and delivery tracking",
    ],
  },
  {
    version: "Platform v0.8.0",
    date: "January 2026",
    icon: Tags,
    iconColor:
      "border-pink-500/30 bg-pink-500/10 text-pink-600 dark:text-pink-400",
    title: "Topics & Double Opt-In",
    items: [
      "Topics for subscription management",
      "Double opt-in confirmation emails",
      "Preference center for subscription management",
      <>
        SDK: <Code>@wraps.dev/client</Code> topicSlugs support
      </>,
    ],
  },
  {
    version: "CLI v1.5.0",
    date: "December 2025",
    icon: MessageSquare,
    iconColor:
      "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    title: "SMS Infrastructure",
    items: [
      "SMS support via AWS End User Messaging",
      "Toll-free number provisioning",
      "SMS analytics and delivery tracking",
      <>
        CLI: <Code>wraps sms init</Code>, <Code>status</Code>, and{" "}
        <Code>destroy</Code> commands
      </>,
      <>
        SDK: <Code>@wraps.dev/sms</Code> v0.1.0 for sending SMS via AWS
      </>,
    ],
  },
  {
    version: "CLI v1.4.0",
    date: "December 2025",
    icon: Blocks,
    iconColor:
      "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    title: "Deliverability Check",
    items: [
      <>
        CLI: <Code>wraps email check</Code> command
      </>,
      "DNS record validation (SPF, DKIM, DMARC)",
      "Email authentication analysis",
      "Blocklist monitoring across major providers",
      "Actionable remediation suggestions",
    ],
  },
  {
    version: "SDK v0.1.0",
    date: "December 2025",
    icon: Blocks,
    iconColor:
      "border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400",
    title: "Platform SDK",
    items: [
      <>
        New <Code>@wraps.dev/client</Code> SDK for Platform API
      </>,
      "Type-safe contacts, topics, and segments management",
      "Batch email sending via Platform",
      "API key authentication",
    ],
  },
  {
    version: "Platform v0.4.0",
    date: "December 2025",
    icon: Users,
    iconColor:
      "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    title: "Contacts Management",
    items: [
      "Contact creation, editing, and deletion",
      "Activity timeline showing email events per contact",
      "Custom properties with flexible schema",
      "Contact import/export (CSV)",
      "Search and filtering by properties",
      <>
        SDK: <Code>@wraps.dev/client</Code> contacts API
      </>,
    ],
  },
  {
    version: "Platform v0.3.0",
    date: "December 2025",
    icon: LayoutTemplate,
    iconColor:
      "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    title: "Template Editor",
    items: [
      "Visual drag-and-drop template editor",
      "Keyboard shortcuts and command menu",
      "Template showcase section",
    ],
  },
  {
    version: "CLI v1.0.0",
    date: "November 2025",
    icon: Terminal,
    iconColor:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    title: "Dashboard & Multi-Service CLI",
    items: [
      "Wraps Platform at app.wraps.dev",
      "Email analytics and event tracking",
      "Contact management with activity timeline",
      <>
        CLI: Multi-service architecture (<Code>wraps email</Code>,{" "}
        <Code>wraps sms</Code>)
      </>,
      <>
        CLI: <Code>wraps email domains</Code> and custom tracking domains
      </>,
      <>
        SDK: <Code>@wraps.dev/email</Code> v0.3-0.4 with OIDC federation and
        attachments
      </>,
      "Documentation site with SDK reference",
    ],
  },
  {
    version: "CLI v0.1.0",
    date: "November 2025",
    icon: Rocket,
    iconColor:
      "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
    title: "Initial Release",
    items: [
      "One-command AWS SES deployment",
      "Preset configurations (Starter, Production, Enterprise)",
      "Domain verification, DKIM, and MAIL FROM setup",
      "Local console for development",
      "Vercel OIDC authentication",
      <>
        <Code>@wraps.dev/cli</Code> for infrastructure deployment
      </>,
      <>
        <Code>@wraps.dev/email</Code> v0.1-0.2 TypeScript SDK for sending emails
      </>,
    ],
  },
];

export function ChangelogReleasesSection() {
  return (
    <section className="py-12 pb-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="relative">
          {/* Releases with timeline */}
          <div className="relative">
            {/* Timeline line - contained to releases section */}
            <div className="absolute top-0 bottom-0 left-[24px] w-[1.5px] bg-border" />

            <div className="space-y-12">
              {releases.map((release, index) => {
                const Icon = release.icon;
                return (
                  <div className="relative pl-16" key={release.version}>
                    {/* Timeline dot - outer circle with shadow */}
                    <div className="absolute left-0 flex size-12 items-center justify-center rounded-full bg-background shadow-md">
                      {/* Inner colored circle */}
                      <div
                        className={`flex size-10 items-center justify-center rounded-full border-2 ${release.iconColor}`}
                      >
                        <Icon className="size-5" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="overflow-hidden rounded-xl border bg-background">
                      {/* Header */}
                      <div className="border-b bg-muted/30 px-6 py-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-foreground px-3 py-1 font-mono font-semibold text-background text-sm">
                            {release.version.includes("v")
                              ? release.version
                              : `v${release.version}`}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            {release.date}
                          </span>
                          {index === 0 && (
                            <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 font-medium text-green-600 text-xs dark:text-green-400">
                              Latest
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 font-semibold text-lg">
                          {release.title}
                        </h3>
                      </div>

                      {/* Items */}
                      <div className="p-6">
                        <ul className="space-y-2">
                          {release.items.map((item, itemIndex) => (
                            <li
                              className="flex items-start gap-3 text-sm"
                              key={itemIndex}
                            >
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Origin card - where it all began */}
          <div className="relative mt-12 pl-16">
            {/* Line connecting from releases to lightbulb center */}
            <div className="-top-12 absolute left-[24px] h-[72px] w-[1.5px] bg-border" />

            {/* Timeline terminator dot - covers end of line */}
            <div className="absolute left-0 flex size-12 items-center justify-center rounded-full bg-background shadow-md">
              <div className="flex size-10 items-center justify-center rounded-full border-2 border-foreground/20 bg-foreground/5 text-foreground/60">
                <Lightbulb className="size-5" />
              </div>
            </div>

            {/* Content */}
            <div className="overflow-hidden rounded-xl border border-dashed bg-muted/20">
              <div className="px-6 py-5">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm">
                    October 30th, 2025
                  </span>
                </div>
                <h3 className="mt-2 font-semibold text-lg">The Idea</h3>
                <p className="mt-2 text-muted-foreground text-sm">
                  What if deploying email infrastructure to AWS was as simple as
                  one command? No vendor lock-in, no markup on AWS pricing, just
                  great developer experience.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
