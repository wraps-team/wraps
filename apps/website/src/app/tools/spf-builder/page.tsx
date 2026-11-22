import { Badge } from "@wraps/ui/components/ui/badge";
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
import { pageMetadata } from "@/lib/page-metadata";
import SPFBuilderWidget from "./page-content";

export const metadata: Metadata = pageMetadata({
  title: "SPF Record Builder",
  description:
    "Build and validate your SPF record. Avoid the 10-lookup limit with our interactive tool.",
  path: "/tools/spf-builder",
});

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "SPF Record Builder",
  description:
    "Interactive tool to build and validate SPF records while tracking the 10-lookup limit. Select email providers and generate correct SPF syntax.",
  url: "https://wraps.dev/tools/spf-builder",
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
    "Real-time DNS lookup counter",
    "Pre-configured email provider includes",
    "Custom IP address support",
    "SPF syntax validation",
    "Copy-to-clipboard functionality",
  ],
};

export default function SPFBuilderPage() {
  return (
    <>
      <JsonLd data={webAppSchema} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />

        {/* Main Content */}
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="mx-auto max-w-4xl">
            {/* Page Header */}
            <div className="mb-12 text-center">
              <Badge className="mb-4" variant="outline">
                Free Tool
              </Badge>
              <h1 className="mb-4 font-bold text-4xl tracking-tight">
                SPF Record Builder
              </h1>
              <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                Build valid SPF records while tracking the 10-lookup limit.
                Select your email providers and we'll generate the correct
                syntax.
              </p>
            </div>

            {/* Interactive Widget */}
            <Suspense>
              <SPFBuilderWidget />
            </Suspense>

            {/* Info Cards */}
            <div className="mt-6 grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    What counts as a lookup?
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  <code className="text-foreground">include:</code>,{" "}
                  <code className="text-foreground">a</code>,{" "}
                  <code className="text-foreground">mx</code>,{" "}
                  <code className="text-foreground">ptr</code>, and{" "}
                  <code className="text-foreground">exists</code> mechanisms all
                  require DNS lookups.{" "}
                  <code className="text-foreground">ip4:</code> and{" "}
                  <code className="text-foreground">ip6:</code> do not.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Why the 10-lookup limit?
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  RFC 7208 limits SPF to 10 DNS lookups to prevent denial of
                  service attacks. Exceeding this causes a PermError, which
                  fails DMARC alignment.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    What is SPF flattening?
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  SPF flattening resolves includes to their IP addresses,
                  eliminating lookups. But IPs can change, requiring regular
                  updates or a service like Valimail.
                </CardContent>
              </Card>
            </div>

            {/* CTA */}
            <Card className="mt-6 border-primary/20 bg-primary/5">
              <CardContent>
                <div className="flex flex-col items-center gap-4 text-center md:flex-row md:text-left">
                  <div className="flex-1">
                    <h3 className="mb-2 font-bold text-xl">
                      Check your full email setup
                    </h3>
                    <p className="text-muted-foreground">
                      Use our Email Deliverability Checker to verify SPF, DKIM,
                      DMARC, and more.
                    </p>
                  </div>
                  <Button asChild size="lg">
                    <Link href="/tools">
                      Check Your Domain
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Cost Calculator CTA */}
            <Card className="mt-6 border-primary/20 bg-primary/5">
              <CardContent>
                <div className="flex flex-col items-center gap-4 text-center md:flex-row md:text-left">
                  <div className="flex-1">
                    <h3 className="mb-2 font-bold text-xl">
                      Calculate your AWS SES costs
                    </h3>
                    <p className="text-muted-foreground">
                      See exactly what you&apos;ll pay for email sending plus
                      the full infrastructure — EventBridge, Lambda, SQS, and
                      DynamoDB.
                    </p>
                  </div>
                  <Button asChild size="lg">
                    <Link href="/tools/ses-calculator">
                      Open Calculator
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Learn More */}
            <div className="mt-6 text-center">
              <p className="mb-4 text-muted-foreground">
                Want to learn more about SPF and the 10-lookup problem?
              </p>
              <Button asChild variant="outline">
                <Link href="/blog/spf-guide">
                  Read: The SPF 10-Lookup Limit Explained
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
