import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { Button } from "@wraps/ui/components/ui/button";
import {
  ArrowRight,
  BookOpen,
  Cloud,
  Code2,
  HardDrive,
  Lock,
  Mail,
  Terminal,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";
import { AnatomyInteractive } from "./components/anatomy-interactive";
import { AnimatedInbox } from "./components/animated-inbox";
import { PipelineInteractive } from "./components/pipeline-interactive";
import { SdkTabs } from "./components/sdk-tabs";
import { UseCasesCarousel } from "./components/use-cases-carousel";
import {
  architectureNodesData,
  codeExamples,
  type IconName,
  pipelineSteps,
  useCases,
} from "./data";

// Icon map for server-side rendering of architecture section
const iconMap: Record<IconName, typeof Mail> = {
  Mail,
  Cloud,
  HardDrive,
  Code2,
  Zap,
  Database: Mail,
  Headphones: Mail,
  Package: Mail,
  FileText: Mail,
  Users: Mail,
  MessageSquare: Mail,
};

const heroFeatures = [
  "SES + S3 + Lambda + EventBridge",
  "Parse headers & attachments",
  "Spam & virus detection",
  "Reply with threading",
];

const architectureRoles = [
  { title: "SES Receives", description: "MX records route to SES" },
  { title: "S3 Stores", description: "Raw email saved securely" },
  { title: "Lambda Parses", description: "Headers, body, attachments" },
  { title: "EventBridge Triggers", description: "Your webhooks & rules" },
];

const benefits = [
  {
    title: "No Vendor Lock-in",
    description: "Infrastructure stays in your AWS if you churn",
  },
  {
    title: "Data Residency",
    description: "Emails never leave your AWS account",
  },
  {
    title: "AWS Pricing",
    description: "Pay AWS directly, no markup",
  },
];

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps Inbound Email",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "AWS",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "Receive and process inbound emails in your AWS account. Parse headers, extract attachments, detect spam, and trigger webhooks with EventBridge.",
  url: "https://wraps.dev/inbound",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
  programmingLanguage: "TypeScript",
};

export const metadata: Metadata = {
  title: "Inbound Email for Amazon SES - Receive Emails in Your AWS | Wraps",
  description:
    "Receive and process emails in your AWS account. Parse headers, extract attachments, detect spam, and trigger webhooks with EventBridge.",
  openGraph: {
    title: "Inbound Email | Wraps",
    description:
      "Receive emails in your AWS with EventBridge webhooks. Full parsing, attachments, and threading support.",
    images: [
      {
        url: "/blog/wraps-inbound-og.webp",
        width: 1200,
        height: 630,
        alt: "Wraps Inbound Email - Receive and process emails in your AWS",
      },
    ],
  },
  twitter: {
    title: "Inbound Email | Wraps",
    description:
      "Receive emails in your AWS with EventBridge webhooks. Full parsing, attachments, and threading support.",
    images: ["/blog/wraps-inbound-og.webp"],
  },
  alternates: {
    canonical: "https://wraps.dev/inbound",
  },
};

export default function InboundPage() {
  return (
    <>
      <JsonLd data={softwareSchema} />

      <div className="min-h-screen bg-background">
        <LandingNavbar />

        <main>
          {/* Hero Section */}
          <section className="relative overflow-hidden bg-linear-to-b from-background to-background/80 pt-20 pb-16 sm:pt-28">
            <div className="absolute inset-0">
              <DotPattern
                className="opacity-100"
                fadeStyle="ellipse"
                size="md"
              />
            </div>

            <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
                {/* Left column - Text content */}
                <div>
                  <div className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                    <span className="size-1.5 rounded-full bg-orange-500" />
                    <span>wraps · inbound email</span>
                  </div>

                  <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
                    <span className="text-orange-500">Every inbox.</span>
                    <br />
                    Your infrastructure.
                  </h1>

                  <p className="mb-8 max-w-lg text-pretty text-lg text-muted-foreground">
                    Receive, parse, and process emails in your AWS account.
                    Build support inboxes, automate order processing, or create
                    email-to-ticket workflows.
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {heroFeatures.map((feature) => (
                      <div className="flex items-center gap-2.5" key={feature}>
                        <span
                          aria-hidden="true"
                          className="h-px w-3 shrink-0 bg-orange-500"
                        />
                        <span className="text-muted-foreground text-sm">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right column - Animated Inbox (client component) */}
                <div className="relative">
                  <div className="-inset-4 absolute rounded-3xl bg-orange-500/10 opacity-60 blur-2xl" />
                  <div className="relative">
                    <AnimatedInbox />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Pipeline Section */}
          <section className="py-16 sm:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mb-12 max-w-2xl">
                <SectionKicker>Pipeline</SectionKicker>
                <h2 className="mb-2 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
                  The Email Pipeline
                </h2>
                <p className="text-lg text-muted-foreground">
                  Follow the journey.{" "}
                  <span className="text-foreground">
                    From inbox to your application.
                  </span>
                </p>
              </div>

              {/* Pipeline steps - server rendered list for SEO */}
              <div className="sr-only">
                <ol>
                  {pipelineSteps.map((step) => (
                    <li key={step.id}>
                      <strong>{step.label}</strong>: {step.description}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Interactive pipeline (client component) */}
              <PipelineInteractive steps={pipelineSteps} />
            </div>
          </section>

          {/* Anatomy Section */}
          <section className="border-border border-y bg-muted/20 py-16 sm:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mb-12 max-w-2xl">
                <SectionKicker>Anatomy</SectionKicker>
                <h2 className="mb-2 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
                  Parsed Email Structure
                </h2>
                <p className="text-lg text-muted-foreground">
                  Every field parsed.{" "}
                  <span className="text-foreground">
                    Hover to explore the structure.
                  </span>
                </p>
              </div>

              {/* Email structure description for SEO */}
              <div className="sr-only">
                <h3>Parsed Email Fields</h3>
                <ul>
                  <li>
                    <strong>emailId</strong>: Unique identifier for the inbound
                    email
                  </li>
                  <li>
                    <strong>from</strong>: Sender address and name
                  </li>
                  <li>
                    <strong>to</strong>: Recipient addresses
                  </li>
                  <li>
                    <strong>subject</strong>: Email subject line
                  </li>
                  <li>
                    <strong>html</strong>: HTML body content
                  </li>
                  <li>
                    <strong>text</strong>: Plain text body content
                  </li>
                  <li>
                    <strong>attachments</strong>: File attachments with
                    filename, content type, and size
                  </li>
                  <li>
                    <strong>spamVerdict</strong>: AWS SES spam detection result
                  </li>
                  <li>
                    <strong>virusVerdict</strong>: AWS SES virus scan result
                  </li>
                </ul>
              </div>

              {/* Interactive anatomy (client component) */}
              <AnatomyInteractive />
            </div>
          </section>

          {/* Use Cases Section */}
          <section className="py-16 sm:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mb-8 max-w-2xl">
                <SectionKicker>Use cases</SectionKicker>
                <h2 className="mb-2 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
                  What Can You Build?
                </h2>
                <p className="text-lg text-muted-foreground">
                  Endless possibilities.{" "}
                  <span className="text-foreground">
                    Build any email-driven workflow.
                  </span>
                </p>
              </div>

              {/* Use cases for SEO */}
              <div className="sr-only">
                {useCases.map((useCase) => (
                  <article key={useCase.id}>
                    <h3>{useCase.title}</h3>
                    <p>{useCase.description}</p>
                    <pre>
                      <code>{useCase.code}</code>
                    </pre>
                  </article>
                ))}
              </div>

              {/* Interactive carousel (client component) */}
              <UseCasesCarousel useCases={useCases} />
            </div>
          </section>

          {/* SDK Section */}
          <section className="border-border border-y bg-muted/20 py-16 sm:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mb-8 max-w-2xl">
                <SectionKicker>SDK</SectionKicker>
                <h2 className="mb-2 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
                  TypeScript SDK
                </h2>
                <p className="text-lg text-muted-foreground">
                  Simple SDK.{" "}
                  <span className="text-foreground">
                    Full control over your inbox.
                  </span>
                </p>
              </div>

              {/* SDK examples for SEO */}
              <div className="sr-only">
                <h3>SDK Code Examples</h3>
                {Object.entries(codeExamples).map(([key, example]) => (
                  <article key={key}>
                    <h4>{example.label}</h4>
                    <pre>
                      <code>{example.code}</code>
                    </pre>
                  </article>
                ))}
              </div>

              {/* Interactive SDK tabs (client component) */}
              <SdkTabs examples={codeExamples} />
            </div>
          </section>

          {/* Architecture Section - fully server rendered */}
          <section className="py-16 sm:py-24">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
              <div className="mb-12 max-w-2xl">
                <SectionKicker>Architecture</SectionKicker>
                <h2 className="mb-2 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
                  Your Infrastructure
                </h2>
                <p className="text-lg text-muted-foreground">
                  Your AWS account.{" "}
                  <span className="text-foreground">Your infrastructure.</span>
                </p>
              </div>

              {/* Architecture diagram */}
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-border border-b bg-muted/30 px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Lock className="size-4 text-orange-500" />
                    <span className="font-medium text-sm">
                      Your AWS Account
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
                    Full Ownership
                  </span>
                </div>

                <div className="p-6 sm:p-8">
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
                    {architectureNodesData.map((node, index) => {
                      const Icon = iconMap[node.iconName];
                      return (
                        <div className="flex items-center" key={node.id}>
                          <div className="flex flex-col items-center rounded-lg border border-border bg-background p-4">
                            <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-muted">
                              <Icon className="size-6 text-orange-500" />
                            </div>
                            <span className="font-medium text-sm">
                              {node.label}
                            </span>
                            <span className="font-mono text-muted-foreground text-xs">
                              {node.sublabel}
                            </span>
                          </div>

                          {index < architectureNodesData.length - 1 && (
                            <ArrowRight className="mx-1 size-5 shrink-0 text-muted-foreground/50 sm:mx-2" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {architectureRoles.map((role) => (
                      <div key={role.title}>
                        <p className="font-medium text-foreground text-sm">
                          {role.title}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {role.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Key benefits */}
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {benefits.map((benefit) => (
                  <div
                    className="rounded-lg border border-border bg-card p-4"
                    key={benefit.title}
                  >
                    <p className="font-medium text-sm">{benefit.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {benefit.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA Section - mostly server rendered */}
          <section className="border-border border-t bg-muted/20 py-16 sm:py-24">
            <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
              <div className="mb-8">
                <SectionKicker>Ready to receive?</SectionKicker>
                <h2 className="mb-4 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
                  Start receiving emails in minutes
                </h2>
                <p className="max-w-xl text-muted-foreground">
                  One command — run it after your email stack is deployed with
                  wraps email init — adds inbound infrastructure to your AWS
                  account. Configure MX records and start processing emails.
                </p>
              </div>

              {/* Install command */}
              <div className="mb-8 max-w-md">
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3 border-border border-b bg-muted/30 px-4 py-3">
                    <Terminal
                      aria-hidden="true"
                      className="size-3.5 text-orange-500"
                    />
                    <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
                      CLI
                    </span>
                  </div>
                  <div className="overflow-x-auto p-4 text-left font-mono text-foreground text-sm">
                    <span className="text-muted-foreground">$ </span>
                    npx @wraps.dev/cli email inbound init
                  </div>
                </div>
              </div>

              {/* CTA buttons */}
              <div className="flex flex-wrap gap-3">
                <Button
                  asChild
                  className="gap-2 bg-orange-500 text-white hover:bg-orange-600"
                  size="lg"
                >
                  <Link href="/docs/quickstart/email/inbound">
                    Get Started
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild className="gap-2" size="lg" variant="outline">
                  <Link href="/docs/cli-reference/email">
                    <BookOpen className="size-4" />
                    View Documentation
                  </Link>
                </Button>
              </div>

              {/* Trust badges */}
              <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground text-sm">
                <span>No credit card required</span>
                <span className="hidden sm:inline">•</span>
                <span>AWS pricing only</span>
                <span className="hidden sm:inline">•</span>
                <span>Full ownership</span>
              </div>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
