import { Badge } from "@wraps/ui/components/ui/badge";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { SES_ERRORS } from "@/lib/ses-errors";

const TITLE = "Running Amazon SES in Production";
const DESCRIPTION =
  "A working reference for operating Amazon SES: the exceptions it throws, what each one means, and the operational limits AWS enforces on every account.";
const URL = "https://wraps.dev/ses";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
    type: "website",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
  },
  alternates: { canonical: URL },
};

const collectionSchema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: TITLE,
  description: DESCRIPTION,
  url: URL,
  publisher: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
};

const READING: { href: string; label: string; blurb: string }[] = [
  {
    href: "/blog/ses-sandbox-guide",
    label: "Getting out of the SES sandbox",
    blurb:
      "What AWS actually looks for in a production access request, and why requests get denied.",
  },
  {
    href: "/docs/guides/production-access",
    label: "Production access",
    blurb: "The request itself, step by step, with the state to check first.",
  },
  {
    href: "/docs/guides/bounce-handling",
    label: "Bounce handling",
    blurb:
      "Where bounce events come from and what has to happen to the address afterwards.",
  },
  {
    href: "/docs/guides/reputation",
    label: "Reputation",
    blurb:
      "The bounce and complaint numbers AWS enforces, and what moves them.",
  },
  {
    href: "/docs/guides/domain-verification",
    label: "Domain verification",
    blurb:
      "DKIM, SPF and DMARC records, and how SES decides a domain is ready.",
  },
  {
    href: "/tools/ses-calculator",
    label: "SES cost calculator",
    blurb: "What a given volume costs at AWS pricing, with nothing added on.",
  },
];

/**
 * The operational pages are written out as literal hrefs rather than mapped
 * from an array, so a grep for the route finds it here. `ses-errors.test.ts`
 * asserts that every /ses/* route appears in this file, which is what keeps the
 * hub from silently losing a child.
 */
function HubCard({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: string;
}) {
  return (
    <div className="rounded-lg border p-5">
      <h3 className="font-semibold">
        <Link className="text-primary underline underline-offset-4" href={href}>
          {label}
        </Link>
      </h3>
      <p className="mt-2 text-muted-foreground text-sm">{children}</p>
    </div>
  );
}

export default function Page() {
  return (
    <>
      <JsonLd data={collectionSchema} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />

        <header className="border-b pt-24 pb-12">
          <div className="container mx-auto max-w-4xl px-4">
            <Badge className="mb-4" variant="outline">
              Amazon SES
            </Badge>
            <h1 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
              Running Amazon SES in production
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              SES is cheap, reliable and almost entirely undocumented at the
              moment something breaks. This is the reference we keep for
              ourselves: the exceptions it throws, what each one actually means,
              and the operational limits AWS enforces on every account whether
              you use Wraps or not.
            </p>
          </div>
        </header>

        <main className="container mx-auto max-w-4xl px-4 py-12">
          <section aria-labelledby="errors">
            <h2 className="font-bold text-2xl tracking-tight" id="errors">
              Error reference
            </h2>
            <p className="mt-2 text-muted-foreground">
              {SES_ERRORS.length} AWS exceptions, each with the literal string
              AWS returns and the fix. Remediation is adapted from the Wraps
              CLI&apos;s own error catalog rather than written from memory, and
              a test fails if the two drift apart.
            </p>
            <div className="mt-5 rounded-lg border p-6">
              <h3 className="font-semibold text-lg">
                <Link
                  className="text-primary underline underline-offset-4"
                  href="/ses/errors"
                >
                  Amazon SES error codes
                </Link>
              </h3>
              <p className="mt-2 text-muted-foreground">
                Grouped by what went wrong: identity and verification,
                throughput and quota, account state, credentials and
                permissions.
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {SES_ERRORS.map((error) => (
                  <li key={error.slug}>
                    <Link
                      className="text-primary text-sm underline underline-offset-4"
                      href={`/ses/errors/${error.slug}`}
                    >
                      {error.awsExceptionName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section aria-labelledby="operations" className="mt-14">
            <h2 className="font-bold text-2xl tracking-tight" id="operations">
              When something is wrong and there is no error message
            </h2>
            <p className="mt-2 mb-5 text-muted-foreground">
              The failures SES does not throw an exception for. Every percentage
              on these pages is quoted from AWS&apos;s own documentation and
              linked back to it, because the numbers move and a number without a
              source is not worth acting on.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <HubCard href="/ses/bounce-rate" label="Bounce rate">
                What SES actually counts, the review and pause thresholds AWS
                publishes, and the order to work through when the number climbs.
              </HubCard>
              <HubCard href="/ses/complaint-rate" label="Complaint rate">
                Why 0.1 percent is the line, and why the rate SES shows you is
                lower than the rate recipients are generating.
              </HubCard>
              <HubCard
                href="/ses/account-under-review"
                label="Account under review or paused"
              >
                Two states with two different consequences. What each permits,
                what to put in the reply to AWS, and what makes it worse.
              </HubCard>
              <HubCard href="/ses/limits" label="Sending limits">
                Sandbox quotas, the per-second rate against the rolling 24-hour
                cap, and how increases actually happen.
              </HubCard>
              <HubCard href="/ses/spam-folder" label="Mail going to spam">
                Authentication first, then reputation, then content. In that
                order, because the first one is cheap to settle.
              </HubCard>
            </div>
          </section>

          <section aria-labelledby="reading" className="mt-14">
            <h2 className="font-bold text-2xl tracking-tight" id="reading">
              Further reading
            </h2>
            <p className="mt-2 mb-5 text-muted-foreground">
              The depth behind the pages above: the sandbox request in full, the
              event pipeline behind bounce handling, and what a given volume
              costs.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {READING.map((item) => (
                <div className="rounded-lg border p-5" key={item.href}>
                  <h3 className="font-semibold">
                    <Link
                      className="text-primary underline underline-offset-4"
                      href={item.href}
                    >
                      {item.label}
                    </Link>
                  </h3>
                  <p className="mt-2 text-muted-foreground text-sm">
                    {item.blurb}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="wraps"
            className="mt-14 rounded-lg border bg-muted/40 p-6"
          >
            <h2 className="mb-3 font-bold text-xl tracking-tight" id="wraps">
              Where Wraps fits
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Wraps deploys email infrastructure into your own AWS account and
              gives you the platform layer SES does not have: a dashboard,
              templates, contacts, broadcasts and an SDK. Sending runs through
              your SES at AWS pricing, so the limits, the reputation and the
              quotas on this page stay yours. That is the honest split. Wraps
              makes SES easier to operate and cannot override anything AWS
              controls.
            </p>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Wraps-side error codes, as opposed to the AWS ones above, are in
              the{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href="/docs/reference/errors"
              >
                CLI error reference
              </Link>
              .
            </p>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
