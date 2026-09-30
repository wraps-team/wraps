import { Card, CardContent } from "@wraps/ui/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import ToolsPageContent from "../page-content";

const description =
  "Check whether a domain or its mail servers appear on 10 widely used DNS blocklists, including Spamhaus, Barracuda and SpamCop, and see what a listing means.";

export const metadata: Metadata = {
  title: "Domain Blacklist Check",
  description,
  openGraph: {
    title: "Domain Blacklist Check | Wraps",
    description,
  },
  twitter: {
    title: "Domain Blacklist Check | Wraps",
    description,
  },
  alternates: {
    canonical: "https://wraps.dev/tools/blacklist-check",
  },
};

const sections = [
  {
    heading: "Exactly what this check queries",
    paragraphs: [
      "A DNS blocklist is queried over DNS. You reverse an IP address or take a domain name, add the list's zone, and ask for an A record. If an answer comes back in the 127.0.0.0/8 range, the target is listed. No answer means it is not.",
      "This page runs the quick version, which uses 10 lists: Spamhaus ZEN, Spamhaus DBL, Barracuda, SpamCop, CBL, SORBS, URIBL, SURBL, Mailspike and Invaluement. Your domain name is queried against the first five. The IPv4 addresses of your MX hosts are queried against all ten. The full mode in the CLI package covers many more lists, but the website tool does not run it.",
    ],
  },
  {
    heading: "What it does not check",
    paragraphs: [
      "The IPs tested are the ones your MX records resolve to. Those are the servers that receive your mail, and they are often a different set from the servers that send it. If you send through Amazon SES on shared IPs, the sending addresses belong to Amazon, and this check will not see them. With dedicated IPs, check those addresses against the lists you care about separately.",
      "So a clean result here means your domain and your inbound servers are not listed on those ten lists at the moment of the query. It says nothing about your sending reputation with Gmail or Microsoft, which is built from complaint rates and engagement rather than DNS lists.",
    ],
  },
  {
    heading: "Which listings matter",
    paragraphs: [
      "The checker tags every list as critical, high or medium. Spamhaus ZEN and DBL are the critical ones because many receivers consult Spamhaus when deciding whether to accept a message. Barracuda, SpamCop and CBL are marked high. The rest are medium, and a listing on one of those is worth knowing about but is less often the reason mail is rejected.",
      "A listing does not mean you sent spam. Domain lists such as DBL and URIBL react to domains showing up in spam content or campaigns. IP lists react to spam traffic or a compromised host. A shared mail server can inherit a listing from a neighbor.",
    ],
  },
  {
    heading: "If you are listed",
    paragraphs: [
      "Each listing in the results comes with a delisting link when the checker knows one. Read the list's own lookup page first, because it usually states the reason. Fix that cause before you request removal. Requesting delisting with the cause unresolved tends to get you relisted.",
      "Check for a compromised account or a form on your site being used to relay mail. Then look at how you collect addresses, since old or purchased lists produce spam traps. Once you are delisted, keep the DMARC and DKIM setup tight so a listing does not recur through spoofed mail.",
    ],
  },
  {
    heading: "About false alarms",
    paragraphs: [
      "Some blocklists refuse queries that come from large public DNS resolvers and answer with an error address instead of a real listing. The checker ignores those error responses and any answer outside the 127 range, so a refused query does not show up as a listing. If a list is unreachable, that list is skipped instead of counted as clean or listed.",
    ],
  },
];

const faqs = [
  {
    question: "How do I check if my domain is blacklisted?",
    answer:
      "Enter it above. The check queries your domain against five domain blocklists and your MX server IPs against ten, and lists any hits with a delisting link where one is known.",
  },
  {
    question: "Does being on a blacklist mean my emails will bounce?",
    answer:
      "Not always. It depends on whether the receiving server consults that list. A Spamhaus listing tends to matter more than one on a smaller list.",
  },
  {
    question: "Does this check my Amazon SES sending IPs?",
    answer:
      "No. It checks the IPs behind your MX records, which handle inbound mail. Shared SES sending IPs belong to Amazon. If you have dedicated IPs, look those up separately.",
  },
  {
    question: "Can I get delisted for free?",
    answer:
      "Most lists let you request removal at no cost after you fix the cause. Fix it first, since a repeat listing is harder to get lifted.",
  },
];

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Wraps Domain Blacklist Check",
  description,
  url: "https://wraps.dev/tools/blacklist-check",
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
    "Domain check against five DNS blocklists",
    "MX server IP check against ten DNS blocklists",
    "Priority rating per listing",
    "Delisting links where known",
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

const linkClass = "text-brand underline underline-offset-2";

export default function BlacklistCheckPage() {
  return (
    <>
      <JsonLd data={webAppSchema} />
      <JsonLd data={faqSchema} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />

        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="mx-auto max-w-4xl">
            <div className="mb-12">
              <div className="mb-5 inline-flex items-center gap-2 font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
                <span className="size-1.5 rounded-full bg-brand" />
                <span>wraps · free tool</span>
              </div>
              <h1 className="mb-4 text-pretty font-heading font-semibold text-3xl tracking-tight sm:text-5xl">
                Domain Blacklist <span className="text-brand">Check</span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                See whether your domain or its mail servers show up on 10 widely
                used DNS blocklists, with a priority rating and a delisting link
                for each hit.
              </p>
            </div>

            <Suspense>
              <ToolsPageContent focus="blacklist" />
            </Suspense>

            <div className="mt-12 space-y-8">
              {sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
                    {section.heading}
                  </h2>
                  <div className="space-y-3 text-muted-foreground">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <section className="mt-12">
              <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
                Questions
              </h2>
              <div className="space-y-4">
                {faqs.map((faq) => (
                  <Card className="border-border bg-card" key={faq.question}>
                    <CardContent>
                      <h3 className="mb-2 font-heading font-semibold text-base tracking-tight">
                        {faq.question}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {faq.answer}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section className="mt-12">
              <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
                Keep going
              </h2>
              <p className="text-muted-foreground">
                The result above also grades SPF, DKIM, DMARC and MX. For the
                background on listings, read the glossary entry on{" "}
                <Link className={linkClass} href="/glossary/blocklist">
                  blocklists
                </Link>
                . For a closer read of one record, use the{" "}
                <Link className={linkClass} href="/tools/dmarc-checker">
                  DMARC record checker
                </Link>{" "}
                or the{" "}
                <Link className={linkClass} href="/tools/mx-lookup">
                  MX record lookup
                </Link>
                . The{" "}
                <Link className={linkClass} href="/tools">
                  full deliverability checker
                </Link>{" "}
                and the{" "}
                <Link className={linkClass} href="/tools/spf-builder">
                  SPF builder
                </Link>{" "}
                cover the rest.
              </p>
            </section>
          </div>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
