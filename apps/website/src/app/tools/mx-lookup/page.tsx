import { Card, CardContent } from "@wraps/ui/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import ToolsPageContent from "../page-content";

const description =
  "Look up a domain's MX records: mail server hostnames, priorities, whether each host resolves, and warnings for IP-address or localhost targets.";

export const metadata: Metadata = {
  title: "MX Record Lookup",
  description,
  openGraph: {
    title: "MX Record Lookup | Wraps",
    description,
  },
  twitter: {
    title: "MX Record Lookup | Wraps",
    description,
  },
  alternates: {
    canonical: "https://wraps.dev/tools/mx-lookup",
  },
};

const sections = [
  {
    heading: "What this lookup returns",
    paragraphs: [
      "Enter a domain and the tool asks DNS for its MX records. Each record has a priority number and a hostname. For every hostname it then looks up the A and AAAA records to confirm the host resolves to at least one address, and it collects reverse DNS names for those addresses. The list on the page shows the hostname and priority. The warnings come from the checks behind it.",
      "The same run also grades SPF, DKIM, DMARC and blacklists. The MX section is listed first on this page. Nothing else about the check changes.",
    ],
  },
  {
    heading: "How priority works",
    paragraphs: [
      "The lowest number is tried first. A domain with 10 mail1.example.net and 20 mail2.example.net sends everything to mail1 and falls back to mail2 only when mail1 cannot be reached. Two records with the same number share the load.",
      "Backups are where people go wrong. A backup server with a lower number than the primary becomes the primary. A backup that accepts mail and then cannot forward it to the real mailbox can hold or lose messages. The tool marks a domain as having redundancy only when it has more than one record and more than one distinct priority.",
    ],
  },
  {
    heading: "What a broken MX record breaks",
    paragraphs: [
      "No MX record means senders fall back to the domain's own A record, which most people do not want. In practice inbound mail fails or lands on a web server. The tool warns when it finds none.",
      "A hostname that does not resolve is a dead end, so the mail sits in the sender's queue and eventually bounces. An MX that points at a raw IP address is invalid, because the target must be a hostname. An MX pointing at localhost delivers to the sender's own machine. Each of those has its own warning in the results.",
    ],
  },
  {
    heading: "Why a sending-only domain still cares",
    paragraphs: [
      "If you only send email, you might think MX does not matter. Replies, bounce handling and abuse reports all need somewhere to arrive, and some receivers look for a working mail path on the domain in the From address. Amazon SES makes this concrete: a custom MAIL FROM subdomain needs an MX record pointing at the SES feedback endpoint for your region, or the MAIL FROM setup fails and SES falls back to its own amazonses.com bounce domain, which costs you SPF alignment.",
      "A subdomain that sends but never receives, such as a dedicated mail. or send. subdomain, can carry just that one MX record. Keep it separate from the MX records for your main domain.",
    ],
  },
  {
    heading: "What this tool does not do",
    paragraphs: [
      "It reads DNS and does not deliver a test message. A hostname that resolves is not proof the server accepts mail, and a passing result is not a statement about where your mail lands. To see whether a mail server actually answers, send it a message and read the bounce or the headers.",
    ],
  },
];

const faqs = [
  {
    question: "What is an MX record?",
    answer:
      "It tells other mail servers which hostnames accept mail for a domain, and in what order to try them. The lowest priority number is tried first.",
  },
  {
    question: "Why does my domain show no MX records?",
    answer:
      "Either none were published, or you are looking at a subdomain that does not receive mail. Inbound mail will fail until you add them at your DNS host.",
  },
  {
    question: "Can an MX record point to an IP address?",
    answer:
      "No. It must point to a hostname, which then resolves to an address. The lookup warns when it finds an IP in the exchange field.",
  },
  {
    question: "Do I need MX records to send with Amazon SES?",
    answer:
      "Not on your main domain. A custom MAIL FROM domain does need an MX record pointing at the SES feedback endpoint for your region.",
  },
];

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Wraps MX Record Lookup",
  description,
  url: "https://wraps.dev/tools/mx-lookup",
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
    "MX record lookup with priorities",
    "Hostname resolution check",
    "IP-address and localhost target warnings",
    "Redundancy detection",
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

export default function MxLookupPage() {
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
                MX Record <span className="text-brand">Lookup</span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Look up a domain's mail servers, their priorities, and whether
                each hostname resolves.
              </p>
            </div>

            <Suspense>
              <ToolsPageContent focus="mx" />
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
                Read the background in the glossary entry for the{" "}
                <Link className={linkClass} href="/glossary/mx-record">
                  MX record
                </Link>
                . To check the rest of the domain, use the{" "}
                <Link className={linkClass} href="/tools">
                  full deliverability checker
                </Link>
                , the{" "}
                <Link className={linkClass} href="/tools/blacklist-check">
                  domain blacklist check
                </Link>{" "}
                or the{" "}
                <Link className={linkClass} href="/tools/spf-builder">
                  SPF builder
                </Link>
                .
              </p>
            </section>
          </div>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
