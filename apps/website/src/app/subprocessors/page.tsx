import { Card } from "@wraps/ui/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";

const TITLE = "Subprocessors";
const DESCRIPTION =
  "The complete list of third parties that process data on behalf of Wraps: what each one receives, why, and where it is located. Updated whenever the list changes.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
    url: "https://wraps.dev/subprocessors",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
  },
  alternates: { canonical: "https://wraps.dev/subprocessors" },
};

const LAST_UPDATED = "August 28, 2026";

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://wraps.dev",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Subprocessors",
      item: "https://wraps.dev/subprocessors",
    },
  ],
};

type Subprocessor = {
  name: string;
  purpose: string;
  data: string;
  location: string;
  privacyUrl: string;
};

const subprocessors: Subprocessor[] = [
  {
    name: "Amazon Web Services",
    purpose:
      "Hosting for the Wraps API (Lambda), and the target of every infrastructure deployment",
    data: "Infrastructure deployed into your own AWS account. AWS processes your email content and recipients as your provider, under your own agreement with AWS — not ours.",
    location: "United States",
    privacyUrl: "https://aws.amazon.com/privacy/",
  },
  {
    name: "Vercel",
    purpose: "Hosting for the marketing site and the web dashboard",
    data: "HTTP request metadata, IP addresses, and server logs (7 days)",
    location: "United States",
    privacyUrl: "https://vercel.com/legal/privacy-policy",
  },
  {
    name: "Neon",
    purpose: "Managed PostgreSQL for all platform data",
    data: "Account and organization records, contacts and audiences, templates, workflows, the send ledger, and recipient engagement metadata",
    location: "United States",
    privacyUrl: "https://neon.tech/privacy-policy",
  },
  {
    name: "PostHog",
    purpose: "Product analytics across the CLI, dashboard, and website",
    data: "Anonymous CLI telemetry (90 days), dashboard usage events, and website analytics. AWS account IDs are hashed. Opt-out is supported in the CLI and the dashboard.",
    location: "United States",
    privacyUrl: "https://posthog.com/privacy",
  },
  {
    name: "Sentry",
    purpose:
      "Error monitoring and performance tracing for the API and dashboard",
    data: "Stack traces, request context, and the authenticated user identifier attached to an error",
    location: "United States",
    privacyUrl: "https://sentry.io/privacy/",
  },
  {
    name: "Stripe",
    purpose: "Payment processing and subscription billing",
    data: "Billing contact details and payment method. Card numbers go directly to Stripe and are never held by Wraps.",
    location: "United States",
    privacyUrl: "https://stripe.com/privacy",
  },
];

export default function SubprocessorsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <JsonLd data={breadcrumbSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <section className="mb-12">
            <SectionKicker>Trust</SectionKicker>
            <h1 className="mb-5 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Subprocessors
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              These are every third party that processes data on behalf of Wraps
              in the course of providing the service. The list is short by
              design, and it is published rather than available on request.
            </p>
            <p className="max-w-2xl text-muted-foreground">
              Note what is <em>not</em> on it: the emails you send, their
              recipients, and their delivery events are processed by AWS inside
              your own AWS account, under your own agreement with AWS. Wraps is
              not a subprocessor of your sending path.
            </p>
          </section>

          <section className="mb-12">
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">
                        Subprocessor
                      </th>
                      <th className="p-4 text-left font-medium">Purpose</th>
                      <th className="p-4 text-left font-medium">
                        Data processed
                      </th>
                      <th className="p-4 text-left font-medium">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subprocessors.map((sub) => (
                      <tr className="border-b last:border-0" key={sub.name}>
                        <td className="p-4 align-top">
                          <a
                            className="font-medium text-primary underline"
                            href={sub.privacyUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            {sub.name}
                          </a>
                        </td>
                        <td className="p-4 align-top text-muted-foreground">
                          {sub.purpose}
                        </td>
                        <td className="p-4 align-top text-muted-foreground">
                          {sub.data}
                        </td>
                        <td className="p-4 align-top whitespace-nowrap text-muted-foreground">
                          {sub.location}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          <section className="mb-12">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Changes to this list
            </h2>
            <p className="mb-4 max-w-2xl text-muted-foreground">
              Before we engage a new subprocessor that processes personal data,
              we will update this page and give customers at least 30 days'
              notice by email. If you object to a new subprocessor on reasonable
              data-protection grounds, tell us within that window and you may
              terminate the affected service without penalty.
            </p>
            <p className="max-w-2xl text-muted-foreground">
              To be notified when this page changes, email{" "}
              <a
                className="text-primary underline"
                href="mailto:privacy@wraps.dev"
              >
                privacy@wraps.dev
              </a>{" "}
              and ask to be added to the subprocessor notice list.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              International transfers
            </h2>
            <p className="max-w-2xl text-muted-foreground">
              Every subprocessor above processes data in the United States. If
              you send to recipients in the EEA, the UK, or Switzerland, their
              contact records, send history, and engagement metadata are
              transferred to and stored in the United States. Standard
              Contractual Clauses are incorporated into our{" "}
              <Link className="text-primary underline" href="/dpa">
                data processing agreement
              </Link>
              .
            </p>
          </section>

          <p className="text-muted-foreground text-sm">
            Last updated {LAST_UPDATED}. See also{" "}
            <Link className="text-primary underline" href="/security">
              Security
            </Link>{" "}
            and the{" "}
            <Link className="text-primary underline" href="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
