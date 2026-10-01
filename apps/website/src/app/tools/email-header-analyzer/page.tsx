import { Card, CardContent } from "@wraps/ui/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import EmailHeaderAnalyzerPageContent from "./page-content";

const description =
  "Paste raw email headers and read the Received chain, SPF, DKIM and DMARC results, and Return-Path alignment. Parsed in your browser: nothing is uploaded or stored.";

export const metadata: Metadata = {
  title: "Email Header Analyzer",
  description,
  openGraph: {
    title: "Email Header Analyzer | Wraps",
    description,
  },
  twitter: {
    title: "Email Header Analyzer | Wraps",
    description,
  },
  alternates: {
    canonical: "https://wraps.dev/tools/email-header-analyzer",
  },
};

const sections = [
  {
    heading: "What gets parsed",
    paragraphs: [
      "Paste the full header block of a message and the tool unfolds continuation lines, as RFC 5322 section 2.2.3 describes, then pulls out the parts you usually go looking for. The Received headers become a hop list, shown oldest first, with the time between each hop. The Authentication-Results header is split into SPF, DKIM and DMARC results, each with the domain it was evaluated against. From, Return-Path, Subject, Date and Message-ID are listed next to them.",
      "Raw headers put the newest Received line at the top, because each server prepends its own. Read bottom to top to follow the message. The tool reverses the list so hop 1 is where the message first entered the chain.",
    ],
  },
  {
    heading: "Your headers stay in the page",
    paragraphs: [
      "Headers carry recipient addresses, internal hostnames and IP addresses. This page parses them with plain string handling in your browser. It makes no network request with them, does not write them to local storage, and does not put them in the URL, so they do not end up in analytics or browser history.",
    ],
  },
  {
    heading: "Reading Received delays",
    paragraphs: [
      "The delay column is the difference between two timestamps written by two different servers. If their clocks disagree you will see a negative or oddly large number. A jump of several minutes between hops usually means a queue or a greylisting retry. A jump of hours often points at a receiving server that deferred the message. When a timestamp does not parse, the tool skips that delay instead of guessing.",
      "Received headers are also easy to forge below the first trusted hop. Treat the hops added by your own provider as reliable, and anything earlier as a claim.",
    ],
  },
  {
    heading: "Authentication-Results and alignment",
    paragraphs: [
      "The receiving server writes Authentication-Results after it checks the message. A pass on SPF means the sending IP is allowed for the domain in smtp.mailfrom. A pass on DKIM means a signature verified for the domain in header.d. DMARC then asks a further question: does either passing domain match the domain in the visible From header?",
      "That is why the tool compares Return-Path with From. Mail sent through an ESP often carries the ESP's bounce domain in Return-Path, so SPF passes for the ESP and DMARC still fails for you. The comparison here uses a simple rule, the last two labels of each domain. It is a heuristic and it is wrong for suffixes like co.uk, since we do not ship the public suffix list. The receiver's own dmarc= line is the verdict that counts.",
      "Amazon SES sends from an amazonses.com bounce domain unless you set a custom MAIL FROM domain. Easy DKIM on your own domain is what gives you a DKIM-aligned pass either way.",
    ],
  },
  {
    heading: "Platform hints",
    paragraphs: [
      "A few headers name the system that sent a message: X-SES-Outgoing and Feedback-ID with amazonses for Amazon SES, X-Mailgun headers for Mailgun, X-SG-EID or X-SG-ID for SendGrid, X-PM-Message-Id for Postmark, and X-Google headers for Google. The tool only lists a platform when one of those headers is actually there. A missing hint tells you nothing, because senders can strip these headers.",
    ],
  },
];

const faqs = [
  {
    question: "How do I get the raw headers?",
    answer:
      "In Gmail, open the message, use the three dot menu and choose Show original. In Outlook on the web, open the message and choose View message source or details. In Apple Mail, use View, Message, All Headers. Copy the block at the top, up to the first blank line.",
  },
  {
    question: "Is it safe to paste real headers here?",
    answer:
      "The parsing runs in your browser and nothing is sent, stored, or added to the URL. Still, redact anything you would not share in a screenshot if you plan to post the results elsewhere.",
  },
  {
    question: "Why does DMARC fail when SPF and DKIM both pass?",
    answer:
      "DMARC needs the passing domain to align with the From header domain. If SPF passes for a bounce domain that differs from From, and DKIM is signed with the sender's own domain, both pass and DMARC still fails.",
  },
  {
    question: "Why are some Received delays negative?",
    answer:
      "Each hop's timestamp comes from a different server's clock. When two clocks disagree the difference can come out negative. It is usually clock skew, not a fault.",
  },
];

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Wraps Email Header Analyzer",
  description,
  url: "https://wraps.dev/tools/email-header-analyzer",
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
    "Received chain with hop delays",
    "SPF, DKIM and DMARC results from Authentication-Results",
    "Return-Path and From alignment check",
    "Sending platform hints",
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

export default function EmailHeaderAnalyzerPage() {
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
                Email Header <span className="text-brand">Analyzer</span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Paste raw headers and read the hop chain, the SPF, DKIM and
                DMARC results, and whether Return-Path lines up with From. Your
                headers never leave the browser.
              </p>
            </div>

            <EmailHeaderAnalyzerPageContent />

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
                To see how a domain is set up rather than one message, use the{" "}
                <Link className={linkClass} href="/tools">
                  full deliverability checker
                </Link>{" "}
                or the{" "}
                <Link className={linkClass} href="/tools/dmarc-checker">
                  DMARC record checker
                </Link>
                . For the alignment concept, read{" "}
                <Link className={linkClass} href="/glossary/dmarc-alignment">
                  DMARC alignment
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
