import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import ToolsPageContent from "./page-content";

export const metadata: Metadata = {
  title: "Free Email Tools - SPF, DMARC, and Amazon SES Checks",
  description:
    "Free tools to check your email deliverability setup. DMARC analyzer, SPF validator, and more.",
  openGraph: {
    title: "Email Tools | Wraps",
    description:
      "Free tools to check your email deliverability setup. DMARC analyzer, SPF validator, and more.",
  },
  twitter: {
    title: "Email Tools | Wraps",
    description:
      "Free tools to check your email deliverability setup. DMARC analyzer, SPF validator, and more.",
  },
  alternates: {
    canonical: "https://wraps.dev/tools",
  },
};

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Wraps Email Deliverability Checker",
  description:
    "Free tools to check your email deliverability setup including DMARC analyzer, SPF validator, DKIM checker, and domain reputation tools.",
  url: "https://wraps.dev/tools",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  provider: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
  featureList: [
    "DMARC policy analyzer",
    "SPF record validator",
    "DKIM signature checker",
    "Domain reputation check",
    "MX record verification",
  ],
};

export default function ToolsPage() {
  return (
    <>
      <JsonLd data={webAppSchema} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />

        {/* Main Content */}
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="mx-auto max-w-4xl">
            {/* Page Header */}
            <div className="mb-12">
              <div className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                <span className="size-1.5 rounded-full bg-orange-500" />
                <span>wraps · free tool</span>
              </div>
              <h1 className="mb-4 text-pretty font-heading font-semibold text-3xl tracking-tight sm:text-5xl">
                Email Deliverability{" "}
                <span className="text-orange-500">Checker</span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Check your domain's email authentication setup. We analyze SPF,
                DKIM, DMARC, and MX records to help you improve deliverability.
              </p>
            </div>

            {/* Interactive Widget */}
            <Suspense>
              <ToolsPageContent />
            </Suspense>

            {/* Info Section */}
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="font-heading text-base tracking-tight">
                    What is SPF?
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  Sender Policy Framework (SPF) specifies which mail servers are
                  authorized to send email on behalf of your domain.{" "}
                  <a
                    className="text-orange-500 underline underline-offset-2 hover:text-orange-600"
                    href="/tools/spf-builder"
                  >
                    Build your SPF record →
                  </a>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="font-heading text-base tracking-tight">
                    What is DKIM?
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  DomainKeys Identified Mail (DKIM) adds a digital signature to
                  emails, allowing receivers to verify the message hasn't been
                  altered.
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="font-heading text-base tracking-tight">
                    What is DMARC?
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  Domain-based Message Authentication (DMARC) tells receivers
                  how to handle emails that fail SPF or DKIM checks.
                </CardContent>
              </Card>
            </div>

            {/* Cost Calculator CTA */}
            <Card className="mt-8 border-border bg-card">
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="flex-1">
                    <h3 className="mb-2 font-heading font-semibold text-xl tracking-tight">
                      Calculate your AWS SES costs
                    </h3>
                    <p className="text-muted-foreground">
                      See exactly what you&apos;ll pay for email sending plus
                      the full infrastructure — EventBridge, Lambda, SQS, and
                      DynamoDB.
                    </p>
                  </div>
                  <Button
                    asChild
                    className="bg-orange-500 text-white hover:bg-orange-600"
                    size="lg"
                  >
                    <Link href="/tools/ses-calculator">Open Calculator</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Learn More */}
            <div className="mt-8">
              <p className="mb-4 text-muted-foreground">
                Want to learn more about email authentication?
              </p>
              <Button asChild variant="outline">
                <Link href="/blog/your-dmarc-policy-is-useless">
                  Read: Why DMARC Is Broken
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
