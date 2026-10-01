import { Card, CardContent } from "@wraps/ui/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import DmarcBuilderPageContent from "./page-content";

const description =
  "Build a DMARC record from a few answers and get the _dmarc TXT value, with warnings for the combinations that break mail. Runs in your browser: no account, no upload.";

export const metadata: Metadata = {
  title: "DMARC Record Generator",
  description,
  openGraph: {
    title: "DMARC Record Generator | Wraps",
    description,
  },
  twitter: {
    title: "DMARC Record Generator | Wraps",
    description,
  },
  alternates: {
    canonical: "https://wraps.dev/tools/dmarc-builder",
  },
};

const sections = [
  {
    heading: "What the generator writes",
    paragraphs: [
      "Pick a policy, add a report address, and the tool writes the TXT value for _dmarc.yourdomain.com. Tags come out in a fixed order: v, p, sp, np, t, adkim, aspf, rua, ruf, fo. Optional tags you leave unset are left out, and alignment is only written when you choose strict, because relaxed is the default.",
      "It does not write pct, ri or rf. The pct tag is retired in the DMARCbis revision, and receivers that follow it ignore the value, so a partial rollout percentage gives you a false sense of safety. If you want to try a policy without enforcing it, use t=y. Our DMARC record checker warns on pct below 100 for the same reason, so a record built here will not trip it.",
    ],
  },
  {
    heading: "Start at p=none, and read the reports",
    paragraphs: [
      "The builder warns when you pick quarantine or reject, because a policy you enforce on day one breaks every legitimate sender that is not aligned yet. That is usually a CRM, a billing tool, a support desk or a script somebody wrote three years ago. You will not find them by guessing. You find them in the aggregate reports.",
      "The path is boring and it works. Publish p=none with an rua address. Read the reports for a few weeks, fix each source that fails, then move to quarantine, watch, and move to reject. Receivers make the final call on every message, so a policy is a request, not a guarantee. Large providers mostly honor it.",
    ],
  },
  {
    heading: "How the tags interact",
    paragraphs: [
      "The sp tag sets the policy for subdomains. If you set sp=none while p is quarantine or reject, mail spoofed from a subdomain is not enforced, and the tool flags it. The np tag covers subdomains that do not exist in DNS. Setting np=reject on an enforcing policy closes that gap.",
      "The t=y flag tells receivers not to enforce. It is useful while you test, and it also means a p=reject record does nothing until you remove it. The tool warns when both are set.",
      "SPF alignment is checked against the envelope sender and DKIM alignment against the d= domain in the signature. Relaxed accepts any subdomain of the same organizational domain. Strict needs an exact match. Most senders should leave both relaxed.",
    ],
  },
  {
    heading: "Report addresses on other domains",
    paragraphs: [
      "If an rua or ruf address is on a different domain than the one you are protecting, receivers will not send reports there unless that domain publishes an authorization record. The record lives at yourdomain.com._report._dmarc.theirdomain.com and holds v=DMARC1. Report-processing services normally tell you to add it. When you enter a domain above, the tool points this out for any external address.",
      "Addresses that are not valid mailto: targets are left out of the record and listed in a warning, so a typo does not silently produce a broken tag.",
    ],
  },
  {
    heading: "What this tool does not do",
    paragraphs: [
      "It builds text. It does not publish anything, read your DNS, or look at your reports. The domain you type and the addresses you enter stay in your browser. Once you publish the record, run it through the DMARC record checker to confirm it resolves as written. A valid record is one input to deliverability, next to reputation, content and complaint rates. It does not guarantee inbox placement.",
    ],
  },
];

const faqs = [
  {
    question: "What should my first DMARC record be?",
    answer:
      "v=DMARC1; p=none with an rua address. It enforces nothing, so no mail is blocked, and the aggregate reports show every source sending as your domain. Tighten the policy after you have fixed the sources that fail.",
  },
  {
    question: "Why does the generator not offer a percentage?",
    answer:
      "The pct tag is retired in the DMARCbis revision and receivers that follow it ignore the value. Use t=y while testing. Our checker warns on pct below 100.",
  },
  {
    question: "Where do I put the record?",
    answer:
      "Create a TXT record named _dmarc on your domain. Some DNS hosts want the full name _dmarc.yourdomain.com and some append the domain for you, so check how yours displays existing records.",
  },
  {
    question: "Do I need ruf?",
    answer:
      "No. Many receivers never send forensic reports because they can contain message content. Aggregate reports through rua are the ones most teams use.",
  },
];

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Wraps DMARC Record Generator",
  description,
  url: "https://wraps.dev/tools/dmarc-builder",
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
    "DMARC TXT record generator",
    "Policy, subdomain policy and testing flag",
    "SPF and DKIM alignment modes",
    "Warnings for unsafe policy combinations",
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

export default function DmarcBuilderPage() {
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
                DMARC Record <span className="text-brand">Generator</span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Answer a few questions, copy the TXT value, and see which
                choices would break your mail before you publish them. Runs in
                your browser.
              </p>
            </div>

            <DmarcBuilderPageContent />

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
                Published it? Run the{" "}
                <Link className={linkClass} href="/tools/dmarc-checker">
                  DMARC record checker
                </Link>{" "}
                to confirm it resolves the way you wrote it. For why passing SPF
                and DKIM can still fail DMARC, read{" "}
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
                when it is never enforced.
              </p>
            </section>
          </div>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
