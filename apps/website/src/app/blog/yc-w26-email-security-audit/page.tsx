import { Badge } from "@wraps/ui/components/ui/badge";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import { DomainChecker, GradeDistribution, StatCard } from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "We Graded 200 YC W26 Companies on Email Security. Only 23% Got an A.",
  description:
    "We scanned every YC W26 company for SPF, DKIM, and DMARC using public DNS records. 70% don't enforce DMARC. 12% have zero email authentication. Full data and methodology inside.",
  image: "https://wraps.dev/blog/yc-w26-email-security-audit.webp",
  datePublished: "2026-03-30T00:00:00.000Z",
  dateModified: "2026-03-30T00:00:00.000Z",
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
    "@id": "https://wraps.dev/blog/yc-w26-email-security-audit",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is DMARC enforcement and why does it matter?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "DMARC enforcement means setting your policy to quarantine or reject, which tells receiving mail servers to block or spam-folder emails that fail authentication. Without enforcement (policy=none or no DMARC), anyone can send email pretending to be from your domain.",
      },
    },
    {
      "@type": "Question",
      name: "How were YC W26 companies graded on email security?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Each company was graded based on their email auth triad: SPF, DKIM, and DMARC. Grade A requires all three present with DMARC enforcing. Grade B means all three present but DMARC not enforcing. C is missing one record, D is missing two, and F is missing all three or has critical failures.",
      },
    },
    {
      "@type": "Question",
      name: "How do I check my own domain's email security grade?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Run npx mail-audit yourdomain.com in your terminal. It's free and open source, checking SPF, DKIM, DMARC, MX records, blacklists, and more. You'll get a letter grade and specific recommendations.",
      },
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "We Graded 200 YC W26 Companies on Email Security",
  description:
    "We scanned every YC W26 company for SPF, DKIM, and DMARC. Only 23% got an A. 70% don't enforce DMARC. Full data and methodology.",
  path: "/blog/yc-w26-email-security-audit",
  type: "article",
  image: {
    url: "https://wraps.dev/blog/yc-w26-email-security-audit.webp",
    width: 1200,
    height: 630,
    alt: "YC W26 Email Security Audit — Only 23% got an A",
  },
  publishedTime: "2026-03-30T00:00:00.000Z",
  authors: ["Wraps Team"],
  social: {
    description:
      "Only 23% of YC W26 companies got an A on email security. 70% don't enforce DMARC. Full audit results with data.",
    twitterCopy: {
      description:
        "Only 23% got an A. 70% don't enforce DMARC. We scanned every YC W26 company's SPF, DKIM, and DMARC.",
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

        {/* Hero */}
        <header className="relative overflow-hidden border-b pb-16 pt-24">
          <div className="container mx-auto max-w-4xl px-4">
            <div className="mb-6 flex items-center gap-3">
              <Badge variant="outline">Research</Badge>
              <span className="text-muted-foreground text-sm">
                March 30, 2026
              </span>
              <span className="text-muted-foreground text-sm">5 min read</span>
            </div>

            <h1 className="mb-4 font-bold text-4xl text-foreground tracking-tight md:text-5xl">
              We Graded 200 YC W26 Companies
              <br />
              on Email Security
            </h1>

            <p className="max-w-2xl text-lg text-muted-foreground">
              We scanned every company from the Y Combinator Winter 2026 batch
              for SPF, DKIM, and DMARC using public DNS records. One week after
              Demo Day, most aren&apos;t protecting their domain from spoofing.
            </p>
          </div>
        </header>

        {/* Content */}
        <main className="container mx-auto max-w-4xl space-y-16 px-4 py-16">
          {/* Key Stats */}
          <section>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard
                label="Got an A"
                sublabel="Full auth triad enforcing"
                value="23%"
              />
              <StatCard
                label="No DMARC enforcement"
                sublabel="Domain can be spoofed"
                value="70%"
              />
              <StatCard
                label="Missing records"
                sublabel="Graded C, D, or F"
                value="51%"
              />
              <StatCard
                label="Zero auth"
                sublabel="No SPF, DKIM, or DMARC"
                value="12%"
              />
            </div>
          </section>

          {/* Grading System */}
          <section>
            <h2 className="mb-2 font-bold text-2xl text-foreground">
              How we graded
            </h2>
            <p className="mb-6 text-muted-foreground">
              No curve. No bonus points. Either you have SPF, DKIM, and DMARC
              configured and enforcing, or you don&apos;t.
            </p>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-foreground text-sm">
                      Grade
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground text-sm">
                      What it means
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    [
                      "A",
                      "SPF + DKIM + DMARC enforcing (quarantine or reject)",
                    ],
                    [
                      "B",
                      "All three records present, but DMARC not enforcing (policy=none)",
                    ],
                    ["C", "Missing one of the three core records"],
                    ["D", "Missing two of the three core records"],
                    [
                      "F",
                      "Missing all three, or critical failure like SPF +all",
                    ],
                  ].map(([grade, desc]) => (
                    <tr className="hover:bg-muted/30" key={grade}>
                      <td className="px-4 py-3 font-bold font-mono text-foreground">
                        {grade}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm">
                        {desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Results */}
          <section>
            <h2 className="mb-2 font-bold text-2xl text-foreground">
              The results
            </h2>
            <p className="mb-6 text-muted-foreground">
              200 domains scanned. 6 days after Demo Day. These companies are
              actively emailing investors, customers, and partners.
            </p>

            <GradeDistribution />
          </section>

          {/* Google Workspace */}
          <section>
            <h2 className="mb-2 font-bold text-2xl text-foreground">
              89% use Google Workspace
            </h2>
            <p className="mb-4 text-muted-foreground">
              Google makes DKIM and DMARC setup easy. A few clicks in the Admin
              console, two DNS records, done.
            </p>
            <p className="text-muted-foreground">
              Most just never turned it on.
            </p>
          </section>

          {/* DMARC Breakdown */}
          <section>
            <h2 className="mb-2 font-bold text-2xl text-foreground">
              DMARC policy breakdown
            </h2>
            <p className="mb-6 text-muted-foreground">
              DMARC tells receiving servers what to do with emails that fail
              authentication. Without it, or with policy=none, spoofed emails
              get delivered like normal.
            </p>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-foreground text-sm">
                      Policy
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-foreground text-sm">
                      Count
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-foreground text-sm">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    ["No DMARC record", "75", "38%"],
                    ["p=none (monitor only)", "64", "32%"],
                    ["p=quarantine", "45", "23%"],
                    ["p=reject (full enforcement)", "16", "8%"],
                  ].map(([policy, count, pct]) => (
                    <tr className="hover:bg-muted/30" key={policy}>
                      <td className="px-4 py-3 text-foreground text-sm">
                        {policy}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground text-sm">
                        {count}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground text-sm">
                        {pct}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Deep dive link */}
          <section>
            <a
              className="group flex items-start gap-4 rounded-lg border p-5 transition-colors hover:bg-muted/30"
              href="/blog/your-dmarc-policy-is-useless"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div>
                <div className="font-semibold text-foreground">
                  Your DMARC Policy is Useless
                </div>
                <p className="mt-1 text-muted-foreground text-sm">
                  Why policy=none provides zero protection, and how to get to
                  reject.
                </p>
              </div>
            </a>
          </section>

          {/* Why it matters */}
          <section>
            <h2 className="mb-2 font-bold text-2xl text-foreground">
              So what?
            </h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                Without DMARC enforcement, a spoofed email from your domain
                won&apos;t get blocked by the receiving server. It might still
                land in spam depending on the provider&apos;s own heuristics,
                but there&apos;s no policy telling it to reject. That&apos;s the
                gap.
              </p>
              <p>
                The less obvious cost is to your own deliverability. Google and
                Yahoo now factor DMARC, DKIM, and SPF into inbox placement
                decisions. A domain with no enforcement doesn&apos;t just fail
                to block spoofing. It also makes your real emails look less
                trustworthy.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-bold text-2xl text-foreground">
              Check your grade
            </h2>
            <p className="mb-6 text-muted-foreground">
              Free and open source. Same grading system used in this audit.
            </p>

            <div className="mx-auto max-w-lg">
              <DomainChecker />
            </div>
          </section>

          {/* Methodology */}
          <section>
            <h2 className="mb-2 font-bold text-2xl text-foreground">
              Methodology
            </h2>
            <div className="space-y-2 text-muted-foreground text-sm">
              <p>
                <strong className="text-foreground">Tool:</strong>{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  npx mail-audit
                </code>{" "}
                (open source, public DNS queries only)
              </p>
              <p>
                <strong className="text-foreground">Source:</strong> YC W26
                batch via ycombinator.com and extruct.ai (200 domains)
              </p>
              <p>
                <strong className="text-foreground">Date:</strong> March 30,
                2026 (6 days after Demo Day)
              </p>
              <p>
                <strong className="text-foreground">Grading:</strong> Auth
                triad-based. A = all 3 + DMARC enforcing. B = all 3 present. C =
                missing 1. D = missing 2. F = missing all.
              </p>
              <p>
                <strong className="text-foreground">Flags:</strong>{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  --quick --skip-blacklists --skip-tls
                </code>{" "}
                for batch speed. Full audits check additional signals.
              </p>
              <p>
                <strong className="text-foreground">Valid results:</strong>{" "}
                200/200 (100%)
              </p>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
