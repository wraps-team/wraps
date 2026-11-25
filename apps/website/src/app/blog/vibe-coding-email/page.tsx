import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  ArrowRight,
  HelpCircle,
  ShieldAlert,
  Terminal,
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
  headline: "Sending Email from AI-Built Apps (Lovable, Bolt, Base44, Replit)",
  description:
    "Your AI-built app emits events. Wraps workflows send the emails. Connect any vibe-coded app to automated email workflows in 10 minutes — no email logic in your code.",
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
    "@id": "https://wraps.dev/blog/vibe-coding-email",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What's the difference between emitting an event and sending an email?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your app says 'this happened' (user.signed_up, order.placed). Wraps decides what to do — send a welcome email, wait 3 days, send a follow-up, branch based on whether the user clicked. Email logic lives in the workflow, not your code. You can change the email content without touching your app.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need to deploy anything to AWS?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Run npx @wraps.dev/cli email init to set up SES, then wraps platform connect to give Wraps permission to send through your SES in workflows. After that, your app calls api.wraps.dev directly — no Lambda deploy, no Lambda URL to manage.",
      },
    },
    {
      "@type": "Question",
      name: "Can I call the Wraps API directly from my frontend?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Frontend code runs in the browser — anyone can open DevTools and steal an exposed API key. The key must live in a server function or backend secret. Each platform guide shows the correct approach.",
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
      name: "What can I do in a workflow that I can't do with a direct send?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Delays and sequences (wait 1 day, then send follow-up), branching (different email if user clicked vs didn't), conditions (only send if still on free plan), multiple steps, and visual editing without code deploys.",
      },
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Sending Email from AI-Built Apps (Lovable, Bolt, Base44, Replit)",
  description:
    "Your AI-built app emits events. Wraps sends the emails. Connect any vibe-coded app to automated email workflows in 10 minutes — no email logic in your code.",
  path: "/blog/vibe-coding-email",
  type: "article",
  publishedTime: "2026-05-06T00:00:00.000Z",
  authors: ["Wraps Team"],
  social: {
    title: "Sending Email from AI-Built Apps",
    description:
      "Emit behavioral events from your AI-built app. Wraps workflows send the emails. Works with Lovable, Bolt, Base44, and Replit.",
    twitterCopy: {
      description:
        "Emit behavioral events from your AI-built app. Wraps workflows send the emails.",
    },
  },
});

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />

      <div className="min-h-screen bg-background">
        <LandingNavbar />

        {/* Hero Section */}
        <header className="relative overflow-hidden border-b pb-16 pt-24">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="container relative mx-auto px-4">
            <Badge className="mb-4" variant="outline">
              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
              Vibe Coding + Email Guide
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              Sending Email from{" "}
              <span className="text-primary">AI-Built Apps</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              You shipped an app with Lovable, Bolt, Base44, or Replit. Now
              users need automated emails. Here's the right way to wire it up —
              your app emits events, Wraps sends the emails, zero email logic in
              your code.
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
                <div className="font-mono text-2xl text-primary">4</div>
                <div className="text-muted-foreground text-sm">
                  Platforms supported
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto max-w-4xl space-y-16 px-4 py-16">
          {/* Section 1 — Don't Put Email Logic in Your App */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <ShieldAlert className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">
                Don't Put Email Logic in Your App
              </h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              The instinct is to add a "send email" function to your app.
              Problem: now email logic is scattered across your codebase, you
              need to redeploy to change an email, and you're managing a mail
              server from within application code.
            </p>

            <InfoCard icon={ShieldAlert} title="The real trap" type="danger">
              Every email becomes a code change. Welcome email tweaks, subject
              line tests, timing changes — all require a deploy. Email logic
              belongs in a workflow tool, not your app.
            </InfoCard>
          </section>

          {/* Section 2 — The Right Way */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Terminal className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">
                Emit Events. Let Workflows Handle the Email.
              </h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Your app does one thing: tell Wraps what happened. A Wraps
              workflow handles everything else — what email to send, when to
              send it, what to do if the user doesn't engage.
            </p>

            <h3 className="mb-4 font-semibold text-xl">
              The core pattern (same across all platforms)
            </h3>
            <CodeBlock label="From your server function — that's it">
              {`// From your server function — that's it
await wraps.track("user.signed_up", {
  contactEmail: user.email,
  contactName: user.name,
  createIfMissing: true,
  properties: { plan: "free", source: "lovable" },
});`}
            </CodeBlock>
            <p className="text-muted-foreground text-sm">
              That's the entire integration. Your app has no email templates, no
              send logic, no SMTP configuration. Change the welcome email
              subject line? Do it in the Wraps dashboard. Add a 3-day follow-up?
              Add a step in the workflow. No redeploy.
            </p>
          </section>

          {/* Section 3 — How It Works */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">How It Works</h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Four steps — your event in, an email out, without touching your
              app code again.
            </p>

            <div className="mb-8 grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary font-mono text-xs font-bold">
                  1
                </div>
                <div>
                  <h4 className="font-medium">Your app emits an event</h4>
                  <p className="mt-1 text-muted-foreground text-sm">
                    POST to api.wraps.dev/v1/events/ with an event name, contact
                    email, and optional properties.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary font-mono text-xs font-bold">
                  2
                </div>
                <div>
                  <h4 className="font-medium">Wraps stores it</h4>
                  <p className="mt-1 text-muted-foreground text-sm">
                    The event is recorded on the contact's timeline. Every
                    event, every contact, all in one place.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary font-mono text-xs font-bold">
                  3
                </div>
                <div>
                  <h4 className="font-medium">Workflows trigger</h4>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Any workflow with a matching event trigger starts an
                    execution — delays, branches, conditions, sequences.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary font-mono text-xs font-bold">
                  4
                </div>
                <div>
                  <h4 className="font-medium">Email sends via your SES</h4>
                  <p className="mt-1 text-muted-foreground text-sm">
                    The email goes through SES in your AWS account — your
                    domain, with sending billed by AWS directly.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-muted-foreground text-sm">
              One-time setup: run{" "}
              <code className="rounded bg-muted px-1">
                npx @wraps.dev/cli email init
              </code>{" "}
              to set up SES, then{" "}
              <code className="rounded bg-muted px-1">
                wraps platform connect
              </code>{" "}
              to give Wraps permission to send through your SES in workflows.
              After that, your app calls api.wraps.dev directly — no Lambda, no
              infrastructure to manage. API keys live in{" "}
              <a
                className="text-primary underline-offset-4 hover:underline"
                href="https://app.wraps.dev"
                rel="noreferrer"
                target="_blank"
              >
                app.wraps.dev
              </a>
              .
            </p>
          </section>

          {/* Section 4 — Platform Guides */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Pick Your Platform</h2>
            </div>
            <p className="mb-8 text-lg text-muted-foreground">
              Each platform has its own mechanism for running server-side code
              and storing secrets. Pick the guide for your platform.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Link
                className="group flex flex-col gap-3 rounded-xl border bg-muted/30 p-5 transition-colors hover:bg-muted/50 hover:border-primary/50"
                href="/blog/lovable-send-email"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-lg">Lovable</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-muted-foreground text-sm">
                  Supabase Edge Function → direct fetch to api.wraps.dev
                </p>
                <span className="mt-auto text-primary text-sm font-medium">
                  Read the Lovable guide →
                </span>
              </Link>

              <Link
                className="group flex flex-col gap-3 rounded-xl border bg-muted/30 p-5 transition-colors hover:bg-muted/50 hover:border-primary/50"
                href="/blog/bolt-send-email"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-lg">Bolt.new</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-muted-foreground text-sm">
                  Node.js server + @wraps.dev/client SDK
                </p>
                <span className="mt-auto text-primary text-sm font-medium">
                  Read the Bolt.new guide →
                </span>
              </Link>

              <Link
                className="group flex flex-col gap-3 rounded-xl border bg-muted/30 p-5 transition-colors hover:bg-muted/50 hover:border-primary/50"
                href="/blog/base44-send-email"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-lg">Base44</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-muted-foreground text-sm">
                  Backend function + @wraps.dev/client SDK
                </p>
                <span className="mt-auto text-primary text-sm font-medium">
                  Read the Base44 guide →
                </span>
              </Link>

              <Link
                className="group flex flex-col gap-3 rounded-xl border bg-muted/30 p-5 transition-colors hover:bg-muted/50 hover:border-primary/50"
                href="/blog/replit-send-email"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-lg">Replit</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-muted-foreground text-sm">
                  Node.js server + @wraps.dev/client SDK
                </p>
                <span className="mt-auto text-primary text-sm font-medium">
                  Read the Replit guide →
                </span>
              </Link>
            </div>
          </section>

          {/* Section 5 — FAQ */}
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
                title="What's the difference between emitting an event and sending an email?"
              >
                <p className="text-muted-foreground text-sm">
                  Your app says "this happened" (user.signed_up, order.placed).
                  Wraps decides what to do — send a welcome email, wait 3 days,
                  send a follow-up, branch based on whether the user clicked.
                  Email logic lives in the workflow, not your code. You can
                  change the email content without touching your app.
                </p>
              </Collapsible>

              <Collapsible title="Do I need to deploy anything to AWS?">
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
                  workflows. After that, your app calls api.wraps.dev directly —
                  no Lambda deploy, no Lambda URL to manage.
                </p>
              </Collapsible>

              <Collapsible title="Can I call the Wraps API directly from my frontend?">
                <p className="text-muted-foreground text-sm">
                  No. Frontend code runs in the browser — anyone can open
                  DevTools and steal an exposed API key. The key must live in a
                  server function or backend secret. Each platform guide shows
                  the correct approach.
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

              <Collapsible title="What can I do in a workflow that I can't do with a direct send?">
                <p className="text-muted-foreground text-sm">
                  Delays and sequences (wait 1 day, then send follow-up),
                  branching (different email if user clicked vs didn't),
                  conditions (only send if still on free plan), multiple steps,
                  and visual editing without code deploys.
                </p>
              </Collapsible>
            </div>
          </section>

          {/* CTA */}
          <section className="rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-primary/5 p-8 text-center">
            <h3 className="mb-3 font-bold text-2xl">Start Emitting Events</h3>
            <p className="mx-auto mb-6 max-w-lg text-muted-foreground">
              One event call. Your AWS account for sending. Works with any
              platform.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/docs/guides/custom-events">
                  Custom Events Guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link
                  href="https://app.wraps.dev"
                  rel="noreferrer"
                  target="_blank"
                >
                  Open Wraps Dashboard
                </Link>
              </Button>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
