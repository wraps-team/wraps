import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ExternalLink,
  HelpCircle,
  KeyRound,
  Server,
  Workflow,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { InfoCard } from "@/components/blog/info-card";
import { CodeBlock, Collapsible } from "@/components/blog/interactive";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "How to Send Email from Your Base44 App",
  description:
    "Your Base44 app emits events. Wraps sends the emails. Set up automated email in 10 minutes — no email logic in your code, no Lambda deploy.",
  datePublished: "2026-05-06T00:00:00.000Z",
  dateModified: "2026-05-06T00:00:00.000Z",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
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
    "@id": "https://wraps.dev/blog/base44-send-email",
  },
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Send Email from Your Base44 App",
  description:
    "Emit behavioral events from Base44 backend functions. Wraps workflows send the emails.",
  totalTime: "PT10M",
  step: [
    {
      "@type": "HowToStep",
      name: "Set up email infrastructure",
      text: "Run npx @wraps.dev/cli email init to deploy SES to your AWS account and verify your sending domain.",
      url: "https://wraps.dev/docs/guides/aws-setup",
    },
    {
      "@type": "HowToStep",
      name: "Connect to the Wraps Platform",
      text: "Run npx @wraps.dev/cli platform connect to create a cross-account IAM role so Wraps can send email through your SES when a workflow fires.",
    },
    {
      "@type": "HowToStep",
      name: "Get a Wraps API key",
      text: "Go to the Wraps dashboard → Settings → API Keys and create a key named base44-app.",
    },
    {
      "@type": "HowToStep",
      name: "Add key to Base44",
      text: "In Base44, go to Project → Settings → Server Secrets and add WRAPS_API_KEY.",
    },
    {
      "@type": "HowToStep",
      name: "Install @wraps.dev/client and emit events from backend functions",
      text: "npm install @wraps.dev/client, then call wraps.track() with a behavioral event name and contact details from your backend functions.",
    },
    {
      "@type": "HowToStep",
      name: "Set up a workflow in Wraps dashboard",
      text: "In the Wraps dashboard, create a new workflow. Set the trigger to 'Event received' and select your event name. Add a Send email step and choose your template.",
    },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Do I need to deploy anything to AWS?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Run wraps email init to set up SES, then wraps platform connect to give Wraps permission to send through your SES in workflows. After that, your app calls api.wraps.dev directly — no Lambda to deploy or manage.",
      },
    },
    {
      "@type": "Question",
      name: "Can I call the SDK from Base44 frontend code?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Frontend runs in the browser — anyone in DevTools can read the API key. The key must stay in Server Secrets, which are only accessible to backend functions.",
      },
    },
    {
      "@type": "Question",
      name: "Where do I add secrets in Base44?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Go to Project → Settings → Server Secrets in Base44. These are environment variables that are only accessible to backend functions — they're never sent to the browser.",
      },
    },
    {
      "@type": "Question",
      name: "What's the difference between emitting an event and sending an email?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your app says 'this happened' (user.signed_up, order.placed). Wraps handles what to do — send an email, wait, branch on a condition. Email logic lives in the workflow, not your code.",
      },
    },
    {
      "@type": "Question",
      name: "What does this cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "SES costs $0.10 per 1,000 emails. Events are included in your Wraps plan. You pay AWS directly — no Wraps markup on sending.",
      },
    },
    {
      "@type": "Question",
      name: "How do I get out of the SES sandbox?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Request production access in the AWS console. Out of the box, SES only lets you send to verified addresses. Production access removes that restriction.",
        url: "https://wraps.dev/docs/guides/production-access",
      },
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "How to Send Email from Your Base44 App",
  description:
    "Your Base44 app emits events. Wraps sends the emails. Set up automated email in 10 minutes — no email logic in your code, no Lambda deploy.",
  path: "/blog/base44-send-email",
  type: "article",
  publishedTime: "2026-05-06T00:00:00.000Z",
  authors: ["Wraps Team"],
  social: {
    description:
      "Emit a behavioral event from Base44. Wraps sends the email. No email logic in your app.",
    twitterCopy: {
      description:
        "Emit a behavioral event from Base44. Wraps sends the email.",
    },
  },
});

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />

      <div className="min-h-screen bg-background">
        <LandingNavbar />

        {/* Hero Section */}
        <header className="relative overflow-hidden border-b pb-16 pt-24">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="container relative mx-auto px-4">
            <Badge className="mb-4" variant="outline">
              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
              Base44 + Email Guide
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              How to Send Email from{" "}
              <span className="text-primary">Your Base44 App</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              You built it in Base44. Now users need a welcome email, a receipt,
              a password reset. Here's how to wire it up in 10 minutes — without
              writing email logic in your app.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span>10 min read</span>
              <span>&bull;</span>
              <span>Wraps Team</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-8">
              <div>
                <div className="font-mono text-2xl text-primary">10 min</div>
                <div className="text-muted-foreground text-sm">Setup</div>
              </div>
              <div>
                <div className="font-mono text-2xl text-primary">$0.10</div>
                <div className="text-muted-foreground text-sm">
                  Per 1K emails
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl text-primary">0 lines</div>
                <div className="text-muted-foreground text-sm">
                  Of email logic
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto max-w-4xl space-y-16 px-4 py-16">
          {/* What You're Building */}
          <section>
            <InfoCard
              icon={CheckCircle}
              title="What you're building"
              type="tip"
            >
              Your Base44 backend emits a behavioral event when something
              happens. A Wraps workflow catches it and sends the email. Your app
              has no email logic — it just says "this happened."
            </InfoCard>
          </section>

          {/* One-time setup */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">One-time setup</h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Run these in your local terminal, not inside Base44. You only do
              this once per AWS account.
            </p>

            <h3 className="mb-2 font-semibold text-lg">Set up AWS</h3>
            <p className="mb-4 text-muted-foreground">
              You need an AWS account and the AWS CLI configured. Free tier is
              enough for most apps.{" "}
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href="/docs/guides/aws-setup"
              >
                AWS setup guide →
              </Link>
            </p>

            <h3 className="mb-2 font-semibold text-lg">
              Deploy email infrastructure
            </h3>
            <p className="mb-2 text-muted-foreground">
              This sets up SES in your AWS account and verifies your sending
              domain.{" "}
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href="/docs/guides/domain-verification"
              >
                Domain verification guide →
              </Link>
            </p>
            <CodeBlock label="Terminal">
              {"npx @wraps.dev/cli email init"}
            </CodeBlock>

            <h3 className="mb-2 mt-8 font-semibold text-lg">
              Connect to the Wraps Platform
            </h3>
            <CodeBlock label="Terminal">
              {"npx @wraps.dev/cli platform connect"}
            </CodeBlock>
            <p className="mb-4 text-muted-foreground text-sm">
              Creates a cross-account IAM role so the Wraps Platform can send
              email through your SES when a workflow fires. Run this once —
              re-run{" "}
              <code className="rounded bg-muted px-1">
                wraps platform update-role
              </code>{" "}
              if you add new features later.
            </p>
          </section>

          {/* Get a Wraps API key */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Get a Wraps API key</h2>
            </div>
            <p className="mb-4 text-muted-foreground">
              Go to the{" "}
              <a
                className="text-primary underline-offset-4 hover:underline"
                href="https://app.wraps.dev"
                rel="noopener noreferrer"
                target="_blank"
              >
                Wraps dashboard
              </a>{" "}
              → <strong>Settings → API Keys</strong> and create a key named{" "}
              <code className="rounded bg-muted px-1">base44-app</code>.
            </p>

            <InfoCard
              icon={AlertTriangle}
              title="Copy the key now"
              type="warning"
            >
              The full key is only shown once. If you lose it, create a new one
              in the dashboard.
            </InfoCard>
          </section>

          {/* Add the key to Base44 */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Add the key to Base44</h2>
            </div>
            <p className="mb-4 text-muted-foreground">
              Go to <strong>Project → Settings → Server Secrets</strong> in
              Base44 and add:
            </p>
            <CodeBlock label="Base44 → Project → Settings → Server Secrets">
              {"WRAPS_API_KEY = wraps_a1b2c3d4....<hmac>"}
            </CodeBlock>

            <InfoCard
              icon={AlertTriangle}
              title="Don't put the key in frontend components"
              type="danger"
            >
              It runs in the browser — anyone in DevTools can read it. Server
              Secrets are only accessible to backend functions, never sent to
              the browser.
            </InfoCard>
          </section>

          {/* Emit events from your backend */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">
                Emit events from your backend
              </h2>
            </div>
            <p className="mb-4 text-muted-foreground">
              Install the SDK in your Base44 project:
            </p>
            <CodeBlock label="Terminal">
              {"npm install @wraps.dev/client"}
            </CodeBlock>

            <p className="mb-2 mt-6 text-muted-foreground">
              Create a shared client module:
            </p>
            <CodeBlock label="backend/lib/wraps.js">
              {`import { createPlatformClient } from "@wraps.dev/client";

export const wraps = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
});`}
            </CodeBlock>

            <p className="mb-2 mt-6 text-muted-foreground">
              Emit a behavioral event when something happens in your app:
            </p>
            <CodeBlock label="backend/functions/onSignup.js (example backend function)">
              {`import { wraps } from "../lib/wraps";

export async function onSignup({ email, name }) {
  // ... your signup logic ...

  await wraps.track("user.signed_up", {
    contactEmail: email,
    contactName: name,
    createIfMissing: true,
    properties: { source: "base44", plan: "free" },
  });
}`}
            </CodeBlock>

            <p className="mb-2 mt-6 text-muted-foreground">
              Your frontend calls the backend function — not Wraps directly:
            </p>
            <CodeBlock label="Call from your frontend (safe — calls your backend function)">
              {`// Frontend component — calls backend function, not Wraps directly
import { onSignup } from "@/backend/onSignup";

await onSignup({ email: user.email, name: user.name });`}
            </CodeBlock>
          </section>

          {/* Set up a workflow */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Workflow className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Set up a workflow in Wraps</h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              This is where you define what happens when the event fires — no
              code required.
            </p>

            <ol className="mb-6 space-y-4">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-muted-foreground text-xs">
                  1
                </span>
                <span className="text-muted-foreground">
                  Go to{" "}
                  <a
                    className="text-primary underline-offset-4 hover:underline"
                    href="https://app.wraps.dev"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Dashboard
                  </a>{" "}
                  → <strong>Workflows → New workflow</strong>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-muted-foreground text-xs">
                  2
                </span>
                <span className="text-muted-foreground">
                  Set the trigger to <strong>Event received</strong> →{" "}
                  <code className="rounded bg-muted px-1">user.signed_up</code>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-muted-foreground text-xs">
                  3
                </span>
                <span className="text-muted-foreground">
                  Add a step: <strong>Send email</strong> → choose your template
                </span>
              </li>
            </ol>

            <p className="text-muted-foreground text-sm">
              See the{" "}
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href="/docs/guides/custom-events"
              >
                Custom Events guide
              </Link>{" "}
              for the full reference.
            </p>
          </section>

          {/* Common events to track */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Common events to track</h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              Emit these from your Base44 backend functions and wire up a
              workflow for each one.
            </p>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold">Event</th>
                    <th className="px-4 py-3 text-left font-semibold">Sends</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["user.signed_up", "Welcome email"],
                    ["order.placed", "Order confirmation"],
                    ["password.reset_requested", "Reset email"],
                    ["subscription.cancelled", "Win-back email"],
                    ["trial.ending", "Upgrade nudge"],
                  ].map(([event, sends], i) => (
                    <tr
                      className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                      key={event}
                    >
                      <td className="px-4 py-3">
                        <code className="rounded bg-muted px-1 text-primary">
                          {event}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {sends}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* FAQ */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <HelpCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">FAQ</h2>
            </div>

            <div className="space-y-4">
              <Collapsible
                defaultOpen
                title="Do I need to deploy anything to AWS?"
              >
                <p className="text-muted-foreground text-sm">
                  Run{" "}
                  <code className="rounded bg-muted px-1">
                    wraps email init
                  </code>{" "}
                  to set up SES, then{" "}
                  <code className="rounded bg-muted px-1">
                    wraps platform connect
                  </code>{" "}
                  to give Wraps permission to send through your SES in
                  workflows. After that, your app calls{" "}
                  <code className="rounded bg-muted px-1">api.wraps.dev</code>{" "}
                  directly — no Lambda to deploy or manage.
                </p>
              </Collapsible>

              <Collapsible title="Can I call the SDK from Base44 frontend code?">
                <p className="text-muted-foreground text-sm">
                  No. Frontend runs in the browser — anyone in DevTools can read
                  the API key. The key must stay in Server Secrets, which are
                  only accessible to backend functions.
                </p>
              </Collapsible>

              <Collapsible title="Where do I add secrets in Base44?">
                <p className="text-muted-foreground text-sm">
                  Go to <strong>Project → Settings → Server Secrets</strong> in
                  Base44. These are environment variables that are only
                  accessible to backend functions — they're never sent to the
                  browser.
                </p>
              </Collapsible>

              <Collapsible title="What's the difference between emitting an event and sending an email?">
                <p className="text-muted-foreground text-sm">
                  Your app says "this happened" (
                  <code className="rounded bg-muted px-1">user.signed_up</code>,{" "}
                  <code className="rounded bg-muted px-1">order.placed</code>).
                  Wraps handles what to do — send an email, wait, branch on a
                  condition. Email logic lives in the workflow, not your code.
                </p>
              </Collapsible>

              <Collapsible title="What does this cost?">
                <p className="text-muted-foreground text-sm">
                  SES costs $0.10 per 1,000 emails. Events are included in your
                  Wraps plan. You pay AWS directly — there's no Wraps markup on
                  sending.
                </p>
              </Collapsible>

              <Collapsible title="How do I get out of the SES sandbox?">
                <p className="text-muted-foreground text-sm">
                  Request production access in the AWS console. Out of the box,
                  SES only lets you send to verified addresses. Production
                  access removes that restriction. See the{" "}
                  <Link
                    className="text-primary underline-offset-4 hover:underline"
                    href="/docs/guides/production-access"
                  >
                    production access guide
                  </Link>{" "}
                  for step-by-step instructions.
                </p>
              </Collapsible>
            </div>
          </section>

          {/* CTA */}
          <section className="rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-primary/5 p-8 text-center">
            <h3 className="mb-3 font-bold text-2xl">
              Ready to Connect Your Base44 App?
            </h3>
            <p className="mx-auto mb-6 max-w-lg text-muted-foreground">
              Emit events from your backend. Wraps workflows handle the rest —
              welcome emails, receipts, nudges. No email logic in your code.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/docs/guides/custom-events">
                  Custom Events Guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a
                  href="https://app.wraps.dev"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open Wraps Dashboard
                </a>
              </Button>
            </div>
          </section>

          {/* Related Articles */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <ExternalLink className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Related Articles</h2>
            </div>

            <div className="space-y-3">
              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="/blog/vibe-coding-email"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>
                  Sending Email from AI-Built Apps (Lovable, Bolt, Base44)
                </span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="/blog/lovable-send-email"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>How to Send Email from Your Lovable App</span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="/blog/bolt-send-email"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>How to Send Email from Your Bolt.new App</span>
              </a>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
