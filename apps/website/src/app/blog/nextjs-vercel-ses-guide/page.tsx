import { Card } from "@wraps/ui/components/ui/card";
import { ArrowRight, Database, DollarSign, Shield, Zap } from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { CodeBlock, OIDCDiagram, TerminalDemo } from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Next.js + Vercel + AWS SES: The Complete Email Guide",
  description:
    "Deploy production-ready email infrastructure to your AWS account in minutes. No stored credentials, zero access keys.",
  image: "https://wraps.dev/blog/nextjs-vercel-ses-guide.webp",
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
    "@id": "https://wraps.dev/blog/nextjs-vercel-ses-guide",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I send emails from Next.js on Vercel using AWS SES?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Use Wraps to deploy SES infrastructure with OIDC authentication. Run 'npx @wraps.dev/cli email init', select Vercel as your provider, add your domain, then use the @wraps.dev/email SDK in API routes or Server Actions. Credentials are handled automatically via OIDC.",
      },
    },
    {
      "@type": "Question",
      name: "What is OIDC authentication for AWS SES?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "OIDC (OpenID Connect) allows Vercel functions to get temporary AWS credentials without storing access keys. Vercel issues a JWT token, AWS STS validates it against the OIDC provider, and returns temporary credentials. This eliminates credential rotation and leakage risks.",
      },
    },
    {
      "@type": "Question",
      name: "How much does it cost to send emails with AWS SES vs Resend or SendGrid?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AWS SES costs $0.10 per 1,000 emails. With Wraps, you pay AWS directly — about $7/month at 50K emails vs $50+ for Resend or SendGrid. At 100K emails, it's ~$12 vs $90+. No middleman markup.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need to escape the AWS SES sandbox to use Wraps?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, SES sandbox limits apply regardless of how you deploy. However, Wraps handles all the infrastructure setup automatically so you can focus on the sandbox exit request. The CLI also helps you verify domain DNS records which is required for production access.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "Next.js + Vercel + AWS SES: The Complete Email Guide",
  description:
    "Deploy production-ready email infrastructure to your AWS account in minutes. No stored credentials, zero access keys.",
  openGraph: {
    title: "Next.js + Vercel + AWS SES: The Complete Email Guide | Wraps",
    description:
      "Deploy production-ready email infrastructure to your AWS account in minutes. No stored credentials, zero access keys.",
    type: "article",
    url: "https://wraps.dev/blog/nextjs-vercel-ses-guide",
    images: [
      {
        url: "https://wraps.dev/blog/nextjs-vercel-ses-guide.webp",
        width: 800,
        height: 421,
        alt: "Next.js + Vercel + AWS SES Guide",
      },
    ],
    publishedTime: "2026-01-29T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Next.js + Vercel + AWS SES: The Complete Email Guide | Wraps",
    description:
      "Deploy production-ready email infrastructure to your AWS account in minutes. No stored credentials, zero access keys.",
    images: ["https://wraps.dev/blog/nextjs-vercel-ses-guide.webp"],
  },
  alternates: {
    canonical: "https://wraps.dev/blog/nextjs-vercel-ses-guide",
  },
};

// Static helper components (no hooks, server-compatible)

type FeatureCardProps = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <Card className="group p-6 transition-colors hover:border-emerald-500/30">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10 transition-colors group-hover:bg-emerald-500/20">
        <Icon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h4 className="mb-2 font-semibold text-foreground text-lg">{title}</h4>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>
    </Card>
  );
}

type StepProps = {
  number: number;
  title: string;
  children: React.ReactNode;
};

function Step({ number, title, children }: StepProps) {
  return (
    <div className="relative border-l-2 pb-12 pl-12 last:border-transparent last:pb-0 border-emerald-500">
      <div className="absolute -left-5 flex h-10 w-10 items-center justify-center rounded-full font-bold text-lg bg-emerald-500 text-white">
        {number}
      </div>
      <div className="pt-1">
        <h3 className="mb-4 font-semibold text-foreground text-xl">{title}</h3>
        {children}
      </div>
    </div>
  );
}

const COST_DATA = [
  {
    volume: "10,000",
    resend: "$20",
    sendgrid: "$20",
    wraps: "~$3",
    savings: "85%",
  },
  {
    volume: "50,000",
    resend: "$50",
    sendgrid: "$50",
    wraps: "~$7",
    savings: "86%",
  },
  {
    volume: "100,000",
    resend: "$90",
    sendgrid: "$90",
    wraps: "~$12",
    savings: "87%",
  },
  {
    volume: "500,000",
    resend: "$400",
    sendgrid: "$250",
    wraps: "~$52",
    savings: "79%",
  },
];

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />

      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Background effects */}
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-transparent to-transparent" />
          <div className="absolute top-0 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-500/5 blur-[120px]" />

          <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16">
            {/* Badge */}
            <div className="mb-8 flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-emerald-600 dark:text-emerald-400 text-sm">
                <Zap className="h-4 w-4" />
                <span>Next.js + Vercel + AWS SES</span>
              </div>
            </div>

            {/* Main headline */}
            <h1 className="mb-6 text-center font-extrabold text-5xl leading-tight md:text-7xl">
              <span className="text-foreground">Stop Wrestling with</span>
              <br />
              <span className="bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 bg-clip-text text-transparent dark:from-red-400 dark:via-orange-400 dark:to-amber-400">
                AWS SES Configuration
              </span>
            </h1>

            <p className="mx-auto mb-8 max-w-3xl text-center text-muted-foreground text-xl">
              Deploy production-ready email infrastructure to your AWS account
              in minutes.
              <br />
              <span className="text-emerald-600 dark:text-emerald-400">
                No stored credentials. No access keys. You own everything.
              </span>
            </p>

            <div className="mb-12 flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <span>12 min read</span>
              <span>&bull;</span>
              <span>Wraps Team</span>
            </div>

            {/* Terminal demo */}
            <TerminalDemo />
          </div>
        </section>

        {/* Article Introduction */}
        <article className="mx-auto max-w-3xl px-6 py-16">
          <section className="mb-16">
            <p className="text-foreground/80 text-lg leading-relaxed">
              Setting up AWS SES for a Next.js app deployed on Vercel usually
              means hours of configuration, sandbox approval headaches, and
              hardcoding AWS credentials as environment variables. There&apos;s
              a better way.
            </p>
            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              In this guide, you&apos;ll learn how to deploy production-ready
              email infrastructure to your AWS account in minutes&mdash;and send
              emails from your Vercel-hosted Next.js app without storing a
              single credential.
            </p>
          </section>

          {/* The Problem */}
          <section className="mb-16">
            <h2 className="mb-6 font-bold text-3xl text-foreground">
              The Problem with Traditional SES Setup
            </h2>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              If you&apos;ve tried to set up AWS SES yourself, you&apos;ve
              probably hit these walls:
            </p>
            <ul className="mb-6 space-y-3 pl-6">
              <li className="text-foreground/80 leading-relaxed">
                <strong className="text-foreground">
                  <a
                    className="text-primary hover:underline"
                    href="/blog/ses-sandbox-guide"
                  >
                    Sandbox limbo
                  </a>
                </strong>
                : Writing essay-length justifications for production access,
                getting cryptic rejections with no feedback
              </li>
              <li className="text-foreground/80 leading-relaxed">
                <strong className="text-foreground">DNS configuration</strong>:
                Manually adding{" "}
                <a
                  className="text-primary hover:underline"
                  href="/blog/your-dmarc-policy-is-useless"
                >
                  DKIM records
                </a>
                , waiting 72 hours for propagation, troubleshooting verification
                failures
              </li>
              <li className="text-foreground/80 leading-relaxed">
                <strong className="text-foreground">
                  Credential management
                </strong>
                : Creating IAM users, generating access keys, rotating them
                periodically, storing them in Vercel&apos;s environment
                variables&mdash;see our{" "}
                <a
                  className="text-primary hover:underline"
                  href="/blog/aws-ses-simplified"
                >
                  SES setup guide
                </a>{" "}
                for the full picture
              </li>
              <li className="text-foreground/80 leading-relaxed">
                <strong className="text-foreground">Missing DX</strong>: No SDK,
                no dashboard, no event tracking&mdash;just raw API calls
              </li>
            </ul>
            <p className="text-foreground/80 leading-relaxed">
              Most developers abandon SES setup and pay 10x more for
              alternatives like Resend or SendGrid. But what if you could get
              the DX of Resend with the economics of AWS&mdash;and actually own
              the infrastructure?
            </p>
          </section>

          {/* What We're Building */}
          <section className="mb-16">
            <h2 className="mb-6 font-bold text-3xl text-foreground">
              What We&apos;re Building
            </h2>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              By the end of this tutorial, you&apos;ll have:
            </p>
            <ol className="mb-6 list-decimal space-y-3 pl-6">
              <li className="text-foreground/80 leading-relaxed">
                <strong className="text-foreground">
                  SES infrastructure deployed to your AWS account
                </strong>{" "}
                (domains, event tracking, email history)
              </li>
              <li className="text-foreground/80 leading-relaxed">
                <strong className="text-foreground">OIDC authentication</strong>{" "}
                so your Vercel functions can send email without stored
                credentials
              </li>
              <li className="text-foreground/80 leading-relaxed">
                <strong className="text-foreground">A type-safe SDK</strong> for
                sending emails from Next.js API routes or Server Actions
              </li>
            </ol>
            <p className="text-foreground/80 leading-relaxed">
              The setup takes about 2 minutes. Seriously.
            </p>
          </section>

          {/* Prerequisites */}
          <section className="mb-16">
            <h2 className="mb-6 font-bold text-3xl text-foreground">
              Prerequisites
            </h2>
            <ul className="space-y-2 pl-6">
              <li className="text-foreground/80 leading-relaxed">
                An AWS account with CLI access configured (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                  aws configure
                </code>
                )
              </li>
              <li className="text-foreground/80 leading-relaxed">
                A Vercel account with a Next.js project
              </li>
              <li className="text-foreground/80 leading-relaxed">
                A domain you own (for sending emails)
              </li>
              <li className="text-foreground/80 leading-relaxed">
                Node.js 20+
              </li>
            </ul>
          </section>
        </article>

        {/* Value props */}
        <section className="border-t py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-6 md:grid-cols-3">
              <FeatureCard
                description="OIDC authentication means your Vercel functions get temporary AWS credentials automatically. No access keys to leak or rotate."
                icon={Shield}
                title="Zero Stored Credentials"
              />
              <FeatureCard
                description="Pay AWS directly for sending ($0.10/1K emails). No middleman markup. A startup sending 50K emails/month pays ~$5 to AWS."
                icon={DollarSign}
                title="AWS Economics"
              />
              <FeatureCard
                description="Infrastructure deploys to YOUR AWS account. Your domain, your data, your reputation. Leave anytime, keep everything."
                icon={Database}
                title="You Own Everything"
              />
            </div>
          </div>
        </section>

        {/* Step by step guide */}
        <section className="border-t py-20">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center font-bold text-3xl">
              Step-by-Step Setup Guide
            </h2>
            <p className="mb-16 text-center text-muted-foreground">
              From zero to sending emails in minutes
            </p>

            <div className="space-y-0">
              <Step number={1} title="Install the Wraps CLI">
                <p className="mb-4 text-foreground/80 leading-relaxed">
                  Install the CLI globally, or run it directly with npx:
                </p>
                <CodeBlock
                  code="npm install -g @wraps.dev/cli"
                  filename="terminal"
                />
                <p className="mt-3 mb-4 text-muted-foreground text-sm">
                  Or run directly without installing:
                </p>
                <CodeBlock
                  code="npx @wraps.dev/cli email init"
                  filename="terminal"
                />
              </Step>

              <Step number={2} title="Deploy Email Infrastructure">
                <p className="mb-4 text-foreground/80 leading-relaxed">
                  Run the init command to deploy SES infrastructure to your AWS
                  account:
                </p>
                <CodeBlock code="wraps email init" filename="terminal" />
                <div className="mt-6 space-y-4">
                  <p className="text-foreground/80 leading-relaxed">
                    The CLI will walk you through a few prompts:
                  </p>
                  <ul className="space-y-3 pl-6">
                    <li className="text-foreground/80 leading-relaxed">
                      <strong className="text-foreground">
                        Select your hosting provider
                      </strong>{" "}
                      &mdash; choose <strong>Vercel</strong> (recommended for
                      Next.js). This sets up an OIDC trust relationship between
                      Vercel and your AWS account.
                    </li>
                    <li className="text-foreground/80 leading-relaxed">
                      <strong className="text-foreground">
                        Enter your Vercel team slug and project name
                      </strong>{" "}
                      &mdash; these configure the OIDC trust policy so only{" "}
                      <em>your</em> Vercel project can assume the role.
                    </li>
                    <li className="text-foreground/80 leading-relaxed">
                      <strong className="text-foreground">
                        Choose a configuration preset
                      </strong>{" "}
                      &mdash; for most apps, <strong>Production</strong> is the
                      sweet spot (real-time event tracking, 90-day email
                      history).
                    </li>
                  </ul>
                  <p className="text-foreground/80 leading-relaxed">
                    The CLI deploys via Pulumi: IAM Role, OIDC Provider, SES
                    Configuration Set, EventBridge Rule, SQS Queue + DLQ, Lambda
                    Processor, and DynamoDB Tables.
                  </p>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Total time: ~2 minutes.
                  </p>
                </div>
              </Step>

              <Step number={3} title="Add and Verify Your Domain">
                <p className="mb-4 text-foreground/80 leading-relaxed">
                  Add a sending domain and get DKIM records for your DNS:
                </p>
                <CodeBlock
                  code="wraps email domains add -d yourdomain.com"
                  filename="terminal"
                />
                <p className="mt-4 text-foreground/80 leading-relaxed">
                  The CLI returns DKIM tokens for your DNS. Add these CNAME
                  records to your DNS provider. Verification usually takes a few
                  minutes, though DNS propagation can take up to 72 hours in
                  some cases.
                </p>
                <p className="mt-3 mb-4 text-foreground/80 leading-relaxed">
                  Check status anytime:
                </p>
                <CodeBlock
                  code="wraps email domains list"
                  filename="terminal"
                />
              </Step>

              <Step number={4} title="Install the SDK">
                <p className="mb-4 text-foreground/80 leading-relaxed">
                  Add the type-safe email SDK to your Next.js project:
                </p>
                <CodeBlock
                  code="npm install @wraps.dev/email"
                  filename="terminal"
                />
              </Step>

              <Step number={5} title="Send Your First Email">
                <p className="mb-4 text-foreground/80 leading-relaxed">
                  Here&apos;s a Next.js API route that sends a welcome email:
                </p>
                <CodeBlock
                  code={`import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

export async function POST(request: Request) {
  const { email, name } = await request.json();

  const result = await email.send({
    from: 'hello@yourdomain.com',
    to: email,
    subject: \`Welcome to the team, \${name}!\`,
    html: \`
      <h1>Hey \${name}!</h1>
      <p>Thanks for signing up. We're excited to have you.</p>
      <p>If you have any questions, just reply to this email.</p>
    \`,
  });

  return Response.json({
    success: true,
    messageId: result.messageId,
  });
}`}
                  filename="app/api/send-welcome/route.ts"
                />
                <p className="mt-6 mb-4 text-foreground/80 leading-relaxed">
                  Or use it in a Server Action:
                </p>
                <CodeBlock
                  code={`'use server';

import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

export async function sendWelcomeEmail(email: string, name: string) {
  return await email.send({
    from: 'hello@yourdomain.com',
    to: email,
    subject: \`Welcome, \${name}!\`,
    html: '<h1>Welcome aboard!</h1>',
  });
}`}
                  filename="app/actions/send-email.ts"
                />
              </Step>
            </div>
          </div>
        </section>

        {/* How OIDC Works */}
        <section className="border-t py-20">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center font-bold text-3xl">
              How OIDC Authentication Works
            </h2>
            <p className="mb-12 text-center text-muted-foreground">
              Your Vercel functions get temporary AWS credentials without
              storing secrets
            </p>
            <OIDCDiagram />

            <div className="mx-auto mt-12 max-w-3xl">
              <p className="mb-4 text-foreground/80 leading-relaxed">
                Here&apos;s what happens when your Vercel function sends an
                email:
              </p>
              <ol className="mb-8 list-decimal space-y-2 pl-6">
                <li className="text-foreground/80 leading-relaxed">
                  The SDK requests an OIDC token from Vercel
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  Vercel returns a signed JWT with your project identity
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  The SDK calls AWS STS AssumeRoleWithWebIdentity
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  AWS validates: &ldquo;Is this token from the trusted Vercel
                  project?&rdquo;
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  AWS returns temporary credentials (valid ~1 hour)
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  The SDK sends email via SES using temporary credentials
                </li>
              </ol>

              <h3 className="mb-4 font-semibold text-xl text-foreground">
                The Benefits
              </h3>
              <ul className="space-y-3 pl-6">
                <li className="text-foreground/80 leading-relaxed">
                  <strong className="text-foreground">
                    No stored credentials
                  </strong>
                  : No access keys in environment variables that could leak
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  <strong className="text-foreground">
                    Automatic rotation
                  </strong>
                  : Tokens refresh automatically, no manual key rotation
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  <strong className="text-foreground">Least privilege</strong>:
                  The IAM role only has permissions for email operations
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  <strong className="text-foreground">Audit trail</strong>:
                  Every credential grant is logged in CloudTrail
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Full SDK Reference */}
        <section className="border-t py-20">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center font-bold text-3xl">
              Full SDK Reference
            </h2>
            <p className="mb-12 text-center text-muted-foreground">
              The SDK supports all the features you&apos;d expect from a modern
              email API
            </p>

            <div className="space-y-8">
              <div>
                <h3 className="mb-4 font-semibold text-xl text-foreground">
                  Simple Send
                </h3>
                <CodeBlock
                  code={`import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Hello!',
  html: '<h1>Hello World</h1>',
});`}
                  filename="send-simple.ts"
                />
              </div>

              <div>
                <h3 className="mb-4 font-semibold text-xl text-foreground">
                  With All Options
                </h3>
                <CodeBlock
                  code={`await email.send({
  from: 'Team <hello@yourdomain.com>',
  to: ['user1@example.com', 'user2@example.com'],
  cc: 'manager@example.com',
  bcc: 'archive@yourdomain.com',
  replyTo: 'support@yourdomain.com',
  subject: 'Your order is confirmed',
  html: '<h1>Order #1234</h1><p>Thanks for your purchase!</p>',
  text: 'Order #1234 - Thanks for your purchase!',
  headers: {
    'X-Custom-Header': 'custom-value',
  },
});`}
                  filename="send-with-options.ts"
                />
              </div>

              <div>
                <h3 className="mb-4 font-semibold text-xl text-foreground">
                  With Attachments
                </h3>
                <CodeBlock
                  code={`await email.send({
  from: 'invoices@yourdomain.com',
  to: 'customer@example.com',
  subject: 'Your Invoice',
  html: '<p>Please find your invoice attached.</p>',
  attachments: [
    {
      filename: 'invoice.pdf',
      content: pdfBuffer,
      contentType: 'application/pdf',
    },
  ],
});`}
                  filename="send-with-attachments.ts"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Infrastructure Status */}
        <section className="border-t py-20">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center font-bold text-3xl">
              Checking Your Infrastructure Status
            </h2>
            <p className="mb-8 text-center text-muted-foreground">
              See what&apos;s deployed to your AWS account at any time
            </p>

            <div className="mx-auto max-w-3xl">
              <p className="mb-4 text-foreground/80 leading-relaxed">
                Anytime you want to see what&apos;s deployed:
              </p>
              <CodeBlock code="wraps email status" filename="terminal" />
              <p className="mt-4 text-foreground/80 leading-relaxed">
                This shows your AWS Account, Region, Provider, enabled Features
                (event tracking, email history, dedicated IP), verified Domains,
                and all deployed Resources.
              </p>
            </div>
          </div>
        </section>

        {/* Local Development */}
        <section className="border-t py-20">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center font-bold text-3xl">
              What About Local Development?
            </h2>
            <p className="mb-8 text-center text-muted-foreground">
              It just works&mdash;no changes needed
            </p>

            <div className="mx-auto max-w-3xl">
              <p className="mb-4 text-foreground/80 leading-relaxed">
                When developing locally, the SDK falls back to your local AWS
                credentials (from{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                  aws configure
                </code>{" "}
                or{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                  ~/.aws/credentials
                </code>
                ). No changes needed&mdash;it just works.
              </p>
              <p className="mb-4 text-foreground/80 leading-relaxed">
                If you want to test without sending real emails, you can use
                SES&apos;s mailbox simulator addresses:
              </p>
              <CodeBlock
                code={`await email.send({
  from: 'test@yourdomain.com',
  to: 'success@simulator.amazonses.com', // Always succeeds
  subject: 'Test email',
  html: '<p>This is a test.</p>',
});`}
                filename="local-test.ts"
              />
            </div>
          </div>
        </section>

        {/* Cost comparison */}
        <section className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center font-bold text-3xl">
              Real Cost Savings
            </h2>
            <p className="mb-12 text-center text-muted-foreground">
              Stop paying 10x more for the same emails
            </p>

            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-4 gap-4 border-b bg-muted/50 p-4 font-medium text-muted-foreground text-sm">
                <div>Monthly Volume</div>
                <div className="text-center">Resend</div>
                <div className="text-center">SendGrid</div>
                <div className="text-center text-emerald-600 dark:text-emerald-400">
                  Wraps + AWS
                </div>
              </div>
              {COST_DATA.map((row, i) => (
                <div
                  className="grid grid-cols-4 items-center gap-4 border-b p-4 last:border-0"
                  key={i}
                >
                  <div className="font-mono text-sm">{row.volume}</div>
                  <div className="text-center text-muted-foreground">
                    {row.resend}
                  </div>
                  <div className="text-center text-muted-foreground">
                    {row.sendgrid}
                  </div>
                  <div className="text-center">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {row.wraps}
                    </span>
                    <span className="ml-2 text-emerald-700 dark:text-emerald-600 text-xs">
                      Save {row.savings}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-muted-foreground text-sm">
              AWS costs only: SES sending ($0.10/1K emails) + infrastructure
              (~$2-5/mo). Wraps free tier included.
            </p>

            <div className="mx-auto mt-10 max-w-3xl">
              <h3 className="mb-4 font-semibold text-xl text-foreground">
                Cost Breakdown
              </h3>
              <p className="mb-4 text-foreground/80 leading-relaxed">
                <strong className="text-foreground">
                  AWS (paid directly to AWS):
                </strong>
              </p>
              <ul className="mb-4 space-y-2 pl-6">
                <li className="text-foreground/80 leading-relaxed">
                  SES: $0.10 per 1,000 emails
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  DynamoDB: ~$0.25 per million reads/writes
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  Lambda: Free tier covers most usage
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  EventBridge: Free
                </li>
              </ul>
              <p className="text-foreground/80 leading-relaxed">
                For a typical startup sending 50,000 emails/month, your total
                AWS cost is about $5. Compare that to $50+ on Resend or
                SendGrid.
              </p>
            </div>
          </div>
        </section>

        {/* What You Own */}
        <section className="border-t py-20">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center font-bold text-3xl">
              What You Own
            </h2>
            <p className="mb-8 text-center text-muted-foreground">
              Everything deployed by the CLI lives in your AWS account
            </p>

            <div className="mx-auto max-w-3xl">
              <ul className="mb-6 space-y-3 pl-6">
                <li className="text-foreground/80 leading-relaxed">
                  Your SES domain and reputation
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  Your event data in DynamoDB
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  Your Lambda functions and SQS queues
                </li>
                <li className="text-foreground/80 leading-relaxed">
                  Your IAM roles and policies
                </li>
              </ul>
              <p className="text-foreground/80 leading-relaxed">
                If you ever stop using Wraps, your email infrastructure keeps
                working. No lock-in.
              </p>
            </div>
          </div>
        </section>

        {/* Troubleshooting */}
        <section className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center font-bold text-3xl">
              Troubleshooting
            </h2>
            <p className="mb-12 text-center text-muted-foreground">
              Common issues and how to resolve them
            </p>

            <div className="mx-auto max-w-3xl space-y-8">
              <div>
                <h3 className="mb-2 font-semibold text-xl text-foreground">
                  &ldquo;OIDC token not available&rdquo;
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  This error means you&apos;re not running on Vercel. The OIDC
                  flow only works in Vercel&apos;s serverless environment. For
                  local development, ensure you have AWS credentials configured
                  via{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                    aws configure
                  </code>
                  .
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-xl text-foreground">
                  &ldquo;Domain verification pending&rdquo;
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  DNS propagation can take time. Run{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                    wraps email domains list
                  </code>{" "}
                  to check status. If it has been more than 72 hours,
                  double-check your CNAME records match exactly. Having trouble
                  with{" "}
                  <a
                    className="text-primary hover:underline"
                    href="/blog/spf-guide"
                  >
                    SPF lookups
                  </a>
                  ? That could be the issue.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-xl text-foreground">
                  &ldquo;Access Denied&rdquo; on SES
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Your AWS account might still be in SES sandbox mode. Run{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                    wraps email status
                  </code>{" "}
                  to check. If you need production access, see our{" "}
                  <a
                    className="text-primary hover:underline"
                    href="/blog/ses-sandbox-guide"
                  >
                    guide to escaping the SES sandbox
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Continue Learning */}
        <section className="border-t py-20">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center font-bold text-3xl">
              Continue Learning
            </h2>
            <p className="mb-8 text-center text-muted-foreground">
              Deepen your email infrastructure knowledge
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/aws-ses-simplified"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  AWS SES Setup Simplified
                </h3>
                <p className="text-muted-foreground text-sm">
                  From hours to minutes&mdash;the full SES infrastructure guide
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
          </div>
        </section>

        {/* TL;DR */}
        <section className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center font-bold text-3xl">TL;DR</h2>
            <p className="mb-8 text-center text-muted-foreground">
              The complete setup in four commands
            </p>

            <CodeBlock
              code={`# 1. Deploy infrastructure
npx @wraps.dev/cli email init

# 2. Add your domain
wraps email domains add -d yourdomain.com

# 3. Install SDK
npm install @wraps.dev/email

# 4. Send emails`}
              filename="terminal"
            />

            <p className="mt-8 text-center font-semibold text-foreground/80 text-lg">
              Minutes to production email infrastructure. Your AWS, your data,
              no stored credentials.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="mb-6 font-bold text-4xl">Ready to Ship?</h2>
            <p className="mb-8 text-muted-foreground text-xl">
              Deploy production email infrastructure in minutes.
              <br />
              Your AWS, your data, no stored credentials.
            </p>

            <Card className="mb-8 p-6">
              <CodeBlock code="npx @wraps.dev/cli email init" />
            </Card>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <a
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-400"
                href="/cli"
              >
                Explore the CLI
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                className="inline-flex items-center gap-2 rounded-lg border bg-muted/30 px-6 py-3 font-semibold text-foreground transition-colors hover:bg-muted"
                href="/docs"
              >
                Read the Docs
              </a>
            </div>
          </div>
        </section>

        <LandingFooter />
      </div>
    </>
  );
}
