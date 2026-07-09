import { Card } from "@wraps/ui/components/ui/card";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import {
  AuthExplainer,
  BreachTimeline,
  DMARCSimulator,
  DomainChecker,
  EmailHeaderScroller,
  HeroScrollButton,
} from "./page-content";

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is DMARC and why does it matter?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "DMARC (Domain-based Message Authentication, Reporting & Conformance) is an email authentication protocol that protects your domain from spoofing. It tells receiving servers what to do with emails that fail SPF and DKIM checks. Without DMARC or with p=none, attackers can send emails pretending to be from your domain.",
      },
    },
    {
      "@type": "Question",
      name: "What does p=none mean in DMARC?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "p=none means 'monitor only' - it tells receiving servers not to take any action on emails that fail DMARC checks. While useful for initial setup and collecting reports, it provides zero protection against spoofing. Attackers can still send emails as your domain and they'll be delivered normally.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between p=quarantine and p=reject?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "p=quarantine tells receivers to send failing emails to spam/junk folders, while p=reject tells them to block the emails entirely. p=reject provides the strongest protection but should only be used after monitoring with p=none to ensure legitimate emails pass authentication.",
      },
    },
    {
      "@type": "Question",
      name: "How do SPF, DKIM, and DMARC work together?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "SPF verifies the sending server is authorized, DKIM cryptographically signs emails to prove they weren't modified, and DMARC ties them together by requiring alignment between the From header and SPF/DKIM domains. For DMARC to pass, either SPF or DKIM must both pass and align with the From domain.",
      },
    },
    {
      "@type": "Question",
      name: "Why do Google and Yahoo now require DMARC?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Starting in 2024, Google and Yahoo require bulk senders (5,000+ emails/day) to have valid DMARC records. This is part of industry-wide efforts to reduce spam and phishing. Domains without proper email authentication may see their emails rejected or sent to spam.",
      },
    },
  ],
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Your DMARC Policy is Useless",
  description:
    "82% of domains have no DMARC. Of those that do, most set p=none\u2014which tells receivers not to enforce. An interactive deep-dive into email authentication.",
  image: "https://wraps.dev/blog/dmarc-policy-is-useless.webp",
  datePublished: "2025-01-15T00:00:00.000Z",
  dateModified: "2025-01-15T00:00:00.000Z",
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
    "@id": "https://wraps.dev/blog/your-dmarc-policy-is-useless",
  },
};

export const metadata: Metadata = {
  title: "Your DMARC Policy is Useless",
  description:
    "82% of domains have no DMARC. Of those that do, most set p=none\u2014which tells receivers not to enforce. An interactive deep-dive into email authentication.",
  openGraph: {
    title: "Your DMARC Policy is Useless | Wraps",
    description:
      "82% of domains have no DMARC. Of those that do, most set p=none\u2014which tells receivers not to enforce. An interactive deep-dive into email authentication.",
    type: "article",
    url: "https://wraps.dev/blog/your-dmarc-policy-is-useless",
    images: [
      {
        url: "https://wraps.dev/blog/dmarc-policy-is-useless.webp",
        width: 800,
        height: 421,
        alt: "Your DMARC policy is useless",
      },
    ],
    publishedTime: "2025-01-15T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your DMARC Policy is Useless | Wraps",
    description:
      "82% of domains have no DMARC. Of those that do, most set p=none. An interactive deep-dive into email authentication.",
    images: ["https://wraps.dev/blog/dmarc-policy-is-useless.webp"],
  },
  alternates: {
    canonical: "https://wraps.dev/blog/your-dmarc-policy-is-useless",
  },
};

// Static "The Fix" section - no hooks, pure presentational
const THE_FIX_STEPS = [
  {
    num: 1,
    title: "Start with monitoring",
    code: "v=DMARC1; p=none; rua=mailto:dmarc@yourcompany.com",
    desc: "Deploy p=none to receive reports without affecting delivery. See who's sending as your domain.",
  },
  {
    num: 2,
    title: "Fix legitimate senders",
    code: "v=spf1 include:_spf.google.com include:amazonses.com -all",
    desc: "Add all legitimate services to SPF. Configure DKIM for each sender. This typically takes 2-4 weeks.",
  },
  {
    num: 3,
    title: "Move to quarantine",
    code: "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourcompany.com",
    desc: "Quarantine failures and keep watching your reports. (Skip pct — DMARCbis retires it; receivers now enforce all-or-nothing. Use t=y if you need a testing window.)",
  },
  {
    num: 4,
    title: "Enforce with reject",
    code: "v=DMARC1; p=reject; sp=reject; np=reject; rua=mailto:dmarc@yourcompany.com; fo=1",
    desc: "Full protection. Spoofed emails are rejected before reaching any inbox. np=reject also blocks spoofing from subdomains that don't exist. You're now in the 5.2%.",
  },
];

const TheFix = () => (
  <Card className="p-6">
    <h3 className="mb-6 font-semibold text-foreground text-lg">
      The Path to p=reject
    </h3>

    <div className="space-y-6">
      {THE_FIX_STEPS.map((step) => (
        <div className="flex gap-4" key={step.num}>
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
            {step.num}
          </div>
          <div className="flex-1">
            <h4 className="mb-1 font-semibold text-foreground">{step.title}</h4>
            <div className="mb-2 overflow-x-auto rounded bg-muted p-2 font-mono text-green-600 text-sm dark:text-green-400">
              {step.code}
            </div>
            <p className="text-muted-foreground text-sm">{step.desc}</p>
          </div>
        </div>
      ))}
    </div>
  </Card>
);

// Static DMARC adoption data
const DMARC_ADOPTION_DATA = [
  {
    label: "No DMARC at all",
    value: 82,
    color: "bg-red-500",
    annotation: "completely unprotected",
  },
  {
    label: "p=none",
    value: 9.7,
    color: "bg-yellow-500",
    annotation: "monitoring only",
  },
  {
    label: "p=quarantine",
    value: 3.1,
    color: "bg-orange-500",
    annotation: "partial protection",
  },
  {
    label: "p=reject",
    value: 5.2,
    color: "bg-green-500",
    annotation: "actual protection",
  },
];

// Static misconfiguration data
const MISCONFIGURATIONS = [
  {
    issue: "SPF exceeds 10 DNS lookups",
    result: "PermError \u2192 auth fails",
  },
  {
    issue: "Multiple SPF records",
    result: "Invalidates SPF entirely",
  },
  {
    issue: "DKIM key \u22641024 bits",
    result: "Cryptographically weak",
  },
  {
    issue: "sp=none (explicit)",
    result: "Subdomains unprotected",
  },
  {
    issue: "SPF uses ~all vs -all",
    result: "Soft fail allows spoofs",
  },
  {
    issue: "Missing rua= tag",
    result: "No failure visibility",
  },
];

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />

      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        {/* Hero with background animation */}
        <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 text-center">
          <EmailHeaderScroller />
          <div className="relative z-10 mx-4 max-w-3xl rounded-2xl border bg-background/80 p-8 shadow-2xl backdrop-blur-sm md:p-12">
            <h1 className="mb-4 font-bold text-4xl md:text-6xl">
              Your DMARC policy is <span className="text-red-500">useless</span>
              .
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground md:text-xl">
              82% of domains have no DMARC. Of those that do, most set{" "}
              <code className="rounded bg-red-500/20 px-2 py-0.5 text-red-600 dark:text-red-400">
                p=none
              </code>
              &mdash;which tells receivers not to enforce.
            </p>
            <div className="mb-8 flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <span>15 min read</span>
              <span>&bull;</span>
              <span>Wraps Team</span>
            </div>
            <HeroScrollButton />
          </div>
        </section>

        {/* Content */}
        <div
          className="mx-auto max-w-4xl space-y-24 px-4 pt-24 pb-24"
          id="article-content"
        >
          {/* The Problem */}
          <section>
            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-foreground/80 text-xl leading-relaxed">
                Right now, someone could send an email that looks exactly like
                it's from{" "}
                <span className="font-semibold text-foreground">
                  ceo@yourcompany.com
                </span>
                . It would pass through spam filters. Land in your employee's
                inbox. Ask them to wire $50,000 to a "new vendor."
              </p>
              <p className="text-foreground/80 text-xl leading-relaxed">
                This isn't hypothetical.{" "}
                <span className="font-semibold text-red-600 dark:text-red-400">
                  $2.77 billion
                </span>{" "}
                was stolen through BEC attacks in 2024 alone. Google and
                Facebook lost $122 million to a single spoofed vendor. Toyota
                lost $37 million. Ubiquiti lost $46.7 million. In every case,
                the attack relied on domain impersonation that proper DMARC
                enforcement would have prevented.
              </p>
            </div>
          </section>

          {/* The Scale of the Problem */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              The scale of the problem
            </h2>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-foreground/80 text-xl leading-relaxed">
                These cases aren't outliers. They're the norm.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                In 2024, Business Email Compromise (BEC) attacks cost
                organizations{" "}
                <span className="font-semibold text-red-600 dark:text-red-400">
                  $2.77 billion
                </span>{" "}
                in reported losses, according to the{" "}
                <a
                  className="text-primary hover:underline"
                  href="https://www.ic3.gov/Media/News/2024/240502.pdf"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  FBI's Internet Crime Report
                </a>
                . Approximately{" "}
                <span className="font-semibold text-foreground">
                  60% of these attacks involve domain impersonation
                </span>
                —exactly the kind of spoofing that DMARC enforcement prevents.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                Yet a February 2025 analysis of{" "}
                <span className="font-semibold text-foreground">
                  73.1 million domains
                </span>{" "}
                by{" "}
                <a
                  className="text-primary hover:underline"
                  href="https://redsift.com/guides/red-sifts-guide-to-global-dmarc-adoption"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Red Sift
                </a>{" "}
                found that only{" "}
                <span className="font-semibold text-green-600 dark:text-green-400">
                  5.2% have p=reject
                </span>
                —the only policy that actually stops spoofed emails. The rest?
              </p>
            </div>

            {/* Visual: DMARC adoption breakdown */}
            <div className="my-8 space-y-3">
              {DMARC_ADOPTION_DATA.map((item, i) => (
                <div className="flex items-center gap-4" key={i}>
                  <div className="w-28 shrink-0 text-right">
                    <span className="font-mono text-foreground">
                      {item.value}%
                    </span>
                  </div>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className={`h-full rounded ${item.color}`}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                  <div className="w-48 shrink-0">
                    <span className="text-foreground text-sm">
                      {item.label}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {" "}
                      — {item.annotation}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-foreground/80 text-xl leading-relaxed">
                Even among sophisticated organizations, the gaps are alarming.{" "}
                <span className="font-semibold text-foreground">88%</span> of
                Fortune 500 companies have DMARC records—but only 73.6% actually
                enforce them. In financial services, the most-targeted industry,
                just <span className="font-semibold text-foreground">43%</span>{" "}
                enforce their policies. Among SEC-regulated firms, only 24.4%
                have full enforcement.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                And it's not just missing policies. Research shows{" "}
                <span className="font-semibold text-foreground">
                  7.64% of DMARC records have syntax errors
                </span>{" "}
                that break protection entirely. 60% of US government domains
                have SPF configuration errors. Having a DMARC record isn't the
                same as having protection—and most organizations don't know the
                difference.
              </p>
            </div>
          </section>

          {/* Regulatory Pressure */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Regulators are finally forcing the issue
            </h2>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-foreground/80 text-xl leading-relaxed">
                The gap between "having DMARC" and "enforcing DMARC" has
                persisted for years because there was no penalty for inaction.
                That's changing.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                <span className="font-semibold text-foreground">
                  PCI DSS 4.0
                </span>
                , which took effect March 31, 2025, makes DMARC mandatory for
                anyone processing payment cards. Requirement 5.4.1 specifically
                mandates "automated mechanisms to detect and protect against
                phishing"—and non-compliance fines run{" "}
                <span className="font-semibold text-foreground">
                  $5,000 to $100,000 per month
                </span>
                .
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                Google and Yahoo now require SPF, DKIM, and DMARC for bulk
                senders (5,000+ daily emails). Non-compliant emails already face
                temporary errors; starting November 2025, they'll be permanently
                rejected. This single requirement drove{" "}
                <span className="font-semibold text-foreground">
                  500,000+ new DMARC records
                </span>{" "}
                in early 2024 and reduced unauthenticated Gmail traffic by 65%.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                Government agencies are even further ahead.{" "}
                <a
                  className="text-primary hover:underline"
                  href="https://www.cisa.gov/news-events/directives/bod-18-01-enhance-email-and-web-security"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  CISA's BOD 18-01
                </a>{" "}
                requires all US federal agencies to implement{" "}
                <code className="rounded bg-green-500/20 px-1.5 py-0.5 text-green-600 dark:text-green-400">
                  p=reject
                </code>
                . The UK, Australia, Canada, Denmark, and New Zealand have
                similar mandates. And the results are stark: in countries with
                mandatory DMARC, phishing success rates dropped from{" "}
                <span className="font-semibold text-red-600 dark:text-red-400">
                  69% to 14%
                </span>
                . Meanwhile, the Netherlands—without mandates—saw vulnerability
                increase to 97%.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                The market is moving. The question is whether you'll be ahead of
                the compliance deadline or scrambling to catch up.
              </p>
            </div>
          </section>

          {/* Simulator */}
          <section>
            <div className="prose prose-neutral dark:prose-invert mb-6 max-w-none">
              <h2 className="mb-4 font-bold text-3xl">
                See what happens when a spoofed email arrives
              </h2>
              <p className="text-foreground/80 text-xl leading-relaxed">
                Theory is one thing. Watching it happen is another. Toggle
                between DMARC policies below and see exactly which emails get
                blocked, quarantined, or delivered straight to your inbox.
              </p>
            </div>
            <DMARCSimulator />
          </section>

          {/* How it works */}
          <section>
            <div className="prose prose-neutral dark:prose-invert mb-6 max-w-none">
              <h2 className="mb-4 font-bold text-3xl">
                How email authentication actually works
              </h2>
              <p className="text-foreground/80 text-xl leading-relaxed">
                SPF, DKIM, and DMARC are three separate protocols that work
                together—but each has limitations, and they only matter when you
                actually enforce the result.{" "}
                <a
                  className="text-primary hover:underline"
                  href="/blog/how-email-works"
                >
                  Understand how email flows end-to-end
                </a>{" "}
                first, then here's how the authentication chain works:
              </p>
            </div>
            <AuthExplainer />
          </section>

          {/* Real breaches */}
          <section>
            <div className="prose prose-neutral dark:prose-invert mb-6 max-w-none">
              <h2 className="mb-4 font-bold text-3xl">
                Real-world email security incidents
              </h2>
              <p className="text-foreground/80 text-xl leading-relaxed">
                These aren't hypothetical scenarios. Each involved BEC attacks
                where weak or missing DMARC enabled domain spoofing—and proper
                enforcement would have prevented them. Click each incident for
                details.
              </p>
            </div>
            <BreachTimeline />
          </section>

          {/* How attackers exploit p=none */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              State-sponsored attackers actively hunt for p=none
            </h2>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-foreground/80 text-xl leading-relaxed">
                In May 2024, the FBI, NSA, and State Department issued a{" "}
                <a
                  className="text-primary hover:underline"
                  href="https://www.bleepingcomputer.com/news/security/nsa-warns-of-north-korean-hackers-exploiting-weak-dmarc-email-policies/"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  joint advisory
                </a>{" "}
                about North Korea's Kimsuky APT group. Their finding:{" "}
                <span className="font-semibold text-foreground">
                  Kimsuky systematically scans for domains with weak DMARC
                  policies
                </span>
                , then uses them to conduct spearphishing campaigns against US
                government officials, think tanks, academics, and journalists.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                The attack is straightforward. They query DNS for your DMARC
                record. If it returns{" "}
                <code className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-600 dark:text-red-400">
                  p=none
                </code>
                , they know the domain owner won't request enforcement of
                authentication failures—increasing their chances of successful
                delivery. The advisory included actual email headers from these
                attacks:
              </p>
            </div>

            {/* Attack flow visualization */}
            <div className="my-8 overflow-hidden rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="ml-2 font-mono text-muted-foreground text-xs">
                  Email header from Kimsuky attack (FBI advisory)
                </span>
              </div>
              <div className="p-4 font-mono text-sm">
                <div className="text-muted-foreground">
                  Authentication-Results: spf=fail; dkim=fail;
                </div>
                <div className="text-red-600 dark:text-red-400">
                  {"  "}dmarc=fail (p=none sp=none dis=none)
                </div>
                <div className="mt-2 text-muted-foreground">
                  From: trusted.journalist@legitimate-news.org{" "}
                  <span className="text-yellow-600 dark:text-yellow-400">
                    (spoofed)
                  </span>
                </div>
                <div className="text-muted-foreground">
                  To: policy.analyst@thinktank.org
                </div>
                <div className="mt-2 border-muted border-t pt-2 text-green-600 dark:text-green-400">
                  Status: Delivered to inbox ✓
                </div>
              </div>
            </div>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-foreground/80 text-xl leading-relaxed">
                The email failed every authentication check—SPF, DKIM, and
                DMARC—but was delivered anyway because the policy was set to{" "}
                <code className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-600 dark:text-red-400">
                  p=none
                </code>
                . The advisory explicitly states that upgrading to{" "}
                <code className="rounded bg-green-500/20 px-1.5 py-0.5 text-green-600 dark:text-green-400">
                  p=reject
                </code>{" "}
                would have prevented these attacks entirely.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                The US Treasury sanctioned Kimsuky in November 2023, but
                technical exploitation continues because organizations still
                haven't enforced their policies. Your{" "}
                <code className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-600 dark:text-red-400">
                  p=none
                </code>{" "}
                isn't just a configuration choice—it's an invitation.
              </p>
            </div>
          </section>

          {/* Domain Checker */}
          <section>
            <div className="prose prose-neutral dark:prose-invert mb-6 max-w-none">
              <h2 className="mb-4 font-bold text-3xl">
                Check your domain right now
              </h2>
              <p className="text-foreground/80 text-xl leading-relaxed">
                Enter any domain below and see what policy it's running. You
                might be surprised—many organizations think they have protection
                when they're actually running{" "}
                <code className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-600 dark:text-red-400">
                  p=none
                </code>{" "}
                or have no DMARC record at all.
              </p>
            </div>
            <DomainChecker />
          </section>

          {/* Common Misconfigurations */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              The technical debt that breaks protection
            </h2>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-foreground/80 text-xl leading-relaxed">
                Beyond the{" "}
                <code className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-600 dark:text-red-400">
                  p=none
                </code>{" "}
                problem, dozens of technical misconfigurations silently break
                email authentication—even for organizations that think they're
                protected.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                <span className="font-semibold text-foreground">
                  SPF's 10-lookup limit
                </span>{" "}
                is the most common killer. Every{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                  include:
                </code>{" "}
                statement in your SPF record triggers a DNS lookup. Exceed 10,
                and SPF returns a PermError—authentication fails completely. Add
                enough third-party services (Google Workspace, Salesforce,
                HubSpot, Zendesk) and you'll hit it without realizing.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                <span className="font-semibold text-foreground">
                  Subdomain gaps
                </span>{" "}
                are equally dangerous. If you protect{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                  yourcompany.com
                </code>{" "}
                but explicitly set{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                  sp=none
                </code>{" "}
                (missing{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                  sp=
                </code>{" "}
                inherits from{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                  p=
                </code>
                ), attackers simply spoof{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                  hr.yourcompany.com
                </code>{" "}
                or{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                  billing.yourcompany.com
                </code>{" "}
                instead. The March 2022 SEC domain spoofing case demonstrated a
                related problem: attackers couldn't spoof sec.gov directly (it
                has{" "}
                <code className="rounded bg-green-500/20 px-1.5 py-0.5 text-green-600 dark:text-green-400">
                  p=reject
                </code>
                ), so they spoofed an unprotected government email delivery
                service domain instead—impersonating the SEC through the
                third-party intermediary.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                <span className="font-semibold text-foreground">
                  Weak DKIM keys
                </span>{" "}
                (1024-bit or less) are vulnerable to cryptographic attacks.
                ManageMyHealth was running 1024-bit keys when they were
                breached. The minimum should be 2048-bit—which AWS SES and most
                modern providers use by default.
              </p>

              <p className="text-foreground/80 text-xl leading-relaxed">
                And{" "}
                <span className="font-semibold text-foreground">
                  missing reporting tags
                </span>{" "}
                mean you have no visibility into failures. Without{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                  rua=
                </code>{" "}
                in your DMARC record, you'll never know how many authentication
                failures are happening—or whether legitimate emails are being
                blocked.
              </p>
            </div>

            {/* Compact reference table */}
            <div className="my-8 overflow-hidden rounded-lg border">
              <div className="border-b bg-muted/50 px-4 py-2">
                <span className="font-mono text-muted-foreground text-xs">
                  Common misconfigurations at a glance
                </span>
              </div>
              <div className="divide-y text-sm">
                {MISCONFIGURATIONS.map((row, i) => (
                  <div
                    className="flex items-center justify-between px-4 py-2"
                    key={i}
                  >
                    <code className="text-foreground">{row.issue}</code>
                    <span className="text-muted-foreground">{row.result}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* The Fix */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              The path from p=none to p=reject
            </h2>

            <div className="prose prose-neutral dark:prose-invert mb-6 max-w-none">
              <p className="text-foreground/80 text-xl leading-relaxed">
                Moving to enforcement isn't instant—but it's not the months-long
                project people assume. The process is bounded: identify your
                legitimate email senders, verify they're properly authenticated,
                then ramp up enforcement. Most organizations can complete this
                in 2-4 weeks.
              </p>
            </div>
            <TheFix />

            <div className="mt-6 rounded-xl border border-orange-500/30 bg-orange-500/5 p-5">
              <p className="mb-2 font-semibold text-foreground">
                Skip the manual setup
              </p>
              <p className="mb-3 text-foreground/80 text-sm">
                Wraps CLI automatically configures SPF, DKIM, and DMARC when you
                deploy. One command, production-ready authentication.
              </p>
              <a
                className="inline-flex items-center gap-1 font-medium text-orange-500 text-sm hover:text-orange-600"
                href="/docs/quickstart"
              >
                Deploy in 2 minutes &rarr;
              </a>
            </div>

            <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none">
              <p className="text-foreground/80 text-xl leading-relaxed">
                The ROI is clear. Average data breach costs hit{" "}
                <span className="font-semibold text-foreground">
                  $4.88 million
                </span>{" "}
                in 2024. DMARC implementation costs as little as $8-50/month.
                Forrester estimates large enterprises save{" "}
                <span className="font-semibold text-green-600 dark:text-green-400">
                  $2.4 million annually
                </span>{" "}
                with proper enforcement. The ManageMyHealth case shows what
                happens when you don't act: a data breach becomes an ongoing
                phishing campaign against your own users.
              </p>
            </div>
          </section>

          {/* Fix Your Email Authentication */}
          <section className="space-y-6">
            <div className="text-center">
              <h2 className="font-bold text-2xl">
                Fix Your Email Authentication
              </h2>
              <p className="mt-2 text-muted-foreground">
                Deploy DKIM, SPF, and DMARC in 2 minutes
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border bg-muted/50">
              <div className="flex items-center gap-2 border-b px-4 py-2 text-muted-foreground text-xs">
                <span className="inline-block h-3 w-3 rounded-full bg-red-500/60" />
                <span className="inline-block h-3 w-3 rounded-full bg-yellow-500/60" />
                <span className="inline-block h-3 w-3 rounded-full bg-green-500/60" />
                <span className="ml-2">Terminal</span>
              </div>
              <div className="p-4">
                <code className="font-mono text-foreground text-sm">
                  <span className="text-muted-foreground">$</span> npx
                  @wraps.dev/cli email init
                </code>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <a
                className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-6 py-2.5 font-medium text-white transition-colors hover:bg-orange-600"
                href="/docs/quickstart"
              >
                Free CLI Quickstart
              </a>
              <a
                className="inline-flex items-center justify-center rounded-lg border px-6 py-2.5 font-medium text-foreground transition-colors hover:bg-muted"
                href="/tools"
              >
                Check Your Domain
              </a>
            </div>

            <p className="text-center text-muted-foreground text-xs">
              No credit card &middot; Open source &middot; Infrastructure you
              own
            </p>
          </section>

          {/* Footer */}
          <footer className="space-y-4 text-center text-sm">
            <Card className="p-6">
              <h4 className="mb-3 font-medium text-muted-foreground">
                Sources & Further Reading
              </h4>
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs">
                <a
                  className="text-primary hover:underline"
                  href="https://www.ic3.gov/Media/News/2024/240502.pdf"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  FBI IC3 2024 Report
                </a>
                <a
                  className="text-primary hover:underline"
                  href="https://redsift.com/guides/red-sifts-guide-to-global-dmarc-adoption"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Red Sift DMARC Report 2025
                </a>
                <a
                  className="text-primary hover:underline"
                  href="https://www.bleepingcomputer.com/news/security/nsa-warns-of-north-korean-hackers-exploiting-weak-dmarc-email-policies/"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  NSA/CISA Kimsuky Advisory
                </a>
                <a
                  className="text-primary hover:underline"
                  href="https://www.justice.gov/usao-sdny/pr/lithuanian-man-sentenced-5-years-prison-theft-over-120-million-fraudulent-business"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  DOJ Google/Facebook Case
                </a>
                <a
                  className="text-primary hover:underline"
                  href="https://www.cisa.gov/news-events/directives/bod-18-01-enhance-email-and-web-security"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  CISA BOD 18-01
                </a>
              </div>
            </Card>
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-6">
              <p className="font-semibold text-foreground">
                Stop configuring. Start sending.
              </p>
              <p className="mx-auto mt-1 max-w-md text-muted-foreground text-sm">
                Wraps deploys production-ready email infrastructure to your AWS
                account. You own everything.
              </p>
              <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
                <a
                  className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-5 py-2 font-medium text-sm text-white transition-colors hover:bg-orange-600"
                  href="/docs/quickstart"
                >
                  Get Started Free &rarr;
                </a>
                <a
                  className="inline-flex items-center justify-center rounded-lg border px-5 py-2 font-medium text-foreground text-sm transition-colors hover:bg-muted"
                  href="/why-wraps"
                >
                  Why Wraps?
                </a>
              </div>
            </div>
          </footer>
        </div>

        <LandingFooter />
      </div>
    </>
  );
}
