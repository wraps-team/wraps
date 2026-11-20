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
  Shield,
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
  headline: "How to Send Email from Your Replit App",
  description:
    "Your Replit app emits events. Wraps sends the emails. Set up automated email in 10 minutes — no email logic in your code, no Lambda deploy.",
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
    "@id": "https://wraps.dev/blog/replit-send-email",
  },
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Send Email from Your Replit App",
  description:
    "Emit behavioral events from your Replit Node.js server. Wraps workflows send the emails.",
  totalTime: "PT10M",
  step: [
    {
      "@type": "HowToStep",
      name: "Set up email infrastructure",
      text: "Run npx @wraps.dev/cli email init on your local machine to set up SES in your AWS account and verify your sending domain.",
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
      text: "Go to the Wraps dashboard at app.wraps.dev → Settings → API Keys and create a key named replit-app.",
    },
    {
      "@type": "HowToStep",
      name: "Add key to Replit",
      text: "In the Replit editor, click the lock icon in the left sidebar (Secrets tab) and add WRAPS_API_KEY.",
    },
    {
      "@type": "HowToStep",
      name: "Install @wraps.dev/client and emit events from your Node.js server",
      text: "Run npm install @wraps.dev/client in your Replit project and call wraps.track() from your server routes.",
    },
    {
      "@type": "HowToStep",
      name: "Set up a workflow in Wraps dashboard",
      text: "In the Wraps dashboard, create a workflow with an Event received trigger and a Send email step.",
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
        text: "Run wraps email init on your local machine to set up SES, then wraps platform connect to give Wraps permission to send through your SES in workflows. After that, your app calls api.wraps.dev directly via the SDK — no Lambda deploy, no Function URL to manage.",
      },
    },
    {
      "@type": "Question",
      name: "Can I call the SDK from Replit frontend code?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The frontend runs in the browser. Initialize the SDK in your server (Node.js) using Replit Secrets. Never use the API key in client-side code.",
      },
    },
    {
      "@type": "Question",
      name: "How do I add secrets in Replit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Click the lock icon in the Replit left sidebar. Key-value pairs added there are available via process.env in your server, and are never exposed to the browser or committed to the project.",
      },
    },
    {
      "@type": "Question",
      name: "What's the difference between emitting an event and sending an email?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your app says 'this happened'. Wraps handles what to do — send an email, wait, branch on conditions. Email logic stays in the workflow, not your code.",
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
        text: "Request production access in the AWS console. See the Wraps production access guide for step-by-step instructions.",
        url: "https://wraps.dev/docs/guides/production-access",
      },
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "How to Send Email from Your Replit App",
  description:
    "Your Replit app emits events. Wraps sends the emails. Set up automated email in 10 minutes — no email logic in your code, no Lambda deploy.",
  path: "/blog/replit-send-email",
  type: "article",
  publishedTime: "2026-05-06T00:00:00.000Z",
  authors: ["Wraps Team"],
  social: {
    description:
      "Emit a behavioral event from Replit. Wraps sends the email. No email logic in your app.",
    twitterCopy: {
      description:
        "Emit a behavioral event from Replit. Wraps sends the email.",
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
              Replit + Email Guide
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              How to Send Email from Your{" "}
              <span className="text-primary">Replit App</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              You built it in Replit. Now users need a welcome email, a receipt,
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
              Your Replit server emits a behavioral event when something
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
              <h2 className="font-bold text-2xl">
                One-time setup{" "}
                <span className="font-normal text-muted-foreground text-lg">
                  (local terminal)
                </span>
              </h2>
            </div>

            <InfoCard icon={AlertTriangle} title="Important" type="warning">
              <code className="rounded bg-warning/20 px-1">
                wraps email init
              </code>{" "}
              runs on your local machine. Replit doesn't need your AWS
              credentials — only your local terminal does, and only during this
              one-time setup.
            </InfoCard>

            <h3 className="mb-3 mt-8 font-semibold text-lg">Set up AWS</h3>
            <p className="mb-4 text-muted-foreground">
              Create an AWS account and configure the AWS CLI on your local
              machine.{" "}
              <Link
                className="text-primary underline underline-offset-2 hover:text-primary/80"
                href="/docs/guides/aws-setup"
              >
                AWS setup guide →
              </Link>
            </p>

            <h3 className="mb-3 mt-8 font-semibold text-lg">
              Deploy email infrastructure
            </h3>
            <p className="mb-4 text-muted-foreground">
              This sets up SES in your AWS account — where your emails actually
              send from. Your Replit app never touches AWS directly.{" "}
              <Link
                className="text-primary underline underline-offset-2 hover:text-primary/80"
                href="/docs/guides/domain-verification"
              >
                Domain verification guide →
              </Link>
            </p>
            <CodeBlock label="Terminal (your local machine)">
              {"npx @wraps.dev/cli email init"}
            </CodeBlock>

            <h3 className="mb-3 mt-8 font-semibold text-lg">
              Connect to the Wraps Platform
            </h3>
            <CodeBlock label="Terminal (your local machine)">
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
              Go to{" "}
              <a
                className="text-primary underline underline-offset-2 hover:text-primary/80"
                href="https://app.wraps.dev"
                rel="noopener noreferrer"
                target="_blank"
              >
                app.wraps.dev
              </a>{" "}
              → Settings → API Keys and create a key named{" "}
              <code className="rounded bg-muted px-1">replit-app</code>.
            </p>
            <InfoCard
              icon={AlertTriangle}
              title="Copy the key now — it's shown once"
              type="warning"
            >
              The full key is only displayed at creation time. Copy it before
              closing the dashboard.
            </InfoCard>
          </section>

          {/* Add key to Replit */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Add the key to Replit</h2>
            </div>
            <p className="mb-4 text-muted-foreground">
              In the Replit editor, click the lock icon in the left sidebar.
              Add:
            </p>
            <CodeBlock label="Replit Secrets tab (lock icon in sidebar)">
              {"WRAPS_API_KEY = wraps_a1b2c3d4....<hmac>"}
            </CodeBlock>
            <InfoCard
              icon={AlertTriangle}
              title="Don't hardcode the key in your Replit code"
              type="danger"
            >
              Replit Secrets are the right place: accessible via{" "}
              <code className="rounded bg-destructive/10 px-1">
                process.env
              </code>{" "}
              in your server, but never sent to the browser or committed to the
              project.
            </InfoCard>
          </section>

          {/* Emit events from your server */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">
                Emit events from your server
              </h2>
            </div>
            <p className="mb-4 text-muted-foreground">
              Install the SDK in your Replit project:
            </p>
            <CodeBlock label="Terminal (in Replit)">
              {"npm install @wraps.dev/client"}
            </CodeBlock>

            <p className="mb-4 mt-8 text-muted-foreground">
              Create a shared client module:
            </p>
            <CodeBlock label="lib/wraps.js">
              {`import { createPlatformClient } from "@wraps.dev/client";

export const wraps = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
});`}
            </CodeBlock>

            <p className="mb-4 mt-8 text-muted-foreground">
              Call <code className="rounded bg-muted px-1">wraps.track()</code>{" "}
              from your Express routes when something meaningful happens:
            </p>
            <CodeBlock label="server.js (add to your Express routes)">
              {`import { wraps } from "./lib/wraps.js";

// Emit when a user signs up
app.post("/api/signup", async (req, res) => {
  const { email, name } = req.body;
  // ... create user ...

  await wraps.track("user.signed_up", {
    contactEmail: email,
    contactName: name,
    createIfMissing: true,
    properties: { source: "replit", plan: "free" },
  });

  res.json({ success: true });
});

// Emit when an order is placed
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
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Set up a workflow in Wraps</h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              In the{" "}
              <a
                className="text-primary underline underline-offset-2 hover:text-primary/80"
                href="https://app.wraps.dev"
                rel="noopener noreferrer"
                target="_blank"
              >
                Wraps dashboard
              </a>
              :
            </p>
            <ol className="mb-6 space-y-3 text-muted-foreground">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-xs">
                  1
                </span>
                <span>Dashboard → Workflows → New workflow</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-xs">
                  2
                </span>
                <span>
                  Trigger: <strong>Event received</strong> →{" "}
                  <code className="rounded bg-muted px-1">user.signed_up</code>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-xs">
                  3
                </span>
                <span>
                  Step: <strong>Send email</strong> → choose template
                </span>
              </li>
            </ol>
            <p className="text-muted-foreground text-sm">
              See the{" "}
              <Link
                className="text-primary underline underline-offset-2 hover:text-primary/80"
                href="/docs/guides/custom-events"
              >
                custom events guide
              </Link>{" "}
              for the full workflow reference.
            </p>
          </section>

          {/* Common events */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Common events to track</h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              One event per meaningful moment. Wraps workflows handle the rest.
            </p>
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold">Event</th>
                    <th className="px-4 py-3 text-left font-semibold">Sends</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1">
                        user.signed_up
                      </code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Welcome email
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1">
                        order.placed
                      </code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Order confirmation
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1">
                        password.reset_requested
                      </code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Password reset
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1">
                        subscription.cancelled
                      </code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Win-back sequence
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1">
                        trial.ending
                      </code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Upgrade nudge
                    </td>
                  </tr>
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
                  on your local machine to set up SES, then{" "}
                  <code className="rounded bg-muted px-1">
                    wraps platform connect
                  </code>{" "}
                  to give Wraps permission to send through your SES in
                  workflows. After that, your app calls{" "}
                  <code className="rounded bg-muted px-1">api.wraps.dev</code>{" "}
                  via the SDK — no Lambda deploy, no Function URL to manage.
                </p>
              </Collapsible>

              <Collapsible title="Can I call the SDK from Replit frontend code?">
                <p className="text-muted-foreground text-sm">
                  No. The frontend runs in the browser. Initialize the SDK in
                  your server (Node.js) using Replit Secrets. Never use the API
                  key in client-side code.
                </p>
              </Collapsible>

              <Collapsible title="How do I add secrets in Replit?">
                <p className="text-muted-foreground text-sm">
                  Click the lock icon in the Replit left sidebar. Key-value
                  pairs added there are available via{" "}
                  <code className="rounded bg-muted px-1">process.env</code> in
                  your server, and are never exposed to the browser or committed
                  to the project.
                </p>
              </Collapsible>

              <Collapsible title="What's the difference between emitting an event and sending an email?">
                <p className="text-muted-foreground text-sm">
                  Your app says "this happened." Wraps handles what to do — send
                  an email, wait, branch on conditions. Email logic stays in the
                  workflow, not your code.
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
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
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
              Ready to Connect Your Replit App?
            </h3>
            <p className="mx-auto mb-6 max-w-lg text-muted-foreground">
              Emit your first event and let Wraps handle the rest. No email
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
