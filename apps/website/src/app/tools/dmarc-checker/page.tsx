import { Card, CardContent } from "@wraps/ui/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import ToolsPageContent from "../page-content";

const description =
  "Look up a domain's DMARC record and read it: policy, subdomain policy, alignment modes, reporting addresses, and what each warning means.";

export const metadata: Metadata = {
  title: "DMARC Record Checker",
  description,
  openGraph: {
    title: "DMARC Record Checker | Wraps",
    description,
  },
  twitter: {
    title: "DMARC Record Checker | Wraps",
    description,
  },
  alternates: {
    canonical: "https://wraps.dev/tools/dmarc-checker",
  },
};

const sections = [
  {
    heading: "What this checker reads",
    paragraphs: [
      "Enter a domain and the checker queries the TXT record at _dmarc.yourdomain.com. It parses the tags, then reports the policy (p=), the subdomain policy (sp=), the policy for subdomains that do not exist (np=), the testing flag (t=), the SPF and DKIM alignment modes (aspf= and adkim=), and any report addresses in rua= and ruf=. Warnings sit next to the raw record so you can see which tag caused them.",
      "The same run also checks SPF, DKIM, MX and blacklists, so you get a graded overview. The DMARC result is listed first on this page. That is the only difference from the main checker.",
    ],
  },
  {
    heading: "p=none, quarantine and reject",
    paragraphs: [
      "p=none tells receivers to take no action on mail that fails DMARC. It is a monitoring mode, and the checker warns on it because nothing is enforced. p=quarantine asks receivers to treat failures as suspicious, which usually means the spam folder. p=reject asks them to refuse the message during the SMTP conversation.",
      "Receivers make the final call. A policy is a request from the domain owner, and large mailbox providers mostly honor it, but nobody can promise what every receiver does. Moving from none to reject is a change you make in steps: read the aggregate reports, find every legitimate sender that fails, fix those, then tighten.",
    ],
  },
  {
    heading: "Why alignment fails when SPF and DKIM pass",
    paragraphs: [
      "DMARC does not only ask whether SPF or DKIM passed. It asks whether the passing domain matches the domain in the visible From header. SPF is checked against the envelope sender, and DKIM against the d= domain in the signature. If your ESP signs with its own domain and uses its own bounce domain, both can pass and DMARC still fails.",
      "The aspf and adkim tags set how strict the match is. Relaxed, the default, accepts any subdomain of the same organizational domain. Strict requires an exact match. Most senders should leave both relaxed. If you send through Amazon SES, setting a custom MAIL FROM domain and enabling Easy DKIM on your own domain is what gets you aligned.",
    ],
  },
  {
    heading: "Reading the warnings",
    paragraphs: [
      "A missing rua= means you get no aggregate reports, and without those you are enforcing blind. A subdomain policy weaker than the main policy leaves a gap attackers can use. If t=y is set, receivers are told not to enforce, so a reject policy does nothing until you remove it. A missing np= on an enforcing policy is flagged because spoofing from made-up subdomains stays open.",
      "The checker also flags pct= below 100. That tag used to let you apply a policy to a share of failing mail. The DMARCbis revision retires it in favor of t=y, so treat a partial pct as something to clean up, not a rollout plan.",
    ],
  },
  {
    heading: "What this tool does not do",
    paragraphs: [
      "It reads DNS. It does not read your aggregate reports, so it cannot tell you which senders are failing. It also does not test inbox placement, and a clean DMARC record is not a deliverability guarantee. It is one input that mailbox providers weigh with reputation, content and complaint rates.",
    ],
  },
];

const faqs = [
  {
    question: "What does a DMARC checker actually look up?",
    answer:
      "It queries the TXT record at _dmarc.yourdomain.com, parses the tags in it, and reports the policy, subdomain policy, alignment modes, and reporting addresses. It does not read your aggregate reports.",
  },
  {
    question: "Is p=none a valid DMARC policy?",
    answer:
      "Yes, it is valid, but it enforces nothing. It is meant for a monitoring phase while you find legitimate senders. The checker warns on it so it does not stay in place by accident.",
  },
  {
    question: "Why does DMARC fail when SPF and DKIM both pass?",
    answer:
      "DMARC requires the passing domain to align with the From header domain. An ESP that signs with its own domain and bounces through its own return-path passes both checks but fails alignment.",
  },
  {
    question: "Do I need an rua address?",
    answer:
      "You can publish DMARC without one, but you will not receive aggregate reports. Without them you cannot see which sources fail before you tighten the policy.",
  },
];

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Wraps DMARC Record Checker",
  description,
  url: "https://wraps.dev/tools/dmarc-checker",
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
    "DMARC record lookup",
    "Policy, subdomain policy and testing flag report",
    "SPF and DKIM alignment mode report",
    "Reporting address (rua) detection",
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

export default function DmarcCheckerPage() {
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
                DMARC Record <span className="text-brand">Checker</span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Look up a domain's DMARC record and see the policy, alignment
                modes and reporting addresses next to the warnings they trigger.
              </p>
            </div>

            <Suspense>
              <ToolsPageContent focus="dmarc" />
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
                For the concept behind the alignment failures, read{" "}
                <Link className={linkClass} href="/glossary/dmarc-alignment">
                  DMARC alignment
                </Link>
                , and{" "}
                <Link
                  className={linkClass}
                  href="/blog/your-dmarc-policy-is-useless"
                >
                  why a DMARC policy can be useless
                </Link>{" "}
                when it is never enforced. To check the other records on the
                same domain, use the{" "}
                <Link className={linkClass} href="/tools">
                  full deliverability checker
                </Link>
                , the{" "}
                <Link className={linkClass} href="/tools/dkim-checker">
                  DKIM record checker
                </Link>{" "}
                or the{" "}
                <Link className={linkClass} href="/tools/spf-builder">
                  SPF builder
                </Link>
                . No record yet? Generate one with the{" "}
                <Link className={linkClass} href="/tools/dmarc-builder">
                  DMARC record generator
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
