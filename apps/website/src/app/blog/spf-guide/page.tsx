import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import { Card, CardContent } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle,
  ExternalLink,
  Server,
  Shield,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { CodeBlock, Collapsible } from "@/components/blog/interactive";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "The SPF 10-Lookup Limit: Why Your Email Might Be Failing",
  description:
    "SPF looks simple until you hit the 10-lookup limit. Learn how lookups are counted, which providers cost the most, and how to stay under the limit.",
  image: "https://wraps.dev/og-image.png",
  datePublished: "2026-01-12T00:00:00.000Z",
  dateModified: "2026-01-12T00:00:00.000Z",
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
    "@id": "https://wraps.dev/blog/spf-guide",
  },
};

export const metadata: Metadata = pageMetadata({
  title: "The SPF 10-Lookup Limit: Why Your Email Might Be Failing",
  description:
    "SPF looks simple until you hit the 10-lookup limit. Learn how lookups are counted, which providers cost the most, and how to stay under the limit.",
  path: "/blog/spf-guide",
  type: "article",
  image: {
    url: "https://wraps.dev/og-image.png",
    width: 1200,
    height: 630,
    alt: "SPF 10-Lookup Limit Guide",
  },
  publishedTime: "2026-01-12T00:00:00.000Z",
  authors: ["Wraps Team"],
  social: {
    title: "The SPF 10-Lookup Limit",
    twitterCopy: {
      description:
        "SPF looks simple until you hit the 10-lookup limit. Learn how lookups are counted and how to stay under.",
    },
  },
});

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
    tip: "border-success/50 bg-success/10",
    warning: "border-warning/50 bg-warning/10",
    danger: "border-destructive/50 bg-destructive/10",
  };
  const iconStyles = {
    tip: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  };

  return (
    <div className={`my-6 rounded-xl border p-4 ${styles[type]}`}>
      <div
        className={`mb-2 flex items-center gap-2 font-semibold ${iconStyles[type]}`}
      >
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <p className="text-foreground/80 text-sm">{children}</p>
    </div>
  );
};

// Provider lookup costs table - verified via DNS lookup 2026-01-16
// Sorted by lookups, then alphabetically
// Note: HubSpot requires a custom ID (e.g., include:[ID].spf03.hubspotemail.net)
const PROVIDER_LOOKUPS = [
  { name: "ActiveCampaign", mechanism: "include:emsd1.com", lookups: 1 },
  { name: "AWS SES", mechanism: "include:amazonses.com", lookups: 1 },
  {
    name: "Constant Contact",
    mechanism: "include:spf.constantcontact.com",
    lookups: 1,
  },
  {
    name: "Google Workspace",
    mechanism: "include:_spf.google.com",
    lookups: 1,
  },
  {
    name: "Microsoft 365",
    mechanism: "include:spf.protection.outlook.com",
    lookups: 1,
  },
  { name: "Postmark", mechanism: "include:spf.mtasv.net", lookups: 1 },
  { name: "Zendesk", mechanism: "include:mail.zendesk.com", lookups: 1 },
  { name: "Salesforce", mechanism: "include:_spf.salesforce.com", lookups: 2 },
  { name: "SendGrid", mechanism: "include:sendgrid.net", lookups: 2 },
  { name: "ConvertKit", mechanism: "include:convertkit.com", lookups: 3 },
  { name: "Customer.io", mechanism: "include:customeriomail.com", lookups: 3 },
  { name: "Klaviyo", mechanism: "include:send.klaviyo.com", lookups: 3 },
  { name: "Stripe", mechanism: "include:spf1.stripe.com", lookups: 4 },
  { name: "Zoho", mechanism: "include:zoho.com", lookups: 4 },
  { name: "Mailgun", mechanism: "include:mailgun.org", lookups: 5 },
  { name: "Freshdesk", mechanism: "include:email.freshdesk.com", lookups: 7 },
];

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />

      <div className="min-h-screen bg-background">
        <LandingNavbar />

        {/* Hero Section */}
        <header className="relative overflow-hidden border-b pb-16 pt-24">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="container relative mx-auto px-4">
            <Badge className="mb-4" variant="outline">
              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
              Email Authentication Deep Dive
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              The SPF 10-Lookup Limit:{" "}
              <span className="text-primary">
                Why Your Email Might Be Failing
              </span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              SPF looks simple until you hit the 10-lookup limit. Suddenly your
              emails fail DMARC, and you're debugging DNS records at 2am. Here's
              everything you need to know.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span>8 min read</span>
              <span>&bull;</span>
              <span>Wraps Team</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-8">
              <div>
                <div className="font-mono text-2xl text-primary">10</div>
                <div className="text-muted-foreground text-sm">
                  Max DNS lookups
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl text-primary">PermError</div>
                <div className="text-muted-foreground text-sm">
                  Result when exceeded
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl text-primary">RFC 7208</div>
                <div className="text-muted-foreground text-sm">
                  The specification
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto max-w-4xl space-y-16 px-4 py-16">
          {/* What is SPF */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">What is SPF?</h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Sender Policy Framework (SPF) is a DNS-based email authentication
              method that specifies which mail servers are authorized to send
              email on behalf of your domain.
            </p>

            <div className="rounded-xl border bg-muted/30 p-6">
              <p className="mb-4 text-sm">
                When a receiving server gets an email from{" "}
                <code className="rounded bg-muted px-1">
                  hello@yourcompany.com
                </code>
                , it checks the DNS for{" "}
                <code className="rounded bg-muted px-1">yourcompany.com</code>'s
                SPF record to see if the sending server is authorized.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 text-center">
                <div className="rounded-lg border bg-background p-3">
                  <div className="font-mono text-sm">Sending Server</div>
                  <div className="text-muted-foreground text-xs">
                    192.0.2.100
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="rounded-lg border bg-background p-3">
                  <div className="font-mono text-sm">DNS Lookup</div>
                  <div className="text-muted-foreground text-xs">
                    TXT @ yourcompany.com
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="rounded-lg border bg-background p-3">
                  <div className="font-mono text-sm">SPF Check</div>
                  <div className="text-muted-foreground text-xs">
                    Is 192.0.2.100 allowed?
                  </div>
                </div>
              </div>
            </div>

            <CodeBlock label="Example SPF Record">
              v=spf1 include:_spf.google.com include:amazonses.com ~all
            </CodeBlock>

            <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-foreground/90 text-sm">
                <strong>Quick check:</strong> Not sure what your current SPF
                record looks like?{" "}
                <a className="text-primary hover:underline" href="/tools">
                  Analyze your domain
                </a>{" "}
                to see your SPF record and lookup count, or use our{" "}
                <a
                  className="text-primary hover:underline"
                  href="/tools/spf-builder"
                >
                  SPF builder
                </a>{" "}
                to create a new one.
              </p>
            </div>
          </section>

          {/* The 10-Lookup Problem */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <AlertTriangle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">The 10-Lookup Problem</h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              RFC 7208 limits SPF to 10 DNS lookups. This isn't a
              suggestion—it's a hard limit enforced by receiving servers. Exceed
              it, and your SPF evaluation returns PermError.
            </p>

            <InfoCard
              icon={AlertTriangle}
              title="What Happens at 11 Lookups"
              type="danger"
            >
              When your SPF record exceeds 10 lookups, receiving servers return
              a PermError. This is treated as an SPF failure, which causes DMARC
              to fail if you're using DMARC (and you should be). Your emails may
              be rejected or sent to spam.
            </InfoCard>

            <h3 className="mb-4 mt-8 font-semibold text-xl">
              Why Does This Limit Exist?
            </h3>
            <p className="mb-4 text-muted-foreground">
              The limit prevents denial-of-service attacks. Without it, an
              attacker could craft an SPF record with thousands of nested
              includes, forcing receiving servers to make endless DNS queries.
            </p>
            <p className="text-muted-foreground">
              It also encourages efficient SPF design. If you need more than 10
              lookups, you probably have too many email providers—or you need to
              use IP addresses directly.
            </p>
          </section>

          {/* How Lookups Work */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">How Lookups Are Counted</h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Not all SPF mechanisms are equal. Some require DNS lookups, others
              don't. Understanding this is key to staying under the limit.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardContent>
                  <h4 className="mb-3 font-semibold text-destructive">
                    Mechanisms That Count
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1">include:</code>
                      <span className="text-muted-foreground">
                        Each include = at least 1 lookup
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1">a</code>
                      <span className="text-muted-foreground">
                        Looks up A/AAAA records
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1">mx</code>
                      <span className="text-muted-foreground">
                        Looks up MX records
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1">ptr</code>
                      <span className="text-muted-foreground">
                        Reverse DNS lookup (deprecated)
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1">exists:</code>
                      <span className="text-muted-foreground">
                        Checks if record exists
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1">redirect=</code>
                      <span className="text-muted-foreground">
                        Redirects to another domain
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <h4 className="mb-3 font-semibold text-success">
                    Mechanisms That Don't Count
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1">ip4:</code>
                      <span className="text-muted-foreground">
                        Direct IPv4 address/CIDR
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1">ip6:</code>
                      <span className="text-muted-foreground">
                        Direct IPv6 address/CIDR
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1">all</code>
                      <span className="text-muted-foreground">
                        Catch-all at the end
                      </span>
                    </li>
                  </ul>
                  <InfoCard icon={CheckCircle} title="Pro Tip" type="tip">
                    If you have dedicated sending IPs, use ip4: or ip6:
                    mechanisms instead of includes to save lookups.
                  </InfoCard>
                </CardContent>
              </Card>
            </div>

            <h3 className="mb-4 mt-8 font-semibold text-xl">
              Nested Lookups Add Up
            </h3>
            <p className="mb-4 text-muted-foreground">
              Here's what catches people off guard:{" "}
              <code className="rounded bg-muted px-1">include:</code> mechanisms
              are recursive. When you include Google's SPF record, you're not
              just adding 1 lookup—you're adding however many lookups are in
              Google's record too.
            </p>
            <CodeBlock label="Google's SPF Record (Simplified)">
              {`v=spf1 include:_netblocks.google.com include:_netblocks2.google.com
       include:_netblocks3.google.com ~all`}
            </CodeBlock>
            <p className="text-muted-foreground text-sm">
              That's why{" "}
              <code className="rounded bg-muted px-1">
                include:_spf.google.com
              </code>{" "}
              costs 4 lookups, not 1.
            </p>
          </section>

          {/* Provider Lookup Costs */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Provider Lookup Costs</h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              Here's how many lookups popular email providers cost. Plan your
              SPF record accordingly.
            </p>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Mechanism
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Lookups
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {PROVIDER_LOOKUPS.map((provider) => (
                    <tr key={provider.name}>
                      <td className="px-4 py-3">{provider.name}</td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-muted px-1 font-mono text-xs">
                          {provider.mechanism}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-mono ${
                            provider.lookups >= 4
                              ? "text-warning"
                              : provider.lookups >= 3
                                ? "text-warning"
                                : "text-success"
                          }`}
                        >
                          {provider.lookups}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <InfoCard
              icon={AlertTriangle}
              title="Common Scenario"
              type="warning"
            >
              Google Workspace (4) + Microsoft 365 (2) + SendGrid (3) + HubSpot
              (2) = 11 lookups. You're already over the limit with just four
              providers.
            </InfoCard>
          </section>

          {/* SPF Flattening */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">SPF Flattening</h2>
            </div>
            <p className="mb-6 text-lg text-muted-foreground">
              SPF flattening resolves{" "}
              <code className="rounded bg-muted px-1">include:</code> mechanisms
              to their actual IP addresses, eliminating the DNS lookups
              entirely.
            </p>

            <div className="mb-6 grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-2 font-medium">Before Flattening</h4>
                <CodeBlock label="9 lookups">{`v=spf1 include:_spf.google.com
       include:sendgrid.net
       include:amazonses.com ~all`}</CodeBlock>
              </div>
              <div>
                <h4 className="mb-2 font-medium">After Flattening</h4>
                <CodeBlock label="0 lookups">{`v=spf1 ip4:209.85.128.0/17
       ip4:167.89.0.0/17
       ip4:23.249.208.0/20
       ... (many more IPs) ~all`}</CodeBlock>
              </div>
            </div>

            <Collapsible defaultOpen title="Pros of SPF Flattening">
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-success" />
                  Eliminates lookup limit concerns entirely
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-success" />
                  Faster SPF evaluation (no DNS chain to follow)
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-success" />
                  Can include unlimited providers
                </li>
              </ul>
            </Collapsible>

            <Collapsible title="Cons of SPF Flattening">
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                  Provider IPs change — you must update regularly
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                  Can exceed DNS record size limits (255 chars per string)
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                  Requires automation or a third-party service
                </li>
              </ul>
            </Collapsible>

            <InfoCard icon={CheckCircle} title="When to Flatten" type="tip">
              Only flatten if you've genuinely exceeded 10 lookups and can't
              reduce providers. Consider services like Valimail or dmarcian that
              automate IP monitoring and updates.
            </InfoCard>
          </section>

          {/* Best Practices */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">SPF Best Practices</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <CheckCircle className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <h4 className="font-medium">
                    End with ~all and let DMARC do the enforcing
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    M3AAWG's authentication BCP puts ~all on sending domains and
                    reserves -all for domains that never send. A hard fail can
                    get the message rejected before DATA, so a forwarded copy
                    dies even when its DKIM signature would have passed DMARC,
                    and it never shows up in an aggregate report. Publish ~all
                    and move DMARC to p=reject.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <CheckCircle className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <h4 className="font-medium">
                    Only authorize what you actually use
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    Don't add providers "just in case." Every include is a
                    potential lookup and a potential attack vector.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <CheckCircle className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <h4 className="font-medium">
                    Prefer IP mechanisms for dedicated IPs
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    If you have static sending IPs, use ip4: or ip6: instead of
                    includes to save lookups.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <CheckCircle className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <h4 className="font-medium">One SPF record per domain</h4>
                  <p className="text-muted-foreground text-sm">
                    Multiple SPF records cause evaluation failure. If you need
                    to add providers, merge them into one record.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <CheckCircle className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <h4 className="font-medium">Monitor with DMARC reports</h4>
                  <p className="text-muted-foreground text-sm">
                    Set up DMARC with reporting (rua=) to see who's sending as
                    your domain and catch SPF issues early.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Tool CTA */}
          <section className="rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-primary/5 p-8 text-center">
            <h3 className="mb-3 font-bold text-2xl">Build Your SPF Record</h3>
            <p className="mx-auto mb-6 max-w-lg text-muted-foreground">
              Use our free SPF Record Builder to generate a valid SPF record
              while tracking your lookup count in real time.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/tools/spf-builder">
                  Open SPF Builder
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/tools">Check Your Domain</Link>
              </Button>
            </div>
          </section>

          {/* Resources */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
                <ExternalLink className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-bold text-2xl">Additional Resources</h2>
            </div>

            <h3 className="mb-3 mt-6 font-semibold text-lg">Wraps Resources</h3>
            <div className="space-y-3 mb-6">
              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="/blog/your-dmarc-policy-is-useless"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>Your DMARC Policy Is Useless (and How to Fix It)</span>
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
                href="/blog/ses-sandbox-guide"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>How to Get Out of AWS SES Sandbox</span>
              </a>

              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="/docs/guides/domain-verification"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>Domain Verification Guide (DKIM, SPF, DMARC)</span>
              </a>
            </div>

            <h3 className="mb-3 font-semibold text-lg">External Resources</h3>
            <div className="space-y-3">
              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="https://datatracker.ietf.org/doc/html/rfc7208"
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                <span>RFC 7208: Sender Policy Framework (SPF)</span>
              </a>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
