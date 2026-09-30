import { Card, CardContent } from "@wraps/ui/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import ToolsPageContent from "../page-content";

const description =
  "Check a domain's DKIM records. Tests 25 common selectors, or enter your own, and reports key type, key size, and testing or revoked flags.";

export const metadata: Metadata = {
  title: "DKIM Record Checker",
  description,
  openGraph: {
    title: "DKIM Record Checker | Wraps",
    description,
  },
  twitter: {
    title: "DKIM Record Checker | Wraps",
    description,
  },
  alternates: {
    canonical: "https://wraps.dev/tools/dkim-checker",
  },
};

const sections = [
  {
    heading: "Why a DKIM lookup needs a selector",
    paragraphs: [
      "A DKIM public key lives at selector._domainkey.yourdomain.com. The selector is a label the sender picks, and DNS has no way to list every label under _domainkey. A receiver does not have this problem because the selector is written in the DKIM-Signature header of the message. A checker that only has your domain has to guess.",
      "So this tool guesses in a bounded way. In quick mode, which is what this page runs, it tries 25 selectors: google, selector1, selector2, default, dkim, mail, email, s1, s2, k1, sendgrid, amazonses, mandrill, mailgun, postmark, resend, ses, sg, mg, pm, smtp, mta, mx, primary and main. If your provider uses something else, open the advanced options and enter the selectors yourself, separated by commas.",
    ],
  },
  {
    heading: "What a miss does and does not mean",
    paragraphs: [
      "Finding nothing does not prove DKIM is broken. It proves none of those 25 names has a key. Amazon SES is the common case. Easy DKIM gives each identity three CNAME records with random tokens as the selector, so no guessable name will ever match. If the SPF record mentions Amazon SES and no selector turns up, the checker adds a note saying so.",
      "For SES, copy the three tokens from the console under the identity's DKIM section, or from the DNS records the identity shows, and paste all three into the selector field. SendGrid and Mailgun also use provider-specific names, so the same approach applies.",
    ],
  },
  {
    heading: "What gets reported for each selector found",
    paragraphs: [
      "For every selector with a key, the result shows the key type and size. RSA keys under 2048 bits produce a warning, and under 1024 bits an error, because short keys are easier to attack. Two other tags matter: t=y means the domain is in testing mode and receivers may ignore failures, and an empty p= means the key was revoked on purpose.",
      "The checker also looks at the h= tag. A key that only allows sha1 gets flagged, since sha256 is the expected hash. A service type (s=) that excludes email gets flagged too.",
    ],
  },
  {
    heading: "Rotating keys without a gap",
    paragraphs: [
      "Selectors exist so you can rotate. Publish the new selector, switch the sender to sign with it, wait until mail signed with the old key has been delivered, then retire the old record. Deleting the old key first turns in-flight messages into DKIM failures.",
      "If you see both an old 1024-bit key and a new 2048-bit key in the results, that is usually a rotation caught halfway. Check that the sender is signing with the new one before you remove the old.",
    ],
  },
  {
    heading: "What this tool does not do",
    paragraphs: [
      "It checks that keys exist and look sane. It does not verify a signature on a real message, so it cannot tell you whether your sender is actually signing with the key it found. Send a test message to a mailbox you control and read the Authentication-Results header for that.",
    ],
  },
];

const faqs = [
  {
    question: "How do I find my DKIM selector?",
    answer:
      "Open a message you sent and look at the s= tag in the DKIM-Signature header, or check your provider's dashboard. Enter it in the advanced options of the checker.",
  },
  {
    question: "Which selectors does the checker try?",
    answer:
      "In quick mode, 25 common ones, including google, selector1, selector2, default, s1, s2, k1 and provider names such as sendgrid, mailgun, postmark and resend.",
  },
  {
    question: "Why can't the checker find my Amazon SES DKIM key?",
    answer:
      "Easy DKIM uses three random tokens as selectors, so no common name matches. Copy the three tokens from the SES console and enter them as selectors.",
  },
  {
    question: "What key size should I use for DKIM?",
    answer:
      "2048-bit RSA. The checker warns below 2048 bits and reports an error below 1024.",
  },
];

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Wraps DKIM Record Checker",
  description,
  url: "https://wraps.dev/tools/dkim-checker",
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
    "DKIM lookup across 25 common selectors",
    "Custom selector input",
    "Key type and key size report",
    "Testing-mode and revoked-key detection",
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

export default function DkimCheckerPage() {
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
                DKIM Record <span className="text-brand">Checker</span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Test a domain against 25 common DKIM selectors, or enter your
                own under advanced options, and see the key type and size for
                each one found.
              </p>
            </div>

            <Suspense>
              <ToolsPageContent focus="dkim" />
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
                Background on the concepts lives in the glossary:{" "}
                <Link className={linkClass} href="/glossary/dkim">
                  DKIM
                </Link>{" "}
                and{" "}
                <Link className={linkClass} href="/glossary/dkim-selector">
                  DKIM selector
                </Link>
                . To check the rest of the domain, use the{" "}
                <Link className={linkClass} href="/tools">
                  full deliverability checker
                </Link>
                , the{" "}
                <Link className={linkClass} href="/tools/dmarc-checker">
                  DMARC record checker
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
