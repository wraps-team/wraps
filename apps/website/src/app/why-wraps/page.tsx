import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  ArrowRight,
  Calculator,
  Check,
  Code,
  Lock,
  Server,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { CopyLinkButton } from "./components/copy-link-button";
import { FaqSection } from "./components/faq-section";

export const metadata: Metadata = {
  title: "Why Wraps - Amazon SES Pricing with Modern Developer Experience",
  description:
    "Own your infrastructure, pay AWS prices, keep the great DX. No vendor lock-in, full data control.",
  openGraph: {
    title: "Why Wraps | Wraps",
    description:
      "Own your infrastructure, pay AWS prices, keep the great DX. No vendor lock-in, full data control.",
  },
  twitter: {
    title: "Why Wraps | Wraps",
    description:
      "Own your infrastructure, pay AWS prices, keep the great DX. No vendor lock-in, full data control.",
  },
  alternates: {
    canonical: "https://wraps.dev/why-wraps",
  },
};

const costComparison = [
  {
    volume: "1K/mo",
    saas: "$0-30",
    wrapsPlatform: "Free",
    trackedEvents: "5K/mo",
    awsCost: "~$0.10 (à la carte)",
  },
  {
    volume: "10K/mo",
    saas: "$15-100",
    wrapsPlatform: "Free",
    trackedEvents: "5K/mo",
    awsCost: "~$1",
  },
  {
    volume: "50K/mo",
    saas: "$20-150",
    wrapsPlatform: "$19",
    trackedEvents: "50K/mo",
    awsCost: "~$5",
  },
  {
    volume: "100K/mo",
    saas: "$35-200",
    wrapsPlatform: "$19",
    trackedEvents: "50K/mo",
    awsCost: "~$10",
  },
  {
    volume: "500K/mo",
    saas: "$350-720",
    wrapsPlatform: "$79",
    trackedEvents: "250K/mo",
    awsCost: "~$50",
  },
];

const securityPoints = [
  "Zero stored credentials — temporary access via OIDC and IAM roles, no API keys to rotate",
  "Infrastructure runs in your AWS account, not ours",
  "Your sending infrastructure and raw event history live in your AWS account — dashboard features like broadcasts and hosted templates are processed and stored by the Wraps platform",
  "Open source — audit the code yourself",
  "Inherits your existing AWS compliance (SOC2, HIPAA, etc.)",
];

const lockInPoints = [
  "All infrastructure is deployed to your AWS account",
  "If you stop using Wraps, everything keeps running",
  "Standard AWS services underneath (SES, DynamoDB, Lambda)",
  "Export data anytime - it's in your DynamoDB",
  "CLI is open source under AGPLv3; the SDKs are MIT — neither affects your application code",
];

export default function WhyWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="mx-auto max-w-4xl">
          {/* Page Header */}
          <div className="mb-12">
            <SectionKicker>Wraps · Evaluation guide</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight">
              Why Wraps
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Everything you need to evaluate Wraps for your team. Share this
              page with your manager or teammates.
            </p>
            <CopyLinkButton />
          </div>

          {/* Cost Comparison */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Calculator className="size-6 text-muted-foreground" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Cost Comparison
              </h2>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-4 text-left font-medium">
                          Send Volume
                        </th>
                        <th className="p-4 text-left font-medium text-primary">
                          Tracked Events
                        </th>
                        <th className="p-4 text-left font-medium">
                          Email SaaS
                        </th>
                        <th className="p-4 text-left font-medium text-primary">
                          Wraps Platform
                        </th>
                        <th className="p-4 text-left font-medium text-muted-foreground">
                          + AWS Cost
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {costComparison.map((row) => (
                        <tr key={row.volume}>
                          <td className="p-4 text-muted-foreground">
                            {row.volume}
                          </td>
                          <td className="p-4 text-primary">
                            {row.trackedEvents}
                          </td>
                          <td className="p-4">{row.saas}</td>
                          <td className="p-4 font-medium text-primary">
                            {row.wrapsPlatform}
                          </td>
                          <td className="p-4 text-muted-foreground">
                            {row.awsCost}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <p className="mt-4 text-muted-foreground text-sm">
              Email SaaS examples: Mailchimp, Resend, SendGrid, Postmark,
              Customer.io. Wraps Platform is a flat fee for tooling (dashboard,
              workflows, templates, analytics) — not based on email volume. You
              pay AWS directly for sending at $0.10/1K emails on à la carte (AWS
              defaults new accounts to $0.16/1K). Email engagement events
              (delivered, opened, clicked, bounced) don&apos;t count against
              your tier &mdash; only custom events you track do, so the tier
              rows above assume modest custom-event usage.{" "}
              <a className="text-primary underline" href="/platform#pricing">
                See what each tier includes
              </a>
            </p>
          </section>

          {/* Security & Compliance */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Lock className="size-6 text-muted-foreground" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Security & Compliance
              </h2>
            </div>
            <Card>
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {securityPoints.map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* No Vendor Lock-in */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Server className="size-6 text-muted-foreground" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                No Vendor Lock-in
              </h2>
            </div>
            <Card>
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {lockInPoints.map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Developer Experience */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Code className="size-6 text-muted-foreground" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Developer Experience
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">TypeScript SDK</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Full type safety, intuitive API, great autocomplete.{" "}
                    <code className="rounded bg-muted px-1">email.send()</code>
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">One-Command Setup</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    <code className="rounded bg-muted px-1">
                      npx @wraps.dev/cli email init
                    </code>{" "}
                    deploys everything.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Local Dashboard</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Free local console for development. Upgrade to the hosted
                    platform for workflows, templates, and analytics.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Event Tracking</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Sends, deliveries, opens, clicks, bounces - all tracked in
                    DynamoDB.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* FAQ for Decision Makers */}
          <FaqSection />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Ready to try it?
            </h2>
            <p className="mb-6 text-muted-foreground">
              Deploy in 2 minutes. No credit card required.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/docs/quickstart">
                  Get Started
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/tools/ses-calculator">Calculate Your Costs</Link>
              </Button>
            </div>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
