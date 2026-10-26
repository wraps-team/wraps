import { Card } from "@wraps/ui/components/ui/card";
import { Check, ChevronRight, Clock, Inbox, Shield, Zap } from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import {
  CLIDemo,
  CodeBlock,
  EmailJsonPreview,
  InboundArchitectureDiagram,
  SdkCodeTabs,
  UseCasesGrid,
} from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Receive Emails in Your AWS Account with Wraps",
  description:
    "Build support inboxes, automate order processing, and create email-to-ticket workflows. All in your AWS account with EventBridge webhooks.",
  image: "https://wraps.dev/blog/wraps-inbound-og.webp",
  datePublished: "2026-02-03T00:00:00.000Z",
  dateModified: "2026-02-03T00:00:00.000Z",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
    description:
      "Email infrastructure experts building tools to deploy production-ready email systems to AWS.",
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
    "@id": "https://wraps.dev/blog/inbound-email-guide",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How does Wraps inbound email work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Wraps deploys AWS infrastructure to receive emails: SES Receipt Rules capture incoming mail, S3 stores the raw email, Lambda parses headers/body/attachments, and EventBridge triggers your webhooks for real-time processing.",
      },
    },
    {
      "@type": "Question",
      name: "What can I do with inbound emails?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Build support inboxes that auto-create tickets, process order confirmations, capture leads from inquiries, set up auto-responders, extract attachments for document workflows, or integrate with any system via EventBridge webhooks.",
      },
    },
    {
      "@type": "Question",
      name: "Does Wraps handle spam and virus detection?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. AWS SES automatically scans incoming emails for spam and viruses. The parsed email includes spamVerdict and virusVerdict fields so you can filter or route emails based on these results.",
      },
    },
    {
      "@type": "Question",
      name: "Can I reply to inbound emails?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! The SDK includes inbox.reply() and inbox.forward() methods that automatically set proper threading headers (In-Reply-To, References) to maintain email chains. Recipients see replies as part of the original conversation.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "Receive Emails in Your AWS Account with Wraps",
  description:
    "Build support inboxes, automate order processing, and create email-to-ticket workflows. All in your AWS account with EventBridge webhooks.",
  openGraph: {
    title: "Receive Emails in Your AWS Account | Wraps",
    description:
      "Build support inboxes, automate order processing, and create email-to-ticket workflows with Wraps inbound email.",
    type: "article",
    url: "https://wraps.dev/blog/inbound-email-guide",
    images: [
      {
        url: "https://wraps.dev/blog/wraps-inbound-og.webp",
        width: 1200,
        height: 630,
        alt: "Wraps Inbound Email Guide",
      },
    ],
    publishedTime: "2026-02-03T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Receive Emails in Your AWS Account | Wraps",
    description:
      "Build support inboxes, automate order processing, and create email-to-ticket workflows with Wraps inbound email.",
    images: ["https://wraps.dev/blog/wraps-inbound-og.webp"],
  },
  alternates: {
    canonical: "https://wraps.dev/blog/inbound-email-guide",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        {/* Hero Section */}
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-top from-brand/20 via-transparent to-transparent" />

          <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-16">
            <div className="mb-4 flex items-center gap-2 font-medium text-brand text-sm">
              <Inbox size={16} />
              <span>Engineering</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">8 min read</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              Receive Emails in
              <span className="block bg-gradient-to-r from-brand to-info bg-clip-text text-transparent dark:to-info">
                Your AWS Account
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              Build support inboxes, automate order processing, and create
              email-to-ticket workflows. All infrastructure deploys to your AWS
              account with EventBridge webhooks for real-time processing.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Clock className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  Deploy in minutes
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Zap className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  Real-time webhooks
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Shield className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  Spam &amp; virus detection
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-20 px-6 py-16">
          {/* Why Inbound Email */}
          <section>
            <h2 className="mb-8 flex items-center gap-3 font-bold text-3xl">
              <Inbox className="text-brand" />
              Why Inbound Email?
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Most email infrastructure focuses on sending ({" "}
              <a
                className="text-primary hover:underline"
                href="/blog/how-email-works"
              >
                here's how that works under the hood
              </a>
              ). But receiving emails opens up powerful automation
              possibilities. Instead of building custom SMTP servers or relying
              on third-party services that store your data, you can process
              emails directly in your AWS account.
            </p>

            <Card className="p-6">
              <div className="prose prose-neutral max-w-none dark:prose-invert">
                <p className="text-foreground/80 text-lg leading-relaxed">
                  With Wraps inbound email, you get{" "}
                  <strong className="text-foreground">
                    SES, S3, Lambda, and EventBridge
                  </strong>{" "}
                  working together.{" "}
                  <span className="font-semibold text-brand">
                    Your data never leaves your AWS account.
                  </span>
                </p>
              </div>
            </Card>
          </section>

          {/* Use Cases */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">What Can You Build?</h2>
            <UseCasesGrid />
          </section>

          {/* Architecture */}
          <section>
            <h2 className="mb-8 flex items-center gap-3 font-bold text-3xl">
              <Zap className="text-brand" />
              How It Works
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              When an email arrives at your domain, AWS SES receives it via MX
              records, stores the raw message in S3, and triggers a Lambda
              function. The Lambda parses headers, body, and attachments, then
              publishes a structured event to EventBridge for your webhooks.
            </p>

            <InboundArchitectureDiagram />

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: "Spam Detection",
                  description:
                    "SES scans all incoming mail. spamVerdict tells you if it passed.",
                },
                {
                  title: "Virus Scanning",
                  description:
                    "Attachments are scanned automatically. virusVerdict included in parsed email.",
                },
                {
                  title: "Attachment Storage",
                  description:
                    "Raw attachments stored in S3. Download via SDK when needed.",
                },
                {
                  title: "Threading Support",
                  description:
                    "Reply with proper In-Reply-To headers to maintain email chains.",
                },
              ].map((feature) => (
                <Card className="p-5" key={feature.title}>
                  <h4 className="mb-1 font-semibold text-foreground">
                    {feature.title}
                  </h4>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          {/* Getting Started */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">Getting Started</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Deploy inbound infrastructure with one command. The CLI sets up
              everything: S3 bucket, SES receipt rules, Lambda processor, and
              EventBridge rules.
            </p>

            <CodeBlock
              code="npx @wraps.dev/cli email inbound init"
              title="terminal"
            />

            <div className="mt-6 mb-8 rounded-xl border bg-muted/30 p-6">
              <h4 className="mb-3 font-semibold text-foreground">
                What Gets Deployed
              </h4>
              <ul className="space-y-2">
                {[
                  "S3 bucket for raw email storage",
                  "SES Receipt Rule Set and Rules",
                  "Lambda function for email parsing",
                  "EventBridge rule for webhooks",
                  "IAM policies with least-privilege access",
                ].map((item) => (
                  <li
                    className="flex items-center gap-2 text-foreground/80 text-sm"
                    key={item}
                  >
                    <Check className="text-brand" size={14} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <h3 className="mb-4 font-semibold text-xl">See It In Action</h3>
            <CLIDemo />

            <h3 className="mt-8 mb-4 font-semibold text-xl">
              Configure Your DNS
            </h3>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              After deployment, add the MX record to your domain&apos;s DNS.
              This routes incoming mail to AWS SES.
            </p>
            <CodeBlock
              code={`Type: MX
Name: @ (or subdomain like "inbound")
Value: 10 inbound-smtp.us-east-1.amazonaws.com
TTL: 3600`}
              title="DNS Record"
            />

            <h3 className="mt-8 mb-4 font-semibold text-xl">Check Status</h3>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              Verify your inbound setup is working correctly:
            </p>
            <CodeBlock
              code="npx @wraps.dev/cli email inbound status"
              title="terminal"
            />
          </section>

          {/* Email Structure */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">Parsed Email Structure</h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Every inbound email is parsed into a structured JSON object. You
              get clean access to headers, body (HTML and text), attachments,
              and spam/virus verdicts.
            </p>

            <EmailJsonPreview />
          </section>

          {/* SDK Examples */}
          <section>
            <h2 className="mb-4 font-bold text-3xl">SDK Examples</h2>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              Install the SDK to interact with your inbox programmatically:
            </p>

            <CodeBlock code="npm install @wraps.dev/email" title="terminal" />

            <p className="mt-6 mb-4 text-foreground/80 leading-relaxed">
              The SDK provides methods for listing emails, getting full details,
              replying with proper threading, and forwarding to team members.
            </p>

            <SdkCodeTabs />
          </section>

          {/* EventBridge Webhooks */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">EventBridge Webhooks</h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Every incoming email triggers an EventBridge event. Create rules
              to route emails to Lambda functions, Step Functions, API
              destinations, or any AWS service.
            </p>

            <CodeBlock
              code={`// EventBridge event detail structure
{
  "source": "wraps.inbound",
  "detail-type": "Email Received",
  "detail": {
    "emailId": "inb_a1b2c3d4",
    "from": { "address": "customer@example.com" },
    "to": [{ "address": "support@yourapp.com" }],
    "subject": "Order Question",
    "spamVerdict": "PASS",
    "virusVerdict": "PASS"
  }
}`}
              title="EventBridge Event"
            />

            <h3 className="mt-8 mb-4 font-semibold text-xl">
              Example: Route to Different Handlers
            </h3>
            <CodeBlock
              code={`// Create EventBridge rules for different recipients
// support@yourapp.com -> Support Lambda
// sales@yourapp.com -> Sales Lambda
// billing@yourapp.com -> Billing Lambda

// Each Lambda receives the parsed email
// and can take action (create ticket, notify team, etc.)`}
              title="Routing Strategy"
            />
          </section>

          {/* Continue Learning */}
          <section className="space-y-4">
            <h2 className="font-bold text-2xl">Continue Learning</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/inbound"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Inbound Email Overview
                </h3>
                <p className="text-muted-foreground text-sm">
                  Explore the full inbound email feature set
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/quickstart/email/inbound"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Inbound Quickstart
                </h3>
                <p className="text-muted-foreground text-sm">
                  Step-by-step guide to receiving your first email
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/aws-ses-simplified"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  AWS SES Setup Simplified
                </h3>
                <p className="text-muted-foreground text-sm">
                  Deploy sending infrastructure in minutes
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/cli"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  CLI Reference
                </h3>
                <p className="text-muted-foreground text-sm">
                  Full CLI documentation and commands
                </p>
              </a>
            </div>
          </section>

          {/* CTA */}
          <section className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-brand/10 to-info/10 blur-xl" />
            <Card className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                Ready to receive emails?
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                Deploy inbound infrastructure to your AWS account in minutes.
                Build support inboxes, automate workflows, and own your data.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="rounded-xl border bg-muted/30 px-6 py-3 font-mono text-brand">
                  npx @wraps.dev/cli email inbound init
                </div>
                <a
                  className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-brand/90"
                  href="/inbound"
                >
                  Learn More
                  <ChevronRight size={18} />
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
