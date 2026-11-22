import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  ArrowRight,
  CheckCircle,
  ExternalLink,
  HelpCircle,
  KeyRound,
  ShieldAlert,
  Terminal,
  Workflow,
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
  headline: "How to Send Email from Your Bolt.new App",
  description:
    "Your Bolt.new app emits events. Wraps sends the emails. Set up automated email for your Bolt app in 10 minutes — no email logic in your code, no Lambda deploy.",
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
    "@id": "https://wraps.dev/blog/bolt-send-email",
  },
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Send Email from Your Bolt.new App",
  description:
    "Connect your Bolt.new app to Wraps so behavioral events trigger automated emails.",
  totalTime: "PT10M",
  step: [
    {
      "@type": "HowToStep",
      name: "Set up email infrastructure",
      text: "Run npx @wraps.dev/cli email init to deploy SES to your AWS account.",
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
      text: "In the Wraps dashboard, go to Settings → API Keys and create a new key for your Bolt.new app.",
    },
    {
      "@type": "HowToStep",
      name: "Add the API key to your .env file",
      text: "Add WRAPS_API_KEY to your server-side .env file. Never use a VITE_ prefix — that exposes the key in browser JS.",
    },
    {
      "@type": "HowToStep",
      name: "Install @wraps.dev/client and emit events",
      text: "Install the SDK, then call client.track() from your server routes when things happen in your app.",
    },
    {
      "@type": "HowToStep",
      name: "Set up a workflow in Wraps",
      text: "In the Wraps dashboard, create a workflow with an event trigger matching your event name. Add a Send Email step.",
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
        text: "Run npx @wraps.dev/cli email init to set up SES, then wraps platform connect to give Wraps permission to send through your SES in workflows. After that, your app calls api.wraps.dev directly via the SDK — no Lambda deploy needed.",
      },
    },
    {
      "@type": "Question",
      name: "Can I call the Wraps client SDK from my Bolt.new frontend?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Bolt.new uses Vite — any VITE_ variable gets bundled into browser JS. Initialize the SDK on the server (in your Express routes) with process.env.WRAPS_API_KEY, never in client components.",
      },
    },
    {
      "@type": "Question",
      name: "Does Bolt.new have a backend I can use?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Bolt.new generates full-stack apps with a Node.js backend. Add the @wraps.dev/client SDK to your server and call client.track() from any route.",
      },
    },
    {
      "@type": "Question",
      name: "What's the difference between emitting an event and sending an email?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your app says 'this happened' (user.signed_up). Wraps decides what to do — send a welcome email, wait 3 days, send a follow-up, branch based on activity. Email logic lives in the workflow, not your code.",
      },
    },
    {
      "@type": "Question",
      name: "What does this cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AWS SES costs $0.10 per 1,000 emails. Events are included in your Wraps plan. You pay AWS directly for sending.",
      },
    },
    {
      "@type": "Question",
      name: "How do I get out of the SES sandbox?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Request production access in the AWS console. See the Wraps production access guide.",
        url: "https://wraps.dev/docs/guides/production-access",
      },
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "How to Send Email from Your Bolt.new App",
  description:
    "Your Bolt.new app emits events. Wraps sends the emails. Set up automated email for your Bolt app in 10 minutes — no email logic in your code, no Lambda deploy.",
  path: "/blog/bolt-send-email",
  type: "article",
  publishedTime: "2026-05-06T00:00:00.000Z",
  authors: ["Wraps Team"],
  social: {
    description:
      "Emit a behavioral event from Bolt. Wraps sends the email. No email logic in your app.",
    twitterCopy: {
      description: "Emit a behavioral event from Bolt. Wraps sends the email.",
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
              Bolt.new + Email Guide
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              How to Send Email from Your{" "}
              <span className="text-primary">Bolt.new App</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              You built it in Bolt. Now users need a welcome email, a receipt, a
              password reset. Here's how to wire it up in 10 minutes — without
              writing a single line of email logic in your app.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span>10 min read</span>
              <span>&bull;</span>
              <span>Wraps Team</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-8">
              <div>
                <div className="font-mono text-2xl text-primary">10 min</div>
                <div className="text-muted-foreground text-sm">Setup time</div>
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
                  Of email logic in your app
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
              Your Bolt.new server emits a behavioral event when something
              happens. A Wraps workflow catches it and sends the email. Your app
              has no email logic — it just says "this happened."
            </InfoCard>
          </section>

          {/* One-time setup */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Terminal className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">One-time setup</h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Run these in your local terminal — not inside Bolt.new.
            </p>

            <h3 className="mb-3 font-semibold text-xl">Set up AWS</h3>
            <p className="mb-4 text-muted-foreground">
              You need an AWS account with the CLI configured. Free tier is
              enough for most apps.{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href="/docs/guides/aws-setup"
              >
                AWS setup guide
              </Link>
            </p>

            <h3 className="mb-3 mt-8 font-semibold text-xl">
              Deploy email infrastructure
            </h3>
            <p className="mb-4 text-muted-foreground">
              Sets up SES in your account and verifies your sending domain.{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href="/docs/guides/domain-verification"
              >
                Domain verification guide
              </Link>
            </p>
            <CodeBlock label="Terminal">
              {"npx @wraps.dev/cli email init"}
            </CodeBlock>

            <h3 className="mb-3 mt-8 font-semibold text-xl">
              Connect to the Wraps Platform
            </h3>
            <CodeBlock label="Terminal">
              {"npx @wraps.dev/cli platform connect"}
            </CodeBlock>
            <p className="mb-6 text-muted-foreground text-sm">
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
              In the{" "}
              <a
                className="text-primary underline underline-offset-4"
                href="https://app.wraps.dev"
                rel="noopener noreferrer"
                target="_blank"
              >
                Wraps dashboard
              </a>
              , go to{" "}
              <strong className="text-foreground">Settings → API Keys</strong>{" "}
              and create a new key named{" "}
              <code className="rounded bg-muted px-1">bolt-app</code>.
            </p>
            <InfoCard
              icon={ShieldAlert}
              title="Copy the key now — shown once."
              type="warning"
            >
              Once you close the dialog the full key is gone. If you lose it,
              delete it from the dashboard and create a new one.
            </InfoCard>
          </section>

          {/* Add key to .env */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Terminal className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">
                Add the key to Bolt.new (.env)
              </h2>
            </div>
            <p className="mb-4 text-muted-foreground">
              Add it to your server-side{" "}
              <code className="rounded bg-muted px-1">.env</code> file — no{" "}
              <code className="rounded bg-muted px-1">VITE_</code> prefix.
            </p>

            <InfoCard
              icon={ShieldAlert}
              title="Never use VITE_WRAPS_API_KEY"
              type="danger"
            >
              Bolt.new uses Vite —{" "}
              <code className="rounded bg-muted px-1">VITE_</code> variables get
              bundled into browser JS and are readable in DevTools. Server-side{" "}
              <code className="rounded bg-muted px-1">.env</code> variables are
              only accessible in your Node.js routes.
            </InfoCard>

            <CodeBlock label=".env (server-side only)">
              {"WRAPS_API_KEY=wraps_a1b2c3d4....<hmac>"}
            </CodeBlock>
          </section>

          {/* Emit events from your server */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Terminal className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">
                Emit events from your server
              </h2>
            </div>

            <h3 className="mb-3 font-semibold text-xl">Install the SDK</h3>
            <CodeBlock label="Terminal">
              {"npm install @wraps.dev/client"}
            </CodeBlock>

            <h3 className="mb-3 mt-8 font-semibold text-xl">
              Initialize once, use anywhere
            </h3>
            <CodeBlock label="server/lib/wraps.ts">
              {`import { createPlatformClient } from "@wraps.dev/client";

export const wraps = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY!,
});`}
            </CodeBlock>

            <h3 className="mb-3 mt-8 font-semibold text-xl">
              Emit events from your routes
            </h3>
            <CodeBlock label="server/routes/auth.ts (or wherever events happen)">
              {`import { wraps } from "../lib/wraps";

// When a user signs up
app.post("/api/signup", async (req, res) => {
  const { email, name } = req.body;
  // ... create user ...

  await wraps.track("user.signed_up", {
    contactEmail: email,
    contactName: name,
    createIfMissing: true,
    properties: { plan: "free", source: "bolt" },
  });

  res.json({ success: true });
});

// When an order is placed
app.post("/api/orders", async (req, res) => {
  // ... process order ...

  await wraps.track("order.placed", {
    contactEmail: req.user.email,
    properties: { orderId: order.id, amount: order.total },
  });

  res.json({ order });
});`}
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
              Email logic lives in the Wraps dashboard, not your code.
            </p>

            <ol className="mb-6 space-y-4">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
                  1
                </span>
                <span className="text-muted-foreground">
                  Dashboard → Workflows → New workflow
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
                  2
                </span>
                <span className="text-muted-foreground">
                  Trigger:{" "}
                  <strong className="text-foreground">Event received</strong> →
                  event name:{" "}
                  <code className="rounded bg-muted px-1">user.signed_up</code>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
                  3
                </span>
                <span className="text-muted-foreground">
                  Step: <strong className="text-foreground">Send email</strong>{" "}
                  → choose your template
                </span>
              </li>
            </ol>

            <p className="text-muted-foreground text-sm">
              See the{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href="/docs/guides/custom-events"
              >
                custom events guide
              </Link>{" "}
              for full workflow reference.
            </p>
          </section>

          {/* Common events */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Common events to track</h2>
            </div>

            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Event
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Triggers
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    ["user.signed_up", "Welcome email"],
                    ["order.placed", "Order confirmation"],
                    ["password.reset_requested", "Password reset"],
                    ["subscription.cancelled", "Win-back sequence"],
                    ["trial.ending", "Upgrade nudge"],
                  ].map(([event, trigger]) => (
                    <tr
                      className="transition-colors hover:bg-muted/30"
                      key={event}
                    >
                      <td className="px-4 py-3">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-primary">
                          {event}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {trigger}
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
                    npx @wraps.dev/cli email init
                  </code>{" "}
                  to set up SES, then{" "}
                  <code className="rounded bg-muted px-1">
                    wraps platform connect
                  </code>{" "}
                  to give Wraps permission to send through your SES in
                  workflows. After that, your app calls{" "}
                  <code className="rounded bg-muted px-1">api.wraps.dev</code>{" "}
                  via the SDK — no Lambda deploy needed.
                </p>
              </Collapsible>

              <Collapsible title="Can I call the Wraps client SDK from my Bolt.new frontend?">
                <p className="text-muted-foreground text-sm">
                  No. Bolt.new uses Vite — any{" "}
                  <code className="rounded bg-muted px-1">VITE_</code> variable
                  gets bundled into browser JS. Initialize the SDK on the server
                  (in your Express routes) with{" "}
                  <code className="rounded bg-muted px-1">
                    process.env.WRAPS_API_KEY
                  </code>
                  , never in client components.
                </p>
              </Collapsible>

              <Collapsible title="Does Bolt.new have a backend I can use?">
                <p className="text-muted-foreground text-sm">
                  Yes. Bolt.new generates full-stack apps with a Node.js
                  backend. Add the{" "}
                  <code className="rounded bg-muted px-1">
                    @wraps.dev/client
                  </code>{" "}
                  SDK to your server and call{" "}
                  <code className="rounded bg-muted px-1">client.track()</code>{" "}
                  from any route.
                </p>
              </Collapsible>

              <Collapsible title="What's the difference between emitting an event and sending an email?">
                <p className="text-muted-foreground text-sm">
                  Your app says "this happened" (
                  <code className="rounded bg-muted px-1">user.signed_up</code>
                  ). Wraps decides what to do — send a welcome email, wait 3
                  days, send a follow-up, branch based on activity. Email logic
                  lives in the workflow, not your code.
                </p>
              </Collapsible>

              <Collapsible title="What does this cost?">
                <p className="text-muted-foreground text-sm">
                  AWS SES costs $0.10 per 1,000 emails. Events are included in
                  your Wraps plan. You pay AWS directly for sending.
                </p>
              </Collapsible>

              <Collapsible title="How do I get out of the SES sandbox?">
                <p className="text-muted-foreground text-sm">
                  Request production access in the AWS console. See the{" "}
                  <Link
                    className="text-primary underline underline-offset-4"
                    href="/docs/guides/production-access"
                  >
                    Wraps production access guide
                  </Link>{" "}
                  for step-by-step instructions.
                </p>
              </Collapsible>
            </div>
          </section>

          {/* CTA */}
          <section className="rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-primary/5 p-8 text-center">
            <h3 className="mb-3 font-bold text-2xl">
              Ready to Connect Your Bolt.new App?
            </h3>
            <p className="mx-auto mb-6 max-w-lg text-muted-foreground">
              Emit an event from your server. Wraps sends the email. No email
              logic in your code.
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
                href="/blog/supabase-email-guide"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>
                  4 Email Flows Your Supabase App Needs Before Going Live
                </span>
              </a>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
