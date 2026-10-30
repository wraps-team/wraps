import { Card } from "@wraps/ui/components/ui/card";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock,
  DollarSign,
  Shield,
  Terminal,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import {
  AnimatedCounter,
  ArchitectureDiagram,
  CLIDemo,
  CodeBlock,
  CodeTabs,
  ComparisonTable,
  PresetCards,
} from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "AWS SES Setup Simplified: From Hours to Minutes",
  description:
    "What should be a simple 'send email from my app' turns into a multi-day odyssey. See how one command deploys production-ready SES infrastructure.",
  image: "https://wraps.dev/blog/aws-ses-simplified.webp",
  datePublished: "2026-01-29T00:00:00.000Z",
  dateModified: "2026-01-29T00:00:00.000Z",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
    description:
      "Email infrastructure experts building tools to deploy production-ready email systems to AWS. Specialists in email deliverability, authentication (SPF, DKIM, DMARC), and AWS SES.",
    sameAs: ["https://github.com/wraps-team", "https://twitter.com/wrapsdev"],
  },
  publisher: {
    "@type": "Organization",
    name: "Wraps",
    logo: {
      "@type": "ImageObject",
      url: "https://wraps.dev/logo.png",
    },
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://wraps.dev/blog/aws-ses-simplified",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How long does it take to set up AWS SES with Wraps?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "About 2-3 minutes. Run 'npx @wraps.dev/cli email init' and the CLI deploys IAM roles, SES configuration, EventBridge, SQS, Lambda, and DynamoDB to your AWS account automatically.",
      },
    },
    {
      "@type": "Question",
      name: "What AWS resources does Wraps deploy?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Wraps deploys 7 AWS resources: IAM Role with least-privilege policies, SES Configuration Set, EventBridge Rule, SQS Queue with Dead Letter Queue, Lambda function for event processing, and DynamoDB table for email history.",
      },
    },
    {
      "@type": "Question",
      name: "How much does AWS SES cost with Wraps?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AWS SES costs $0.10 per 1,000 emails. Wraps infrastructure costs vary by preset: Starter (~$0.05/mo), Production (~$2-5/mo), or Enterprise (~$50-100/mo). You pay AWS directly with no middleman markup.",
      },
    },
    {
      "@type": "Question",
      name: "Does Wraps store my AWS credentials?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Wraps uses OIDC (OpenID Connect) authentication for Vercel deployments, meaning your functions get temporary AWS credentials automatically. No access keys are stored or managed.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "AWS SES Setup Simplified: From Hours to Minutes",
  description:
    "What should be a simple 'send email from my app' turns into a multi-day odyssey. See how one command deploys production-ready SES infrastructure.",
  openGraph: {
    title: "AWS SES Setup Simplified: From Hours to Minutes | Wraps",
    description:
      "What should be a simple 'send email from my app' turns into a multi-day odyssey. See how one command deploys production-ready SES infrastructure.",
    type: "article",
    url: "https://wraps.dev/blog/aws-ses-simplified",
    images: [
      {
        url: "https://wraps.dev/blog/aws-ses-simplified.webp",
        width: 800,
        height: 421,
        alt: "AWS SES Setup Simplified",
      },
    ],
    publishedTime: "2026-01-29T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "AWS SES Setup Simplified: From Hours to Minutes | Wraps",
    description:
      "What should be a simple 'send email from my app' turns into a multi-day odyssey. See how one command deploys production-ready SES infrastructure.",
    images: ["https://wraps.dev/blog/aws-ses-simplified.webp"],
  },
  alternates: {
    canonical: "https://wraps.dev/blog/aws-ses-simplified",
  },
};

// Quote card component - purely presentational, no hooks
function QuoteCard({
  quote,
  source,
  highlight,
}: {
  quote: string;
  source: string;
  highlight?: string;
}) {
  return (
    <Card className="relative p-6">
      <div className="absolute -top-3 -left-2 font-serif text-6xl text-success/20">
        &ldquo;
      </div>
      <blockquote className="relative z-10 italic leading-relaxed text-foreground/80">
        {quote}
        {highlight && (
          <span className="mt-3 block font-semibold not-italic text-success">
            {highlight}
          </span>
        )}
      </blockquote>
      <cite className="mt-4 block text-muted-foreground text-sm not-italic">
        &mdash; {source}
      </cite>
    </Card>
  );
}

// Static resource table - purely presentational
function ResourceTable({
  rows,
}: {
  rows: { resource: string; purpose: string }[];
}) {
  return (
    <div className="mb-8 overflow-hidden rounded-xl border">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50">
            <th className="px-4 py-3 text-left font-semibold text-foreground/80 text-sm">
              Resource
            </th>
            <th className="px-4 py-3 text-left font-semibold text-foreground/80 text-sm">
              Purpose
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t" key={row.resource}>
              <td className="px-4 py-3 font-mono text-success text-sm">
                {row.resource}
              </td>
              <td className="px-4 py-3 text-foreground/80 text-sm">
                {row.purpose}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        {/* Hero Section */}
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-top from-success/20 via-transparent to-transparent" />

          <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-16">
            <div className="mb-4 flex items-center gap-2 font-medium text-success text-sm">
              <Terminal size={16} />
              <span>Engineering</span>
              <span className="text-muted-foreground">&bull;</span>
              <span className="text-muted-foreground">10 min read</span>
              <span className="text-muted-foreground">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              AWS SES Setup Simplified:
              <span className="block bg-gradient-to-r from-success to-success bg-clip-text text-transparent dark:from-success">
                From Hours to Minutes
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              If you&apos;ve ever tried to set up AWS SES from scratch, you know
              the pain. What should be a simple &ldquo;send email from my
              app&rdquo; turns into a multi-day odyssey through IAM policies,
              sandbox approvals, DKIM configuration, and prayers to the DNS
              propagation gods.
            </p>

            <p className="mt-4 max-w-2xl text-muted-foreground text-lg leading-relaxed">
              We built Wraps because this experience is broken&mdash;and because
              you shouldn&apos;t have to choose between AWS economics and
              developer sanity.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Clock className="text-success" size={16} />
                <span className="text-foreground/80 text-sm">
                  Minutes to deploy
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <DollarSign className="text-success" size={16} />
                <span className="text-foreground/80 text-sm">
                  $0.10 per 1K emails
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Shield className="text-success" size={16} />
                <span className="text-foreground/80 text-sm">
                  Your AWS, your data
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-20 px-6 py-16">
          {/* Problem Section */}
          <section>
            <h2 className="mb-8 flex items-center gap-3 font-bold text-3xl">
              <AlertCircle className="text-destructive" />
              The Problem: SES Setup is a Nightmare
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Developer forums are filled with horror stories about AWS SES
              setup. The process involves navigating the AWS console, writing
              IAM policies by hand, configuring{" "}
              <a
                className="text-primary hover:underline"
                href="/blog/your-dmarc-policy-is-useless"
              >
                DKIM records
              </a>
              , setting up event tracking pipelines, and managing
              credentials&mdash;all before you can send a single email.
            </p>

            <div className="mb-8 grid gap-6 md:grid-cols-2">
              <QuoteCard
                quote="I have been denied production access about 3 times now... It's frustrating as the responses we get from the AWS Trust & Safety Team are very point blank and appear to be canned messages for rejecting."
                source="AWS re:Post"
              />
              <QuoteCard
                highlight="SES: 15 hours = $1500; Resend: 15mn = $25"
                quote="After a whole day of configurations in the AWS console I still couldn't send one single email. When going back to Resend, I managed to send my first email in literally 1 minute."
                source="Nino Filiu, Dev.to"
              />
            </div>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              The time investment is brutal. When you factor in engineer time,
              the cost of manual SES setup can dwarf the savings you get from
              AWS&apos;s low per-email pricing. Developers routinely spend full
              days just getting to the point where they can send a single test
              email.
            </p>

            <Card className="p-6">
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                <p className="text-foreground/80 text-lg leading-relaxed">
                  But here&apos;s the thing&mdash;
                  <strong className="text-foreground">
                    once SES is set up, it&apos;s incredibly cheap
                  </strong>{" "}
                  ($0.10 per 1,000 emails) and you own the infrastructure. The
                  problem isn&apos;t SES itself.{" "}
                  <span className="font-semibold text-success">
                    It&apos;s the setup.
                  </span>
                </p>
              </div>
            </Card>
          </section>

          {/* Solution Section */}
          <section>
            <h2 className="mb-8 flex items-center gap-3 font-bold text-3xl">
              <Zap className="text-success" />
              The Solution: Infrastructure as Code, Zero Console
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Wraps deploys production-ready email infrastructure to your AWS
              account using Pulumi under the hood. One command. No AWS console
              spelunking. No sandbox approval essays.
            </p>

            <CodeBlock
              animate={true}
              code="npx @wraps.dev/cli email init"
              title="terminal"
            />

            <p className="mt-6 mb-4 text-foreground/80 text-lg leading-relaxed">
              That&apos;s it. In about 2 minutes, you have:
            </p>

            <ul className="mb-8 space-y-3">
              {[
                "SES configured with your domain",
                "DKIM, SPF, and DMARC ready for DNS",
                "Event tracking via EventBridge",
                "Email history in DynamoDB",
                "Lambda functions processing delivery events",
                "Proper IAM roles with least-privilege access",
                "OIDC authentication (no stored credentials)",
              ].map((item) => (
                <li
                  className="flex items-start gap-3 text-foreground/80 leading-relaxed"
                  key={item}
                >
                  <Check className="mt-1 shrink-0 text-success" size={16} />
                  {item}
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                {
                  label: "Setup Time",
                  value: "~2min",
                  sublabel: "vs 4-8 hours",
                },
                {
                  label: "AWS Resources",
                  value: <AnimatedCounter end={7} />,
                  sublabel: "auto-configured",
                },
                {
                  label: "Credentials",
                  value: "Zero",
                  sublabel: "stored secrets",
                },
                {
                  label: "Cost",
                  value: <AnimatedCounter end={10} prefix="$0." />,
                  sublabel: "per 1K emails",
                },
              ].map((stat) => (
                <div
                  className="rounded-xl border bg-muted/30 p-4 text-center"
                  key={stat.label}
                >
                  <div className="font-bold text-3xl text-success">
                    {stat.value}
                  </div>
                  <div className="mt-1 font-medium text-foreground text-sm">
                    {stat.label}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {stat.sublabel}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Interactive CLI Demo */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">See It In Action</h2>
            <CLIDemo />
          </section>

          {/* Option 1: The CLI Path */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">
              Option 1: The CLI Path (Fastest)
            </h2>

            <h3 className="mb-4 font-semibold text-xl">Installation</h3>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              Install the CLI globally or run it directly with npx:
            </p>
            <CodeBlock
              code={`npm install -g @wraps.dev/cli
# or just use npx
npx @wraps.dev/cli email init`}
              title="terminal"
            />

            <div className="mt-6 mb-8 rounded-xl border bg-muted/30 p-6">
              <h4 className="mb-3 font-semibold text-foreground">
                Requirements
              </h4>
              <ul className="space-y-2">
                {[
                  "Node.js 20+",
                  "AWS CLI configured with valid credentials",
                  "An AWS account with appropriate permissions",
                ].map((req) => (
                  <li
                    className="flex items-center gap-2 text-foreground/80 text-sm"
                    key={req}
                  >
                    <Check className="text-success" size={14} />
                    {req}
                  </li>
                ))}
              </ul>
            </div>

            <h3 className="mb-4 font-semibold text-xl">
              Deploying Infrastructure
            </h3>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              Run the init command and the CLI walks you through the entire
              process:
            </p>
            <CodeBlock code="wraps email init" title="terminal" />

            <p className="mt-4 mb-4 text-foreground/80 leading-relaxed">
              The CLI handles five steps automatically:
            </p>
            <ol className="mb-6 list-inside list-decimal space-y-2 text-foreground/80 leading-relaxed">
              <li>
                <strong className="text-foreground">
                  Credential validation
                </strong>{" "}
                &ndash; Confirms your AWS access
              </li>
              <li>
                <strong className="text-foreground">Preset selection</strong>{" "}
                &ndash; Choose Starter, Production, or Enterprise
              </li>
              <li>
                <strong className="text-foreground">Cost estimation</strong>{" "}
                &ndash; Shows estimated monthly AWS costs
              </li>
              <li>
                <strong className="text-foreground">Deployment</strong> &ndash;
                Pulumi provisions everything
              </li>
              <li>
                <strong className="text-foreground">OIDC setup</strong> &ndash;
                Configures credential-free access for Vercel
              </li>
            </ol>

            <h4 className="mb-3 font-semibold text-lg">Command Options</h4>
            <CodeBlock
              code="wraps email init -p vercel -r us-east-1 -y"
              title="terminal"
            />

            <div className="mt-4 mb-8 overflow-hidden rounded-xl border">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-foreground/80 text-sm">
                      Flag
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground/80 text-sm">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      flag: "-p, --provider",
                      desc: "Hosting provider (vercel, aws, railway, other)",
                    },
                    { flag: "-r, --region", desc: "AWS region" },
                    {
                      flag: "-y, --yes",
                      desc: "Skip confirmation prompts",
                    },
                  ].map((row) => (
                    <tr className="border-t" key={row.flag}>
                      <td className="px-4 py-3 font-mono text-success text-sm">
                        {row.flag}
                      </td>
                      <td className="px-4 py-3 text-foreground/80 text-sm">
                        {row.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="mb-4 font-semibold text-xl">Adding Your Domain</h3>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              Once infrastructure is deployed, add your sending domain. This
              creates the SES identity and returns DKIM tokens for DNS
              configuration.
            </p>
            <CodeBlock
              code="wraps email domains add -d yourdomain.com"
              title="terminal"
            />

            <h3 className="mt-8 mb-4 font-semibold text-xl">
              Verifying DNS Configuration
            </h3>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              After adding DNS records, verify that everything is configured
              correctly. The CLI checks DKIM CNAME records,{" "}
              <a
                className="text-primary hover:underline"
                href="/blog/spf-guide"
              >
                SPF TXT record
              </a>
              ,{" "}
              <a
                className="text-primary hover:underline"
                href="/blog/your-dmarc-policy-is-useless"
              >
                DMARC TXT record
              </a>
              , and MAIL FROM MX records (if configured).
            </p>
            <CodeBlock
              code="wraps email domains verify -d yourdomain.com"
              title="terminal"
            />

            <h3 className="mt-8 mb-4 font-semibold text-xl">
              Managing Your Deployment
            </h3>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              The CLI provides commands for every lifecycle stage of your email
              infrastructure:
            </p>
            <CodeBlock
              code={`# Check status of your infrastructure
wraps email status

# List all domains
wraps email domains list

# Upgrade to a higher tier
wraps email upgrade

# Remove everything (careful!)
wraps email destroy`}
              title="terminal"
            />
          </section>

          {/* Comparison */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">Manual vs Wraps</h2>
            <ComparisonTable />
          </section>

          {/* Architecture / IaC Section */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">
              Option 2: Understanding the IaC (What Gets Deployed)
            </h2>
            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Under the hood, Wraps uses Pulumi with{" "}
              <code className="rounded bg-muted px-2 py-0.5 text-success">
                @pulumi/aws
              </code>{" "}
              to provision infrastructure. All resources are namespaced with{" "}
              <code className="rounded bg-muted px-2 py-0.5 text-success">
                wraps-email-*
              </code>{" "}
              for easy identification. Here&apos;s the complete picture.
            </p>

            <h3 className="mb-4 font-semibold text-xl">IAM Resources</h3>
            <ResourceTable
              rows={[
                {
                  resource: "wraps-email-role",
                  purpose: "Main IAM role for SDK access",
                },
                {
                  resource: "wraps-email-policy",
                  purpose: "Least-privilege policy for email operations",
                },
                {
                  resource: "OIDC Provider",
                  purpose:
                    "Enables Vercel to assume the role without stored credentials",
                },
              ]}
            />

            <h3 className="mb-4 font-semibold text-xl">SES Resources</h3>
            <ResourceTable
              rows={[
                {
                  resource: "wraps-email-config-set",
                  purpose: "Configuration set for event tracking",
                },
                {
                  resource: "Email Identities",
                  purpose: "Your verified domains",
                },
              ]}
            />

            <h3 className="mb-4 font-semibold text-xl">
              Event Tracking Architecture
            </h3>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              Every email event flows through a reliable, serverless pipeline.
              SES emits events to EventBridge, which routes them to SQS for
              buffered processing. A Lambda function reads from the queue and
              writes structured records to DynamoDB. Failed events land in a
              Dead Letter Queue for debugging.
            </p>
            <ArchitectureDiagram />

            <div className="mt-6">
              <ResourceTable
                rows={[
                  {
                    resource: "EventBridge Rule",
                    purpose:
                      "Captures SES events (send, delivery, open, click, bounce, complaint)",
                  },
                  {
                    resource: "SQS Queue",
                    purpose: "Buffers events for reliable processing",
                  },
                  {
                    resource: "SQS Dead Letter Queue",
                    purpose: "Stores failed events for debugging",
                  },
                  {
                    resource: "Lambda Function",
                    purpose: "Processes events and writes to DynamoDB",
                  },
                ]}
              />
            </div>

            <h3 className="mb-4 font-semibold text-xl">Storage</h3>
            <ResourceTable
              rows={[
                {
                  resource: "wraps-email-history",
                  purpose: "DynamoDB table for email history",
                },
                {
                  resource: "wraps-email-events",
                  purpose: "DynamoDB table for delivery events",
                },
              ]}
            />

            <h3 className="mb-4 font-semibold text-xl">Event Types Tracked</h3>
            <div className="mb-8 flex flex-wrap gap-2">
              {[
                "SEND",
                "DELIVERY",
                "OPEN",
                "CLICK",
                "BOUNCE",
                "COMPLAINT",
                "REJECT",
                "RENDERING_FAILURE",
                "DELIVERY_DELAY",
                "SUBSCRIPTION",
              ].map((eventType) => (
                <span
                  className="rounded-lg border bg-muted/30 px-3 py-1.5 font-mono text-foreground/80 text-sm"
                  key={eventType}
                >
                  {eventType}
                </span>
              ))}
            </div>

            <h3 className="mb-4 font-semibold text-xl">
              Resource Naming Convention
            </h3>
            <p className="text-foreground/80 leading-relaxed">
              All Wraps resources follow the pattern{" "}
              <code className="rounded bg-muted px-2 py-0.5 text-success">
                wraps-email-&#123;resource-type&#125;
              </code>
              . Every resource is tagged with{" "}
              <code className="rounded bg-muted px-2 py-0.5 text-success">
                ManagedBy: &apos;wraps-cli&apos;
              </code>{" "}
              so you can easily identify and audit Wraps-managed infrastructure
              in your AWS account.
            </p>
          </section>

          {/* Presets */}
          <section>
            <h2 className="mb-4 font-bold text-3xl">Configuration Presets</h2>
            <p className="mb-8 text-muted-foreground leading-relaxed">
              Choose your deployment complexity based on your needs. Upgrade
              anytime with{" "}
              <code className="rounded bg-muted px-2 py-0.5 text-success">
                wraps email upgrade
              </code>
              .
            </p>
            <PresetCards />
          </section>

          {/* SDK Usage */}
          <section>
            <h2 className="mb-4 font-bold text-3xl">
              Sending Emails with the SDK
            </h2>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              Once infrastructure is deployed, install the TypeScript SDK and
              start sending. The SDK is fully typed and handles credential
              resolution automatically.
            </p>

            <CodeBlock code="npm install @wraps.dev/email" title="terminal" />

            <p className="mt-6 mb-4 text-foreground/80 leading-relaxed">
              On Vercel, credentials are automatic via OIDC&mdash;no environment
              variables, no stored secrets. The SDK detects the runtime
              environment and acquires temporary AWS credentials transparently.
            </p>

            <CodeTabs />
          </section>

          {/* Vercel OIDC Integration */}
          <section>
            <h2 className="mb-4 font-bold text-3xl">Vercel OIDC Integration</h2>
            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              One of the nastier parts of AWS integrations is credential
              management. Wraps eliminates this entirely using OIDC federation.
            </p>

            <h3 className="mb-4 font-semibold text-xl">How It Works</h3>
            <CodeBlock
              code="Vercel → OIDC Token → AWS STS → Temporary Credentials → SES"
              title="OIDC Flow"
            />

            <ol className="mt-6 mb-6 list-inside list-decimal space-y-2 text-foreground/80 leading-relaxed">
              <li>Your Vercel deployment requests an OIDC token</li>
              <li>
                AWS STS validates the token and issues temporary credentials
              </li>
              <li>The SDK uses those credentials to call SES</li>
              <li>Credentials rotate automatically&mdash;nothing stored</li>
            </ol>

            <h3 className="mb-4 font-semibold text-xl">Setup</h3>
            <p className="text-foreground/80 leading-relaxed">
              During{" "}
              <code className="rounded bg-muted px-2 py-0.5 text-success">
                wraps email init
              </code>
              , you&apos;ll be asked for your Vercel team slug and project name.
              These configure the OIDC trust relationship so your deployments
              can assume the IAM role without any stored secrets. See our{" "}
              <a
                className="text-primary hover:underline"
                href="/blog/nextjs-vercel-ses-guide"
              >
                Next.js + Vercel + SES guide
              </a>{" "}
              for a complete walkthrough.
            </p>
          </section>

          {/* Connecting Existing SES */}
          <section>
            <h2 className="mb-4 font-bold text-3xl">Connecting Existing SES</h2>
            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Already have SES configured? Wraps can layer on top without
              touching your existing setup:
            </p>
            <CodeBlock code="wraps email connect" title="terminal" />

            <p className="mt-6 text-foreground/80 leading-relaxed">
              This command scans your existing AWS resources (SES domains,
              config sets), prompts for which features you want to add, and
              deploys Wraps resources non-destructively. It never modifies your
              existing configuration&mdash;all new resources are created with
              the{" "}
              <code className="rounded bg-muted px-2 py-0.5 text-success">
                wraps-email-
              </code>{" "}
              prefix.
            </p>
          </section>

          {/* Troubleshooting */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">Troubleshooting</h2>

            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="mb-2 font-semibold text-xl text-destructive">
                  &ldquo;AWS credentials not found&rdquo;
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Ensure the AWS CLI is configured by running{" "}
                  <code className="rounded bg-muted px-2 py-0.5 text-success">
                    aws configure
                  </code>
                  . Verify your identity with{" "}
                  <code className="rounded bg-muted px-2 py-0.5 text-success">
                    aws sts get-caller-identity
                  </code>
                  .
                </p>
              </Card>

              <Card className="p-6">
                <h3 className="mb-2 font-semibold text-xl text-destructive">
                  &ldquo;Insufficient permissions&rdquo;
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Your AWS user needs permissions to create IAM roles, SES
                  identities, DynamoDB tables, Lambda functions, SQS queues, and
                  EventBridge rules. Use an admin user for initial setup.
                </p>
              </Card>

              <Card className="p-6">
                <h3 className="mb-2 font-semibold text-xl text-destructive">
                  &ldquo;Domain verification pending&rdquo;
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Add the DKIM CNAME records to your DNS provider. Run{" "}
                  <code className="rounded bg-muted px-2 py-0.5 text-success">
                    wraps email domains verify -d yourdomain.com
                  </code>{" "}
                  to check progress. DNS propagation can take up to 72 hours,
                  though it usually completes in minutes. Need help with sandbox
                  approval? See our{" "}
                  <a
                    className="text-primary hover:underline"
                    href="/blog/ses-sandbox-guide"
                  >
                    SES sandbox escape guide
                  </a>
                  .
                </p>
              </Card>

              <Card className="p-6">
                <h3 className="mb-2 font-semibold text-xl text-destructive">
                  &ldquo;OIDC provider already exists&rdquo;
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  The Vercel OIDC provider may exist from another project. The
                  CLI handles this gracefully and reuses existing
                  providers&mdash;no action needed on your part.
                </p>
              </Card>
            </div>
          </section>

          {/* What You're Not Paying For */}
          <section>
            <h2 className="mb-4 font-bold text-3xl">
              What You&apos;re Not Paying For
            </h2>
            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Traditional email APIs charge you per email sent, plus platform
              fees, plus storage fees. With Wraps, the model is different:
            </p>

            <ul className="mb-6 space-y-3">
              {[
                "You pay AWS directly for sending ($0.10 per 1,000 emails)",
                "Your data stays in your AWS account",
                "No vendor lock-in\u2014your infrastructure keeps working even if you stop using Wraps",
              ].map((item) => (
                <li
                  className="flex items-start gap-3 text-foreground/80 leading-relaxed"
                  key={item}
                >
                  <Check className="mt-1 shrink-0 text-success" size={16} />
                  {item}
                </li>
              ))}
            </ul>

            <Card className="p-6">
              <p className="text-foreground/80 text-lg leading-relaxed">
                If you&apos;re sending 100,000 emails per month:{" "}
                <span className="font-semibold text-destructive">
                  Resend ~$90/month
                </span>{" "}
                vs{" "}
                <span className="font-semibold text-success">
                  Wraps ~$12 to AWS
                </span>
                .
              </p>
            </Card>
          </section>

          {/* Design Principles */}
          <section>
            <h2 className="mb-4 font-bold text-3xl">Design Principles</h2>
            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Every CLI decision follows these principles:
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "Non-Destructive",
                  description: "We never modify your existing AWS resources",
                },
                {
                  title: "Namespaced",
                  description:
                    "All resources prefixed with wraps-email- for easy identification",
                },
                {
                  title: "Fail Fast",
                  description:
                    "Validate early, so you know immediately if something\u2019s wrong",
                },
                {
                  title: "Great UX",
                  description:
                    "Clear output, helpful error messages, suggestions for next steps",
                },
                {
                  title: "Zero Credentials Stored",
                  description: "OIDC authentication only",
                },
              ].map((principle) => (
                <Card className="p-5" key={principle.title}>
                  <h4 className="mb-1 font-semibold text-foreground">
                    {principle.title}
                  </h4>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {principle.description}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          {/* Continue Learning */}
          <section className="space-y-4">
            <h2 className="font-bold text-2xl">Continue Learning</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/nextjs-vercel-ses-guide"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Next.js + Vercel + AWS SES Guide
                </h3>
                <p className="text-muted-foreground text-sm">
                  Complete tutorial for Next.js apps with OIDC authentication
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/ses-sandbox-guide"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Escape AWS SES Sandbox
                </h3>
                <p className="text-muted-foreground text-sm">
                  Get production access on your first try
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/ses-production-architecture"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  SES Production Architecture
                </h3>
                <p className="text-muted-foreground text-sm">
                  Dedicated IPs, bounce handling, and scaling patterns
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/your-dmarc-policy-is-useless"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Your DMARC Policy Is Useless
                </h3>
                <p className="text-muted-foreground text-sm">
                  Interactive deep-dive into email authentication
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/spf-guide"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  The SPF 10-Lookup Limit
                </h3>
                <p className="text-muted-foreground text-sm">
                  Why your SPF record might be failing silently
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/tools"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Email Tools
                </h3>
                <p className="text-muted-foreground text-sm">
                  Check your domain&apos;s email authentication setup
                </p>
              </a>
            </div>
          </section>

          {/* CTA */}
          <section className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-success/10 to-success/10 blur-xl" />
            <Card className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                Ready to escape the AWS console?
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                You&apos;ll have production email infrastructure in your AWS
                account in minutes.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="rounded-xl border bg-muted/30 px-6 py-3 font-mono text-success">
                  npx @wraps.dev/cli email init
                </div>
                <a
                  className="flex items-center gap-2 rounded-xl bg-success px-6 py-3 font-semibold text-success-foreground transition-colors hover:bg-success"
                  href="/cli"
                >
                  Explore the CLI
                  <ChevronRight size={18} />
                </a>
                <a
                  className="flex items-center gap-2 rounded-xl border bg-muted/30 px-6 py-3 font-semibold text-foreground transition-colors hover:bg-muted"
                  href="/docs"
                >
                  Read the Docs
                </a>
              </div>
            </Card>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
