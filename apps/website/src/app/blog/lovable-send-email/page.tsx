import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  ArrowRight,
  CheckCircle,
  ExternalLink,
  HelpCircle,
  Key,
  ShieldAlert,
  Terminal,
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
  headline: "How to Send Email from Your Lovable App",
  description:
    "Your Lovable app emits events. Wraps sends the emails. Set up automated email for your Lovable app in 10 minutes — no email logic in your code, no Lambda deploy.",
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
    "@id": "https://wraps.dev/blog/lovable-send-email",
  },
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Send Email from Your Lovable App",
  description:
    "Connect your Lovable app to Wraps so behavioral events trigger automated emails.",
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
      text: "In the Wraps dashboard, go to Settings → API Keys and create a new key for your Lovable app.",
    },
    {
      "@type": "HowToStep",
      name: "Add the API key to Lovable",
      text: "In Supabase Dashboard → Edge Functions → Secrets, add WRAPS_API_KEY. Never use a VITE_ prefix — that exposes the key in browser JS.",
    },
    {
      "@type": "HowToStep",
      name: "Emit events from a Supabase Edge Function",
      text: "Create an Edge Function that calls POST https://api.wraps.dev/v1/events/ with the event name and contact email.",
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
        text: "Run npx @wraps.dev/cli email init to set up SES, then wraps platform connect to give Wraps permission to send through your SES in workflows. After that, your app calls api.wraps.dev directly — no Lambda deploy needed.",
      },
    },
    {
      "@type": "Question",
      name: "Can I call the Wraps API directly from my Lovable frontend?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Lovable apps use Vite — any variable prefixed with VITE_ gets bundled into browser JS. The API key must stay in a Supabase Edge Function where it's only accessible server-side.",
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
        text: "AWS SES costs $0.10 per 1,000 emails on à la carte ($0.16 on the Essentials plan new accounts start on). Events are included in your Wraps plan. You pay AWS directly for sending — no Wraps markup.",
      },
    },
    {
      "@type": "Question",
      name: "Can Lovable's AI write the Edge Function for me?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Tell it: 'Create a Supabase Edge Function called track-event that reads WRAPS_API_KEY from env and POSTs to https://api.wraps.dev/v1/events/'. Set the secret in the Supabase dashboard, not hardcoded.",
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
  title: "How to Send Email from Your Lovable App",
  description:
    "Your Lovable app emits events. Wraps sends the emails. Set up automated email for your Lovable app in 10 minutes — no email logic in your code, no Lambda deploy.",
  path: "/blog/lovable-send-email",
  type: "article",
  publishedTime: "2026-05-06T00:00:00.000Z",
  authors: ["Wraps Team"],
  social: {
    description:
      "Emit a behavioral event from Lovable. Wraps sends the email. No email logic in your app.",
    twitterCopy: {
      description:
        "Emit a behavioral event from Lovable. Wraps sends the email.",
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
              Lovable + Email Guide
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              How to Send Email from{" "}
              <span className="text-primary">Your Lovable App</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              You built it in Lovable. Now users need a welcome email, a
              receipt, a password reset. Here's how to wire it up in 10 minutes
              — without writing a single line of email logic in your app.
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
                  Per 1,000 emails (à la carte)
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
              Your Lovable app emits a behavioral event when something happens
              (user signed up, order placed, payment failed). A Wraps workflow
              catches it and sends the email. Your app has no email logic — it
              just says "this happened."
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
              These commands run on your local machine, not inside Lovable. You
              only do this once.
            </p>

            <h3 className="mb-3 font-semibold text-xl">Set up AWS</h3>
            <p className="mb-4 text-muted-foreground">
              If you already have AWS configured, skip this.{" "}
              <Link
                className="text-primary underline underline-offset-4 hover:no-underline"
                href="/docs/guides/aws-setup"
              >
                AWS setup guide →
              </Link>
            </p>

            <h3 className="mb-3 font-semibold text-xl">
              Deploy email infrastructure
            </h3>
            <CodeBlock label="Terminal">
              {"npx @wraps.dev/cli email init"}
            </CodeBlock>
            <p className="mb-6 text-muted-foreground text-sm">
              Sets up SES in your account and verifies your sending domain. This
              is where your emails actually send from — your AWS, your domain.{" "}
              <Link
                className="text-primary underline underline-offset-4 hover:no-underline"
                href="/docs/guides/domain-verification"
              >
                Domain verification guide →
              </Link>
            </p>

            <h3 className="mb-3 font-semibold text-xl">
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
                <Key className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Get a Wraps API key</h2>
            </div>
            <p className="mb-4 text-muted-foreground">
              In the{" "}
              <a
                className="text-primary underline underline-offset-4 hover:no-underline"
                href="https://app.wraps.dev"
                rel="noopener noreferrer"
                target="_blank"
              >
                Wraps dashboard
              </a>
              , go to <strong>Settings → API Keys</strong> and create a new key.
              Name it something like{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                lovable-app
              </code>
              .
            </p>
            <InfoCard
              icon={Key}
              title="Copy the key now — it's shown once."
              type="warning"
            >
              If you lose it, revoke it in the dashboard and create a new one.
            </InfoCard>
          </section>

          {/* Add key to Lovable */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <ShieldAlert className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">
                Add the key to Lovable (Supabase)
              </h2>
            </div>
            <p className="mb-4 text-muted-foreground">
              Lovable apps run on Supabase. Go to your{" "}
              <strong>Supabase Dashboard → Edge Functions → Secrets</strong> and
              add:
            </p>
            <CodeBlock label="Supabase Edge Functions → Secrets">
              {"WRAPS_API_KEY = wraps_a1b2c3d4....<hmac>"}
            </CodeBlock>
            <InfoCard
              icon={ShieldAlert}
              title="Never put the key in your Lovable frontend code."
              type="danger"
            >
              Lovable apps use Vite — any variable prefixed with{" "}
              <code className="rounded bg-destructive/20 px-1">VITE_</code> gets
              bundled into browser JavaScript and is readable by anyone in
              DevTools. Edge Function Secrets are only accessible server-side.
            </InfoCard>
          </section>

          {/* Emit events from your app */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Emit events from your app</h2>
            </div>

            <h3 className="mb-3 font-semibold text-xl">
              Create a Supabase Edge Function
            </h3>
            <p className="mb-4 text-muted-foreground">
              Create a{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                track-event
              </code>{" "}
              Edge Function. Lovable's AI can write this for you — just describe
              what you want.
            </p>
            <CodeBlock label="supabase/functions/track-event/index.ts">
              {`import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const { name, contactEmail, contactName, properties } = await req.json();

  const res = await fetch("https://api.wraps.dev/v1/events/", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${Deno.env.get("WRAPS_API_KEY")}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      contactEmail,
      contactName,
      createIfMissing: true,
      properties,
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});`}
            </CodeBlock>

            <h3 className="mb-3 mt-8 font-semibold text-xl">
              Call it when things happen in your app
            </h3>
            <p className="mb-4 text-muted-foreground">
              From your Lovable frontend, call the Edge Function when events
              occur:
            </p>
            <CodeBlock label="Frontend — emit events via your Edge Function">
              {`import { supabase } from "@/lib/supabase";

// When a user signs up
await supabase.functions.invoke("track-event", {
  body: {
    name: "user.signed_up",
    contactEmail: user.email,
    contactName: user.name,
    properties: { plan: "free", source: "lovable" },
  },
});

// When an order is placed
await supabase.functions.invoke("track-event", {
  body: {
    name: "order.placed",
    contactEmail: user.email,
    properties: { orderId: order.id, amount: order.total },
  },
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
              In the Wraps dashboard, create a workflow with an{" "}
              <strong>event trigger</strong> set to your event name (e.g.{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">
                user.signed_up
              </code>
              ). Add a Send Email step with your template. That's it — every
              time your app emits that event, Wraps sends the email.
            </p>
            <p className="mb-6 text-muted-foreground text-sm">
              <Link
                className="text-primary underline underline-offset-4 hover:no-underline"
                href="/docs/guides/custom-events"
              >
                Custom events guide →
              </Link>
            </p>

            <ol className="space-y-3">
              {[
                "Dashboard → Workflows → New workflow",
                "Trigger: Event received → event name: user.signed_up",
                "Step: Send email → choose your template",
              ].map((step, i) => (
                <li
                  className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4"
                  key={step}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-primary-foreground text-xs">
                    {i + 1}
                  </span>
                  <span className="text-foreground/80">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Common events to track */}
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
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Event
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Triggers
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["user.signed_up", "Welcome email"],
                    ["order.placed", "Order confirmation"],
                    ["password.reset_requested", "Password reset email"],
                    ["subscription.cancelled", "Win-back sequence"],
                    ["trial.ending", "Upgrade nudge"],
                  ].map(([event, trigger], i) => (
                    <tr
                      className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                      key={event}
                    >
                      <td className="px-4 py-3">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
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
                  directly — no Lambda deploy needed.
                </p>
              </Collapsible>

              <Collapsible title="Can I call the Wraps API directly from my Lovable frontend?">
                <p className="text-muted-foreground text-sm">
                  No. Lovable apps use Vite — any variable prefixed with{" "}
                  <code className="rounded bg-muted px-1">VITE_</code> gets
                  bundled into browser JS. The API key must stay in a Supabase
                  Edge Function where it's only accessible server-side.
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
                  AWS SES costs $0.10 per 1,000 emails on à la carte ($0.16 on
                  the Essentials plan new accounts start on). Events are
                  included in your Wraps plan. You pay AWS directly for sending — no Wraps
                  markup.
                </p>
              </Collapsible>

              <Collapsible title="Can Lovable's AI write the Edge Function for me?">
                <p className="text-muted-foreground text-sm">
                  Yes. Tell it: "Create a Supabase Edge Function called
                  track-event that reads WRAPS_API_KEY from env and POSTs to
                  https://api.wraps.dev/v1/events/". Set the secret in the
                  Supabase dashboard, not hardcoded.
                </p>
              </Collapsible>

              <Collapsible title="How do I get out of the SES sandbox?">
                <p className="text-muted-foreground text-sm">
                  Request production access in the AWS console. See the{" "}
                  <Link
                    className="text-primary underline underline-offset-4 hover:no-underline"
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
              Ready to Connect Your Lovable App?
            </h3>
            <p className="mx-auto mb-6 max-w-lg text-muted-foreground">
              Emit events from Lovable. Wraps sends the emails. Your app stays
              clean.
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
                <span>Sending Email from AI-Built Apps</span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="/blog/bolt-send-email"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>How to Send Email from Your Bolt.new App</span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="/blog/supabase-email-guide"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>4 Email Flows Your Supabase App Needs</span>
              </a>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
