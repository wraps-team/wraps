import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle,
  CircleDollarSign,
  ExternalLink,
  HelpCircle,
  KeyRound,
  Megaphone,
  RefreshCw,
  Server,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CodeBlock, Collapsible } from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "4 Email Flows Your Supabase App Needs Before Going Live",
  description:
    "Supabase handles auth and database. Email beyond magic links? That's on you. Here are the 4 email flows every production Supabase app needs and how to set each one up.",
  image: "https://wraps.dev/blog/supabase-email-guide.webp",
  datePublished: "2026-03-13T00:00:00.000Z",
  dateModified: "2026-03-13T00:00:00.000Z",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
    description:
      "Email infrastructure tools that deploy to your AWS account. Production-ready SES, templates, broadcasts, and workflows.",
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
    "@id": "https://wraps.dev/blog/supabase-email-guide",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can I just use Resend with Supabase?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Resend is a solid choice for transactional email. The tradeoff: you start at $20/mo for 50K emails (vs ~$5 on SES), overages are $0.90/1K, you don't own the sending infrastructure, and you'll need a separate tool for broadcasts and automations.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need an AWS account to use SES with Supabase?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. AWS SES requires an AWS account. The upside: you own the infrastructure, pay AWS directly at $0.10/1K emails, and keep everything if you switch platforms.",
      },
    },
    {
      "@type": "Question",
      name: "How do I configure Supabase Auth to use custom SMTP?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "In the Supabase dashboard, go to Authentication > SMTP Settings. Enter your SMTP host, port, username, and password. For SES, use your SES SMTP credentials with the regional endpoint (e.g., email-smtp.us-east-1.amazonaws.com).",
      },
    },
    {
      "@type": "Question",
      name: "What's the difference between auth emails and transactional emails in Supabase?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Auth emails (magic links, password resets) are handled by Supabase Auth. Transactional emails (welcome messages, notifications, receipts) are application logic you build yourself. They're completely separate systems, which catches most developers off guard.",
      },
    },
  ],
};

const COST_COMPARISON = [
  {
    provider: "AWS SES (direct)",
    cost50k: "$5",
    cost250k: "$25",
    cost1m: "$100",
    contacts: "N/A",
    note: "Raw API, no platform",
  },
  {
    provider: "Wraps + SES",
    cost50k: "$24",
    cost250k: "$104",
    cost1m: "$299",
    contacts: "Unlimited",
    note: "Full platform, your AWS",
  },
  {
    provider: "Resend",
    cost50k: "$20",
    cost250k: "$225",
    cost1m: "$900",
    contacts: "N/A",
    note: "Transactional only",
  },
  {
    provider: "SendGrid",
    cost50k: "$20",
    cost250k: "$250",
    cost1m: "$900",
    contacts: "Tiered",
    note: "Marketing add-on extra",
  },
  {
    provider: "Customer.io",
    cost50k: "$100+",
    cost250k: "$100+",
    cost1m: "$100+",
    contacts: "Per-profile",
    note: "$100/mo base, scales with profiles",
  },
  {
    provider: "Mailchimp",
    cost50k: "N/A",
    cost250k: "$230+",
    cost1m: "$800+",
    contacts: "Per-contact",
    note: "Marketing focus",
  },
];

export const metadata: Metadata = {
  title: "4 Email Flows Your Supabase App Needs Before Going Live",
  description:
    "Supabase handles auth and database. Email beyond magic links? That's on you. The 4 email flows every production Supabase app needs and how to set each one up.",
  openGraph: {
    title: "4 Email Flows Your Supabase App Needs | Wraps",
    description:
      "Supabase handles auth and database. Email beyond magic links? That's on you. The 4 flows every production app needs.",
    type: "article",
    url: "https://wraps.dev/blog/supabase-email-guide",
    publishedTime: "2026-03-13T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "4 Email Flows Your Supabase App Needs | Wraps",
    description:
      "Supabase handles auth and database. Email beyond magic links? That's on you.",
  },
  alternates: {
    canonical: "https://wraps.dev/blog/supabase-email-guide",
  },
};

const InfoCard = ({
  type = "tip",
  icon: Icon,
  title,
  children,
}: {
  type?: "tip" | "warning" | "danger";
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) => {
  const styles = {
    tip: "border-green-500/50 bg-green-500/10",
    warning: "border-yellow-500/50 bg-yellow-500/10",
    danger: "border-red-500/50 bg-red-500/10",
  };
  const iconStyles = {
    tip: "text-green-600 dark:text-green-400",
    warning: "text-yellow-600 dark:text-yellow-400",
    danger: "text-red-600 dark:text-red-400",
  };

  return (
    <div className={`my-6 rounded-xl border p-4 ${styles[type]}`}>
      <div
        className={`mb-2 flex items-center gap-2 font-semibold ${iconStyles[type]}`}
      >
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="text-foreground/80 text-sm">{children}</div>
    </div>
  );
};

export default function Page() {
  return (
    <>
      <Script
        id="article-schema"
        type="application/ld+json"
      >
        {JSON.stringify(articleSchema)}
      </Script>
      <Script
        id="faq-schema"
        type="application/ld+json"
      >
        {JSON.stringify(faqSchema)}
      </Script>

      <div className="min-h-screen bg-background">
        <LandingNavbar />

        {/* Hero Section */}
        <header className="relative overflow-hidden border-b pb-16 pt-24">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="container relative mx-auto px-4">
            <Badge className="mb-4" variant="outline">
              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
              Supabase + Email Guide
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              4 Email Flows Your Supabase App Needs{" "}
              <span className="text-primary">Before Going Live</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Supabase gets you to a working app fast. Database, auth, edge
              functions — all handled. But email beyond magic links? That's
              where things get messy.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span>12 min read</span>
              <span>&bull;</span>
              <span>Wraps Team</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-8">
              <div>
                <div className="font-mono text-2xl text-primary">4</div>
                <div className="text-muted-foreground text-sm">
                  Email flows to configure
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl text-primary">$0.10</div>
                <div className="text-muted-foreground text-sm">
                  Per 1,000 emails on SES
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl text-primary">2 min</div>
                <div className="text-muted-foreground text-sm">
                  Setup with Wraps CLI
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto max-w-4xl space-y-16 px-4 py-16">
          {/* Intro */}
          <section>
            <p className="text-lg text-muted-foreground">
              Every production Supabase app needs four email flows. Supabase
              handles one of them (partially). The other three are completely on
              you. Here's what each flow requires, the common approaches, and
              the tradeoffs you'll hit.
            </p>

            {/* Flow overview cards */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <KeyRound className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-medium">1. Auth Emails</h3>
                  <p className="text-muted-foreground text-sm">
                    Magic links, password resets, confirmations
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <Bell className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-medium">2. Transactional Emails</h3>
                  <p className="text-muted-foreground text-sm">
                    Welcome, notifications, receipts
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <Megaphone className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-medium">3. Broadcasts</h3>
                  <p className="text-muted-foreground text-sm">
                    Newsletters, product updates, announcements
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <RefreshCw className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-medium">4. Automated Emails</h3>
                  <p className="text-muted-foreground text-sm">
                    Digests, drip sequences, usage alerts
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Flow 1: Auth Emails */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Flow 1: Auth Emails</h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Magic links, password resets, signup confirmations. Supabase Auth
              handles these out of the box — but the defaults have real problems
              in production.
            </p>

            <h3 className="mb-4 font-semibold text-xl">
              What Supabase Gives You
            </h3>
            <p className="mb-4 text-muted-foreground">
              Supabase Auth sends emails automatically when users sign up, reset
              passwords, or request magic links. Zero configuration needed to
              get started.
            </p>

            <InfoCard
              icon={AlertTriangle}
              title="The Problem With Defaults"
              type="warning"
            >
              <ul className="mt-2 space-y-1">
                <li>
                  Emails send from Supabase's shared domain — Gmail and Outlook
                  flag these more aggressively than custom domains
                </li>
                <li>
                  Default templates are plain text and look like phishing emails
                  to your users
                </li>
                <li>
                  Built-in SMTP rate limits are low (as few as 2-3
                  emails/hour) and can change without notice
                </li>
                <li>
                  No deliverability visibility — you can't see if emails are
                  landing in spam
                </li>
              </ul>
            </InfoCard>

            <h3 className="mb-4 mt-8 font-semibold text-xl">
              The Fix: Custom SMTP
            </h3>
            <p className="mb-4 text-muted-foreground">
              Supabase lets you configure a custom SMTP provider in Dashboard →
              Authentication → SMTP Settings. This means your auth emails send
              from your domain, with your branding, through your infrastructure.
            </p>

            <CodeBlock label="Supabase SMTP Settings">
              {`Host:     email-smtp.us-east-1.amazonaws.com
Port:     587
Username: AKIAIOSFODNN7EXAMPLE      # SES SMTP credentials
Password: wJalrXUtnFEMI/K7MDENG...  # (not your AWS secret key)
Sender:   noreply@yourdomain.com`}
            </CodeBlock>

            <InfoCard icon={CheckCircle} title="Before You Go Live" type="tip">
              <p>
                Verify your sending domain with SPF, DKIM, and DMARC records.
                Without these, even custom SMTP emails can land in spam. Wraps
                handles all three automatically during setup.
              </p>
            </InfoCard>

            <h3 className="mb-4 mt-8 font-semibold text-xl">
              Cost Comparison for Auth Emails
            </h3>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Cost per 1,000
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      50K emails/mo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-4 py-3">AWS SES</td>
                    <td className="px-4 py-3 text-right font-mono text-green-500">
                      $0.10
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-500">
                      $5
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Resend</td>
                    <td className="px-4 py-3 text-right font-mono">$0.40</td>
                    <td className="px-4 py-3 text-right font-mono">$20</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">SendGrid</td>
                    <td className="px-4 py-3 text-right font-mono">$0.40</td>
                    <td className="px-4 py-3 text-right font-mono">$20</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Postmark</td>
                    <td className="px-4 py-3 text-right font-mono">$1.20</td>
                    <td className="px-4 py-3 text-right font-mono">$66</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-muted-foreground text-sm">
              Auth emails alone probably won't break the bank. But this is just
              one of four flows — the costs add up.
            </p>
          </section>

          {/* Flow 2: Transactional Emails */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">
                Flow 2: Transactional Emails
              </h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Welcome emails, comment notifications, payment receipts, order
              confirmations. These bring users back to your app — and Supabase
              Auth doesn't handle any of them.
            </p>

            <InfoCard
              icon={AlertTriangle}
              title="The Biggest Gotcha"
              type="danger"
            >
              Auth emails and transactional emails are completely separate
              systems in Supabase. Most developers don't realize this until
              they're already in production and users aren't getting welcome
              emails.
            </InfoCard>

            <h3 className="mb-4 mt-8 font-semibold text-xl">
              Option A: Edge Functions + fetch
            </h3>
            <p className="mb-4 text-muted-foreground">
              Call an email API from a Supabase Edge Function. Works, but you're
              building email infrastructure from scratch — no templates, no
              tracking, no retry logic.
            </p>
            <CodeBlock label="supabase/functions/send-welcome/index.ts">
              {`import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  const { email, name } = await req.json();

  // Raw fetch to an email API
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer re_xxxxx",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "hello@yourdomain.com",
      to: email,
      subject: "Welcome to the app",
      html: \`<p>Hey \${name}, welcome aboard!</p>\`,
    }),
  });

  return new Response(JSON.stringify({ ok: res.ok }));
});`}
            </CodeBlock>
            <p className="text-muted-foreground text-sm">
              This works for a single email. But you'll need to add error
              handling, retry logic, template management, and tracking yourself.
              That's a lot of code for "send a welcome email."
            </p>

            <h3 className="mb-4 mt-8 font-semibold text-xl">
              Option B: Next.js API Route + Email SDK
            </h3>
            <p className="mb-4 text-muted-foreground">
              If your frontend is Next.js, you can send from an API route
              instead. This gives you better error handling and keeps email
              logic close to your application code.
            </p>
            <CodeBlock label="app/api/welcome/route.ts">
              {`import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

export async function POST(req: Request) {
  const { to, name } = await req.json();

  const result = await email.send({
    from: "hello@yourdomain.com",
    to,
    subject: "Welcome to the app",
    html: \`<p>Hey \${name}, welcome aboard!</p>\`,
  });

  return Response.json(result);
}`}
            </CodeBlock>

            <InfoCard icon={CheckCircle} title="Why This Is Better" type="tip">
              <p>
                The Wraps SDK resolves AWS credentials automatically (no API
                keys to manage), handles retries, and sends through SES in your
                AWS account. You own the sending infrastructure.
              </p>
            </InfoCard>

            <h3 className="mb-4 mt-8 font-semibold text-xl">
              Option C: Database Webhooks
            </h3>
            <p className="mb-4 text-muted-foreground">
              Trigger emails based on database changes. When a row is inserted
              into your orders table, fire a webhook that sends a confirmation
              email. More robust than manual API calls, but you can't preview
              what goes out and debugging is harder.
            </p>

            <Collapsible title="When to use which approach">
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-green-500" />
                  <span>
                    <strong className="text-foreground">
                      Edge Functions + fetch
                    </strong>
                    : Quick prototype, single email type, Supabase-only stack
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-green-500" />
                  <span>
                    <strong className="text-foreground">
                      Next.js API route + SDK
                    </strong>
                    : Production app, multiple email types, TypeScript stack,
                    want to own infrastructure
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-green-500" />
                  <span>
                    <strong className="text-foreground">
                      Database webhooks
                    </strong>
                    : Event-driven architecture, emails triggered by data
                    changes, want to decouple email from app logic
                  </span>
                </div>
              </div>
            </Collapsible>
          </section>

          {/* Flow 3: Broadcasts */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Flow 3: Broadcasts</h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Newsletters, product updates, announcements. One-time sends to a
              group of users. Supabase doesn't support this at all — and the
              workarounds all have significant tradeoffs.
            </p>

            <h3 className="mb-4 font-semibold text-xl">
              The Common Approaches
            </h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-500" />
                <div>
                  <h4 className="font-medium">
                    Export users to CSV, import to Mailchimp
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    Manual, gets stale instantly, creates duplicate contacts
                    across systems. Works once. Doesn't scale.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-500" />
                <div>
                  <h4 className="font-medium">
                    Sync users to a third-party via webhooks
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    More robust, but now you're maintaining user sync code,
                    doing a one-time backfill, and paying per-contact pricing on
                    the other end.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-500" />
                <div>
                  <h4 className="font-medium">
                    Build it yourself with Edge Functions
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    Query users, batch send, handle rate limiting, manage
                    unsubscribes, comply with CAN-SPAM. That's a product, not a
                    feature.
                  </p>
                </div>
              </div>
            </div>

            <h3 className="mb-4 mt-8 font-semibold text-xl">
              The Real Problem: Contact-Based Pricing
            </h3>
            <p className="mb-4 text-muted-foreground">
              Most broadcast tools charge by the number of contacts you store.
              Your Supabase{" "}
              <code className="rounded bg-muted px-1">auth.users</code> table
              grows, and your email bill grows with it — even if half those
              users are inactive.
            </p>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-right font-medium">50K/mo</th>
                    <th className="px-4 py-3 text-right font-medium">
                      250K/mo
                    </th>
                    <th className="px-4 py-3 text-right font-medium">1M/mo</th>
                    <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
                      Contacts
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {COST_COMPARISON.map((row) => (
                    <tr
                      className={
                        row.provider === "Wraps + SES" ? "bg-primary/5" : ""
                      }
                      key={row.provider}
                    >
                      <td className="px-4 py-3">
                        {row.provider === "Wraps + SES" ? (
                          <span className="font-medium">{row.provider}</span>
                        ) : (
                          row.provider
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${
                          row.provider === "Wraps + SES" ? "text-green-500" : ""
                        }`}
                      >
                        {row.cost50k}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${
                          row.provider === "Wraps + SES" ? "text-green-500" : ""
                        }`}
                      >
                        {row.cost250k}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${
                          row.provider === "Wraps + SES" ? "text-green-500" : ""
                        }`}
                      >
                        {row.cost1m}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-muted-foreground sm:table-cell">
                        {row.contacts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-muted-foreground text-sm">
              Wraps + SES = Wraps platform fee + AWS SES sending cost. All tiers
              include unlimited contacts.
            </p>
          </section>

          {/* Flow 4: Automated Emails */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <RefreshCw className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Flow 4: Automated Emails</h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Weekly digests, onboarding drip sequences, usage alerts, renewal
              reminders. The hardest flow to get right — and the most dangerous
              to get wrong, since you're sending to everyone without seeing the
              email first.
            </p>

            <h3 className="mb-4 font-semibold text-xl">The pg_cron Approach</h3>
            <p className="mb-4 text-muted-foreground">
              Most Supabase developers wire up a{" "}
              <code className="rounded bg-muted px-1">pg_cron</code> job that
              calls an Edge Function on a schedule. It works, but has real
              limitations.
            </p>

            <CodeBlock label="pg_cron job setup">
              {`-- Run every Monday at 9am UTC
SELECT cron.schedule(
  'weekly-digest',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/weekly-digest',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb
  );
  $$
);`}
            </CodeBlock>

            <CodeBlock label="supabase/functions/weekly-digest/index.ts">
              {`import { createClient } from "@supabase/supabase-js";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Get all active users
  const { data: users } = await supabase
    .from("profiles")
    .select("email, name")
    .eq("digest_enabled", true);

  // Send to each user... but what does the email look like?
  // No preview. No visual builder. Hope for the best.
  for (const user of users ?? []) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer re_xxxxx" },
      body: JSON.stringify({
        from: "digest@yourdomain.com",
        to: user.email,
        subject: "Your weekly digest",
        html: buildDigestHtml(user), // hand-rolled HTML
      }),
    });
  }

  return new Response("ok");
});`}
            </CodeBlock>

            <InfoCard
              icon={AlertTriangle}
              title="What Can Go Wrong"
              type="danger"
            >
              <ul className="mt-2 space-y-1">
                <li>
                  No preview — you can't see what gets sent before it goes to
                  all users
                </li>
                <li>No visual builder — you're writing HTML strings in code</li>
                <li>
                  No error recovery — if the function crashes mid-send, some
                  users get the email and some don't
                </li>
                <li>
                  No send-time personalization — everyone gets the same content
                  unless you build per-user logic
                </li>
                <li>
                  Edge Function timeout — long user lists can exceed the
                  execution limit (150s free / 400s paid)
                </li>
              </ul>
            </InfoCard>

            <h3 className="mb-4 mt-8 font-semibold text-xl">
              The Alternative: Visual Workflows
            </h3>
            <p className="mb-4 text-muted-foreground">
              A dedicated email platform with a workflow builder lets you design
              automated sequences visually — with triggers, delays, conditions,
              and preview. You see exactly what gets sent before it goes out.
            </p>

            <div className="rounded-xl border bg-muted/30 p-6">
              <h4 className="mb-4 font-medium">What a workflow looks like</h4>
              <div className="flex flex-wrap items-center justify-center gap-3 text-center">
                <div className="rounded-lg border bg-background p-3">
                  <div className="font-mono text-sm">Trigger</div>
                  <div className="text-muted-foreground text-xs">
                    user.signed_up
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="rounded-lg border bg-background p-3">
                  <div className="font-mono text-sm">Wait</div>
                  <div className="text-muted-foreground text-xs">1 day</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="rounded-lg border bg-background p-3">
                  <div className="font-mono text-sm">Send</div>
                  <div className="text-muted-foreground text-xs">
                    Welcome email
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="rounded-lg border bg-background p-3">
                  <div className="font-mono text-sm">Wait for</div>
                  <div className="text-muted-foreground text-xs">
                    first_send event
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="rounded-lg border bg-background p-3">
                  <div className="font-mono text-sm">Branch</div>
                  <div className="text-muted-foreground text-xs">
                    activated?
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* The Full Stack */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">
                The Full Stack: Supabase + Wraps + Your AWS
              </h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Here's how all four flows come together. Supabase handles auth and
              database. Wraps handles email as a platform. Everything sends
              through SES in your AWS account.
            </p>

            <div className="rounded-xl border bg-muted/30 p-6">
              <div className="flex flex-wrap items-center justify-center gap-4 text-center">
                <div className="rounded-lg border bg-background p-4">
                  <div className="mb-1 font-semibold">Supabase</div>
                  <div className="text-muted-foreground text-xs">
                    Auth + Database
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="rounded-lg border border-primary/50 bg-primary/5 p-4">
                  <div className="mb-1 font-semibold">Wraps</div>
                  <div className="text-muted-foreground text-xs">
                    Templates + Broadcasts + Workflows
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="rounded-lg border bg-background p-4">
                  <div className="mb-1 font-semibold">Your AWS</div>
                  <div className="text-muted-foreground text-xs">
                    SES + DynamoDB + Lambda
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Card>
                <CardContent className="pt-6">
                  <h4 className="mb-3 font-semibold">What You Own</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-green-500" />
                      SES configuration and sending reputation
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-green-500" />
                      Email event data in your DynamoDB
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-green-500" />
                      Domain verification (DKIM, SPF, DMARC)
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-green-500" />
                      Everything stays if you leave Wraps
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <h4 className="mb-3 font-semibold">What Wraps Adds</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-primary" />
                      Template builder with AI generation
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-primary" />
                      Segments, broadcasts, and scheduling
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-primary" />
                      Visual workflow builder with automations
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-primary" />
                      TypeScript SDK with auto credential resolution
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <h3 className="mb-4 mt-8 font-semibold text-xl">Setup: 3 Steps</h3>
            <CodeBlock label="Terminal">
              {`# 1. Install the CLI
npm install -g @wraps.dev/cli

# 2. Deploy email infrastructure to your AWS
wraps email deploy

# 3. Send your first email
wraps email send --to user@example.com --subject "Hello from Wraps"`}
            </CodeBlock>
            <p className="text-muted-foreground text-sm">
              The CLI deploys SES, DynamoDB, Lambda, and IAM resources to your
              AWS account. DKIM, SPF, and DMARC are configured automatically.
              Takes about 2 minutes.
            </p>
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
                title="Can I just use Resend with Supabase?"
              >
                <p className="text-muted-foreground text-sm">
                  Yes. Resend is a solid choice for transactional email. The
                  tradeoffs: you start at $20/mo for 50K emails (vs ~$5 on
                  SES), overages are $0.90/1K, you don't own the sending
                  infrastructure, and you'll need a separate tool for broadcasts
                  and automations. If you're sending under 10K emails/month and
                  only need transactional, Resend is fine. At scale or if you
                  need a full platform, the economics favor SES.
                </p>
              </Collapsible>

              <Collapsible title="Do I need an AWS account?">
                <p className="text-muted-foreground text-sm">
                  Yes — that's the tradeoff. You own everything (SES config,
                  sending reputation, email data) but you need an AWS account.
                  The upside: $0.10/1K emails, no vendor lock-in, full
                  auditability. If you don't want AWS, Resend is probably your
                  best bet for transactional email.
                </p>
              </Collapsible>

              <Collapsible title="How do I configure Supabase SMTP with SES?">
                <p className="text-muted-foreground text-sm">
                  In Supabase Dashboard → Authentication → SMTP Settings, enter
                  your SES SMTP credentials (not your AWS access key — SES has
                  separate SMTP credentials). Use the regional endpoint like{" "}
                  <code className="rounded bg-muted px-1">
                    email-smtp.us-east-1.amazonaws.com
                  </code>{" "}
                  on port 587. Wraps generates these SMTP credentials
                  automatically during{" "}
                  <code className="rounded bg-muted px-1">
                    wraps email deploy
                  </code>
                  .
                </p>
              </Collapsible>

              <Collapsible title="What about Postmark?">
                <p className="text-muted-foreground text-sm">
                  Great deliverability, good DX. But at $1.20/1K emails, it's
                  12x more expensive than SES. Postmark supports broadcasts now,
                  but has no automations or workflow builders — you'd need a
                  second tool for drip sequences and scheduled sends.
                </p>
              </Collapsible>

              <Collapsible title="What if I'm not on AWS yet?">
                <p className="text-muted-foreground text-sm">
                  Creating an AWS account is free. You only pay for what you use
                  (SES is $0.10/1K emails). Many Supabase developers already
                  have AWS accounts for other services. If AWS is a non-starter
                  for your team, Resend + a separate broadcast tool is the next
                  best option.
                </p>
              </Collapsible>

              <Collapsible title="Can I use Wraps for auth emails too?">
                <p className="text-muted-foreground text-sm">
                  Indirectly. Wraps deploys SES to your AWS account and
                  configures SMTP credentials. You point Supabase Auth's SMTP
                  settings at those credentials. Auth emails then send through
                  your SES — branded, authenticated, and at AWS pricing.
                </p>
              </Collapsible>
            </div>
          </section>

          {/* TL;DR */}
          <section className="rounded-xl border bg-muted/30 p-6">
            <h3 className="mb-4 font-bold text-xl">TL;DR</h3>
            <div className="space-y-3 text-muted-foreground">
              <p>
                <strong className="text-foreground">Auth emails</strong> —
                Supabase handles this, but configure custom SMTP before launch.
                Default sender domain hurts deliverability.
              </p>
              <p>
                <strong className="text-foreground">
                  Transactional emails
                </strong>{" "}
                — Completely separate from auth. You need an email service. Use
                an SDK in your Next.js API routes for the best DX.
              </p>
              <p>
                <strong className="text-foreground">Broadcasts</strong> — Not
                supported by Supabase. Third-party tools charge per contact.
                Look for unlimited contacts or you'll pay for inactive users.
              </p>
              <p>
                <strong className="text-foreground">Automated emails</strong> —
                pg_cron works but has no preview, no visual builder, and timeout
                risks. A workflow builder is safer for production.
              </p>
              <p className="pt-2 text-foreground">
                If you're on AWS (or open to it), SES at $0.10/1K is 4-12x
                cheaper than managed providers. The question isn't whether to
                set up email infrastructure — it's whether you want to rent it
                or own it.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-primary/5 p-8 text-center">
            <h3 className="mb-3 font-bold text-2xl">
              Get Production Email Running in 2 Minutes
            </h3>
            <p className="mx-auto mb-6 max-w-lg text-muted-foreground">
              Wraps deploys SES, templates, broadcasts, and workflows to your
              AWS account. Unlimited contacts on every plan.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/docs/quickstart/email">
                  Quickstart Guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/tools/ses-calculator">
                  <CircleDollarSign className="mr-2 h-4 w-4" />
                  Calculate Your Savings
                </Link>
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
                href="/blog/nextjs-vercel-ses-guide"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>
                  Next.js + Vercel + AWS SES: The Complete Email Guide
                </span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="/blog/ses-production-architecture"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>AWS SES Production Architecture Guide</span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="/blog/your-dmarc-policy-is-useless"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>Your DMARC Policy Is Useless (and How to Fix It)</span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="/blog/spf-guide"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>
                  The SPF 10-Lookup Limit: Why Your Email Might Be Failing
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
