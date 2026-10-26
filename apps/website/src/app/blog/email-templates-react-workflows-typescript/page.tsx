import { Card } from "@wraps/ui/components/ui/card";
import {
  Check,
  ChevronRight,
  Code2,
  FileCode,
  GitBranch,
  Layers,
  Type,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import {
  CLIDemo,
  CodeBlock,
  CompilationDiagram,
  GuaranteeComparison,
  SdkCodeTabs,
  WorkflowCodeTabs,
  WorkflowStepsTable,
} from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Email Templates as React Components, Workflows as TypeScript",
  description:
    "Write email templates as React components and automation workflows as TypeScript. Version-controlled, type-safe, code-reviewable email infrastructure.",
  image: "https://wraps.dev/blog/wraps-templates-and-workflows-as-code.webp",
  datePublished: "2026-02-18T00:00:00.000Z",
  dateModified: "2026-02-18T00:00:00.000Z",
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
    "@id": "https://wraps.dev/blog/email-templates-react-workflows-typescript",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can I write email templates as React components?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Wraps compiles React components into SES-compatible HTML using React Email. You write JSX with full TypeScript support, and the CLI handles compilation, upload, and dashboard sync.",
      },
    },
    {
      "@type": "Question",
      name: "How do email workflows work in TypeScript?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Wraps workflows are TypeScript files using the @wraps.dev/client DSL. You define automation sequences using typed helpers like sendEmail, delay, condition, and cascade. They are version-controlled, type-safe, and can be code-reviewed in PRs.",
      },
    },
    {
      "@type": "Question",
      name: "What is the cascade primitive in Wraps workflows?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Cascade is a workflow primitive that sends a sequence of emails, stopping as soon as the contact engages (opens, clicks). It's useful for re-engagement campaigns and drip sequences that respect user attention.",
      },
    },
    {
      "@type": "Question",
      name: "Do templates stay in sync between code and the dashboard?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Wraps uses a local lockfile to track which version of each template is deployed. The CLI detects conflicts between code and dashboard edits, and the dashboard shows live previews of code-pushed templates.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "Email Templates as React, Workflows as TypeScript",
  description:
    "Write email templates as React components and automation workflows as TypeScript. Version-controlled, type-safe, code-reviewable email infrastructure.",
  openGraph: {
    title: "Email Templates as React, Workflows as TypeScript | Wraps",
    description:
      "Write email templates as React components and automation workflows as TypeScript with Wraps.",
    type: "article",
    url: "https://wraps.dev/blog/email-templates-react-workflows-typescript",
    images: [
      {
        url: "https://wraps.dev/blog/wraps-templates-and-workflows-as-code.webp",
        width: 1200,
        height: 630,
        alt: "Email Templates as React, Workflows as TypeScript",
      },
    ],
    publishedTime: "2026-02-18T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Email Templates as React, Workflows as TypeScript | Wraps",
    description:
      "Write email templates as React components and automation workflows as TypeScript with Wraps.",
    images: [
      "https://wraps.dev/blog/wraps-templates-and-workflows-as-code.webp",
    ],
  },
  alternates: {
    canonical:
      "https://wraps.dev/blog/email-templates-react-workflows-typescript",
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
              <Code2 size={16} />
              <span>Developer Experience</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">10 min read</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              Email Templates as React,
              <span className="block bg-gradient-to-r from-brand to-brand bg-clip-text text-transparent">
                Workflows as TypeScript
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              Write email templates as React components and automation workflows
              as TypeScript. Version-controlled, type-safe, and
              code-reviewable—deployed to your AWS account.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <FileCode className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  React Email templates
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Zap className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  TypeScript workflows
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <GitBranch className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  Git-native version control
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-20 px-6 py-16">
          {/* The Problem */}
          <section>
            <h2 className="mb-8 flex items-center gap-3 font-bold text-3xl">
              <Type className="text-brand" />
              The Problem
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Most email platforms force you into a GUI editor for templates and
              a drag-and-drop builder for workflows. This means no version
              control, no type safety, no code review, and no way to test
              changes before they go live.
            </p>

            <ul className="mb-6 space-y-3">
              {[
                "Template changes can't be reviewed in a PR",
                "No way to roll back a bad deploy besides manual restore",
                "Workflow logic lives in a UI you can't grep or test",
                "Variables are strings with no type checking",
                "Collaboration means \"don't edit while I'm editing\"",
              ].map((pain) => (
                <li
                  className="flex items-start gap-3 text-foreground/80"
                  key={pain}
                >
                  <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                  {pain}
                </li>
              ))}
            </ul>

            <Card className="p-6">
              <div className="prose prose-neutral max-w-none dark:prose-invert">
                <p className="text-foreground/80 text-lg leading-relaxed">
                  Wraps takes a different approach:{" "}
                  <strong className="text-foreground">
                    templates are React components, workflows are TypeScript
                    files
                  </strong>
                  .{" "}
                  <span className="font-semibold text-brand">
                    Your email infrastructure lives in your repo, reviewed in
                    PRs, deployed with your code.
                  </span>
                </p>
              </div>
            </Card>
          </section>

          {/* Templates as React Components */}
          <section>
            <h2 className="mb-8 flex items-center gap-3 font-bold text-3xl">
              <FileCode className="text-brand" />
              Templates as React Components
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Email templates are React components using React Email. You get
              JSX, props with TypeScript types, shared brand constants, and
              component composition. The CLI compiles them to HTML and uploads
              to SES.
            </p>

            <CodeBlock
              code={`import { Html, Head, Body, Container, Text, Button, Hr } from '@react-email/components';
import brand from '../brand';

export const subject = 'Welcome to {{companyName}}!';
export const emailType = 'transactional' as const;
export const testData = { name: 'Jane', activationUrl: 'https://yourapp.com/activate' };

type WelcomeProps = {
  name: string;
  activationUrl: string;
};

export default function Welcome({ name, activationUrl }: WelcomeProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: brand.backgroundColor }}>
        <Container style={{ maxWidth: 600, margin: '0 auto' }}>
          <Text style={{ fontSize: 24, color: brand.textColor }}>
            Welcome, {name}!
          </Text>
          <Text style={{ color: brand.textColor }}>
            Thanks for signing up. Click below to activate your account.
          </Text>
          <Hr />
          <Button
            href={activationUrl}
            style={{
              backgroundColor: brand.primaryColor,
              color: '#fff',
              padding: '12px 24px',
              borderRadius: 6,
            }}
          >
            Activate Account
          </Button>
        </Container>
      </Body>
    </Html>
  );
}`}
              lang="tsx"
              title="wraps/templates/welcome.tsx"
            />

            <CodeBlock
              code={`import { defineBrand } from '@wraps.dev/client';

export default defineBrand({
  primaryColor: '#7C3AED',
  secondaryColor: '#6366f1',
  backgroundColor: '#FAFAFA',
  textColor: '#4B5563',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  buttonStyle: 'rounded',
  buttonRadius: '6px',
  companyName: 'YourApp',
  companyAddress: '123 Main St, City, ST 12345',
  // logoUrl: 'https://yourapp.com/logo.png',
});`}
              lang="typescript"
              title="wraps/brand.ts"
            />
          </section>

          {/* How Compilation Works */}
          <section>
            <h2 className="mb-8 flex items-center gap-3 font-bold text-3xl">
              <Zap className="text-brand" />
              How Compilation Works
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              When you run{" "}
              <code className="rounded bg-muted px-2 py-1 text-sm">
                wraps email templates push
              </code>
              , the CLI compiles your React components through a pipeline that
              produces SES-compatible HTML, syncs to the dashboard, and writes a
              lockfile for conflict detection.
            </p>

            <CompilationDiagram />

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: "Fast Compilation",
                  description:
                    "esbuild compiles TypeScript in milliseconds. No webpack, no Babel.",
                },
                {
                  title: "Prop Extraction",
                  description:
                    "Template variables are extracted from props for dashboard editing.",
                },
                {
                  title: "React Email Rendering",
                  description:
                    "Components rendered to cross-client HTML with inline styles.",
                },
                {
                  title: "Lockfile Tracking",
                  description:
                    "A local lockfile prevents accidental overwrites between code and dashboard edits.",
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

          {/* Workflows as TypeScript */}
          <section>
            <h2 className="mb-8 flex items-center gap-3 font-bold text-3xl">
              <Layers className="text-brand" />
              Workflows as TypeScript
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Automation workflows are TypeScript files that define triggers,
              steps, delays, and conditions. They live in your repo alongside
              templates and deploy with{" "}
              <code className="rounded bg-muted px-2 py-1 text-sm">
                wraps email workflows push
              </code>
              .
            </p>

            <WorkflowCodeTabs />

            <h3 className="mt-8 mb-4 font-semibold text-xl">
              Workflow Primitives
            </h3>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              Workflows are built from composable primitives. Here are the most
              common ones — click a row to see an example.
            </p>

            <WorkflowStepsTable />
          </section>

          {/* The Cascade Primitive */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">The Cascade Primitive</h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Cascade is designed for sequences where you want to stop as soon
              as the contact engages. Each step waits for a specified duration.
              If the contact opens or clicks during that window, the cascade
              stops. Otherwise, it moves to the next step.
            </p>

            <CodeBlock
              code={`import { defineWorkflow, cascade } from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Win-Back Campaign',
  trigger: { type: 'event', eventName: 'contact.churned' },

  steps: [
    // Spread cascade — it expands to send + wait + condition nodes
    ...cascade('win-back', {
      channels: [
        {
          type: 'email',
          template: 'we-miss-you',
          wait: { days: 3 },
          // If they open/click within 3 days, stop here
        },
        {
          type: 'email',
          template: 'heres-whats-new',
          wait: { days: 5 },
          // If they engage with this one, stop
        },
        {
          type: 'email',
          template: 'final-offer',
          // Last channel — no wait, cascade ends
        },
      ],
    }),
  ],
});`}
              lang="typescript"
              title="wraps/workflows/win-back.ts"
            />

            <p className="mt-4 text-foreground/80 leading-relaxed">
              This replaces complex branching logic in traditional workflow
              builders. One primitive handles the entire re-engagement pattern,
              and the logic is readable in a code review.
            </p>
          </section>

          {/* Code and Dashboard Stay in Sync */}
          <section>
            <h2 className="mb-8 flex items-center gap-3 font-bold text-3xl">
              <GitBranch className="text-brand" />
              Code and Dashboard Stay in Sync
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Templates pushed from code appear in the dashboard for visual
              editing. Edits made in the dashboard are tracked separately. The
              CLI detects when both sides have changed and warns you before
              overwriting.
            </p>

            <div className="mb-6 rounded-xl border bg-muted/30 p-6">
              <h4 className="mb-3 font-semibold text-foreground">
                How Sync Works
              </h4>
              <ul className="space-y-2">
                {[
                  "A local lockfile tracks the SHA256 hash of each pushed template",
                  "Dashboard edits are tracked separately with a lastEditedFrom field",
                  "templates push compares hashes — warns on conflict, skips unchanged",
                  "Use --force to overwrite dashboard edits when pushing from code",
                ].map((item) => (
                  <li
                    className="flex items-center gap-2 text-foreground/80 text-sm"
                    key={item}
                  >
                    <Check className="shrink-0 text-brand" size={14} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Send with the SDK */}
          <section>
            <h2 className="mb-4 font-bold text-3xl">Send with the SDK</h2>
            <p className="mb-4 text-foreground/80 leading-relaxed">
              Install the SDK to send emails using your templates:
            </p>

            <CodeBlock code="npm install @wraps.dev/email" title="terminal" />

            <p className="mt-6 mb-4 text-foreground/80 leading-relaxed">
              Send using a named SES template with data substitution, or render
              React components to HTML and send directly.
            </p>

            <SdkCodeTabs />
          </section>

          {/* Why This Matters */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">Why This Matters</h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Moving email templates and workflows into code gives you the same
              guarantees you expect from application development: version
              control, type safety, testing, and rollbacks.
            </p>

            <GuaranteeComparison />
          </section>

          {/* Getting Started */}
          <section>
            <h2 className="mb-8 font-bold text-3xl">Getting Started</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Initialize a templates directory, write your first template, and
              push it to SES in under a minute.
            </p>

            <CodeBlock
              code={`# Initialize templates directory
npx @wraps.dev/cli email templates init

# Edit wraps/templates/welcome.tsx

# Push to SES + dashboard
npx @wraps.dev/cli email templates push

# Push workflows
npx @wraps.dev/cli email workflows push`}
              title="terminal"
            />

            <h3 className="mt-8 mb-4 font-semibold text-xl">
              See It In Action
            </h3>
            <CLIDemo />
          </section>

          {/* Continue Learning */}
          <section className="space-y-4">
            <h2 className="font-bold text-2xl">Continue Learning</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/guides/templates"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Templates Quickstart
                </h3>
                <p className="text-muted-foreground text-sm">
                  Step-by-step guide to your first React Email template
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/guides/workflows"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Workflows Quickstart
                </h3>
                <p className="text-muted-foreground text-sm">
                  Build your first automation workflow in TypeScript
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/inbound-email-guide"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Inbound Email Guide
                </h3>
                <p className="text-muted-foreground text-sm">
                  Receive and process emails in your AWS account
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
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-brand/10 to-brand/10 blur-xl" />
            <Card className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                Ready to code your email?
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                Write templates as React, workflows as TypeScript. Deploy to
                your AWS account with one command.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="rounded-xl border bg-muted/30 px-6 py-3 font-mono text-brand">
                  npx @wraps.dev/cli email templates init
                </div>
                <a
                  className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-brand/90"
                  href="/docs/guides/templates"
                >
                  Get Started
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
