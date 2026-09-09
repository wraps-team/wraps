import { Button } from "@wraps/ui/components/ui/button";
import { Card } from "@wraps/ui/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";

const TITLE = "Migrate to Amazon SES";
const DESCRIPTION =
  "Provider-by-provider guides for moving email onto Amazon SES in your own AWS account: SendGrid, Mailgun, Postmark, Resend, and the Amazon Pinpoint shutdown. Each one says who should stay put.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "migrate to amazon ses",
    "move email to aws ses",
    "ses migration guide",
    "switch email provider to ses",
  ],
  openGraph: {
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
    url: "https://wraps.dev/migrate",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://wraps.dev/migrate",
  },
};

const guides: {
  href: string;
  from: string;
  hardestPart: string;
  summary: string;
}[] = [
  {
    href: "/migrate/sendgrid",
    from: "SendGrid",
    hardestPart: "Subusers",
    summary:
      "Per-tenant reputation isolation has no SES equivalent, and Inbound Parse, unsubscribe groups, and Marketing Campaigns all need somewhere else to live.",
  },
  {
    href: "/migrate/mailgun",
    from: "Mailgun",
    hardestPart: "Routes and the Region",
    summary:
      "Every domain is pinned to the US or EU endpoint, three suppression lists collapse into one, and expression-matched Routes become Region-limited receipt rules.",
  },
  {
    href: "/migrate/postmark",
    from: "Postmark",
    hardestPart: "Message Streams",
    summary:
      "The wall between transactional and broadcast disappears, inbound parsing becomes raw MIME, and under about fifty thousand a month the money argument does not hold.",
  },
  {
    href: "/migrate/resend",
    from: "Resend",
    hardestPart: "Knowing whether to bother",
    summary:
      "Resend already runs on SES, so SPF often needs no change and React Email templates move unedited. Under about a hundred thousand a month, staying is usually cheaper.",
  },
  {
    href: "/migrate/amazon-pinpoint",
    from: "Amazon Pinpoint",
    hardestPart: "A deadline",
    summary:
      "AWS ends support on 30 October 2026. Email moves to SES; segments, campaigns, journeys, and analytics have no direct successor.",
  },
];

const shared = [
  {
    title: "Production access is the long pole",
    body: "A new SES account is sandboxed to verified addresses. Getting out is an application AWS reviews, typically answering within 24 hours and taking longer if it asks for more information, and it can be refused. File it on day one of any migration, before the code work starts.",
  },
  {
    title: "Publish DNS for both senders at once",
    body: "Add the SES DKIM records and SPF include alongside the incumbent's rather than swapping them. Remove the old records after traffic has moved. DMARC never needs to change.",
  },
  {
    title: "Your domain reputation travels, your IP reputation does not",
    body: "Mailbox providers score the domain, and that history follows you. A dedicated IP at your old provider stays with them. Most senders should start on the AWS shared pool rather than warming a new dedicated IP from cold.",
  },
  {
    title: "Export suppressions before you cancel anything",
    body: "Every provider hands these back while you are a customer and not afterwards. Re-mailing someone who unsubscribed is a compliance problem, and SES only stores bounces and complaints, so the opt-outs need a home of their own.",
  },
  {
    title: "Reputation becomes account-wide",
    body: "SES measures bounce and complaint rates across the whole account, per Region. Providers that isolated reputation per subuser, per domain, or per stream were protecting you from something you now carry yourself.",
  },
];

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
      name: "Migrate",
      item: "https://wraps.dev/migrate",
    },
  ],
};

const itemListSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: TITLE,
  description: DESCRIPTION,
  itemListElement: guides.map((guide, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: `Migrate from ${guide.from} to Amazon SES`,
    url: `https://wraps.dev${guide.href}`,
  })),
};

export default function MigrateHubPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={itemListSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <section className="mb-14">
            <SectionKicker>Migration guides</SectionKicker>
            <h1 className="mb-5 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Migrate to Amazon SES
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              Moving to SES is mostly the same five moves whoever you are
              leaving: republish DNS, get out of the sandbox, carry the
              suppression list across, port the templates, swap the client. What
              differs is the one feature your provider had that SES does not.
            </p>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Each guide leads with that feature, and each one opens by saying
              who should stay where they are.
            </p>
          </section>

          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              Pick your provider
            </h2>
            <div className="grid gap-4">
              {guides.map((guide) => (
                <Card className="p-6" key={guide.href}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-2xl">
                      <div className="mb-2 flex flex-wrap items-center gap-2.5">
                        <h3 className="font-semibold text-foreground text-lg">
                          {guide.from}
                        </h3>
                        <span className="inline-block whitespace-nowrap rounded bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
                          Hardest part: {guide.hardestPart}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm leading-[1.6]">
                        {guide.summary}
                      </p>
                    </div>
                    <Button
                      asChild
                      className="shrink-0 cursor-pointer"
                      variant="outline"
                    >
                      <Link href={guide.href}>
                        Read the guide
                        <ArrowRight
                          aria-hidden="true"
                          className="ml-1.5 size-4"
                        />
                      </Link>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              True of every one of them
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Five facts that hold no matter who you are leaving. The individual
              guides do not repeat them at length, so read them once here.
            </p>
            <div className="grid gap-6">
              {shared.map((item) => (
                <div key={item.title}>
                  <h3 className="mb-1.5 font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground leading-[1.6]">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Still deciding rather than migrating
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              These guides assume you have already chosen to leave. If you have
              not, the ranked lists and head-to-head pages are the better
              starting point.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/alternatives">Alternatives, ranked</Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/compare">Head-to-head comparisons</Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/tools/ses-calculator">SES cost calculator</Link>
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-muted/30 p-8">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              The SES half, in one command
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Whichever guide you are reading, the sending stack is the same
              work. Wraps deploys SES with its event pipeline into your own AWS
              account, or adopts the one you already have without touching it.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/docs/quickstart/email">
                  Deploy SES
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/docs/guides/migration">
                  General migration guide
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
