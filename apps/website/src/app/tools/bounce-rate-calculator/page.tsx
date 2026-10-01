import { Card, CardContent } from "@wraps/ui/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import BounceRateCalculatorPageContent from "./page-content";

const description =
  "Enter your sends, hard bounces and complaints and see where you sit against the Amazon SES review and pause thresholds, plus how many more events you can take. Runs in your browser.";

export const metadata: Metadata = {
  title: "SES Bounce Rate Calculator",
  description,
  openGraph: {
    title: "SES Bounce Rate Calculator | Wraps",
    description,
  },
  twitter: {
    title: "SES Bounce Rate Calculator | Wraps",
    description,
  },
  alternates: {
    canonical: "https://wraps.dev/tools/bounce-rate-calculator",
  },
};

const sections = [
  {
    heading: "What this calculates",
    paragraphs: [
      "Give it the number of emails you sent, your hard bounces and your complaints, and it returns a bounce rate and a complaint rate. Each is placed against the Amazon SES enforcement thresholds, and the tool shows how many more hard bounces or complaints you can take at your current volume before you reach the review line.",
      "The thresholds are the ones AWS publishes in its sending review process FAQ. For bounces, AWS recommends staying under 2%, puts an account under review at 5% or greater, and can pause sending at 10% or greater. For complaints, the best practice level and the review level are both 0.1% or greater, and sending can be paused at 0.5% or greater. The comparisons are greater-than-or-equal, so being exactly on a line counts as being on it.",
    ],
  },
  {
    heading: "Why the answer is an estimate",
    paragraphs: [
      "AWS says the bounce rate it enforces on includes only hard bounces to domains you have not verified. Soft bounces do not count, and neither do bounces to domains you verified in SES. It also measures over a representative volume that varies per sender, which is not published. So a number you work out yourself from your own counts will not match AWS to the decimal.",
      "That is why soft bounces are shown separately here and left out of the rate. It is also why the result is labelled an estimate. Use it to see which side of a line you are on, and check the SES console for the metric AWS shows you.",
    ],
  },
  {
    heading: "How headroom is worked out",
    paragraphs: [
      "Headroom is the number of additional events before the rate reaches the review threshold at the send volume you entered. At 1,000 sends the 5% line is 50 hard bounces, so 49 hard bounces leaves room for 1 more. When the line falls between two whole numbers, the count rounds up: at 333 sends, 5% is 16.65, so 17 hard bounces is the first count at or over the line.",
      "Headroom assumes sends stay where you typed them. If you send more, the same number of bounces is a lower rate. If a bad list import bounces heavily on a small send, the rate climbs faster than a monthly total suggests, so run the numbers for the batch as well as the month.",
    ],
  },
  {
    heading: "If you are over a line",
    paragraphs: [
      "Above best practice but under review is the point to act. Remove addresses that hard bounced, stop sending to old unengaged segments, and confirm your signup form does not accept typos. Complaints usually trace to sending to people who did not ask for the mail, or to an unsubscribe that is hard to find.",
      "If you are already in review, AWS expects a fix and a response. The SES account under review reference on this site walks through what AWS asks for. Nobody can promise how a review resolves, so the practical goal is to get the rate down before you reach the pause line.",
    ],
  },
];

const faqs = [
  {
    question: "What bounce rate does Amazon SES allow?",
    answer:
      "AWS recommends keeping the bounce rate under 2%. An account is put under review at 5% or greater and sending can be paused at 10% or greater. Source: the Amazon SES sending review process FAQs.",
  },
  {
    question: "What complaint rate does Amazon SES allow?",
    answer:
      "AWS lists 0.1% or greater as the review level and 0.5% or greater as the level where sending can be paused. Source: the Amazon SES sending review process FAQs.",
  },
  {
    question: "Do soft bounces count?",
    answer:
      "AWS says they do not. Only hard bounces to domains you have not verified in SES count toward the bounce rate. This calculator shows soft bounces separately and leaves them out of the rate.",
  },
  {
    question: "Why does my SES console number differ from this?",
    answer:
      "AWS measures over a representative volume that varies per sender and is not published. A calculation from your own counts is an estimate, not a copy of the number AWS enforces on.",
  },
];

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Wraps SES Bounce Rate Calculator",
  description,
  url: "https://wraps.dev/tools/bounce-rate-calculator",
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
    "Bounce rate and complaint rate estimate",
    "Position against SES review and pause thresholds",
    "Headroom before the review line",
    "Hard and soft bounce split",
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

export default function BounceRateCalculatorPage() {
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
                SES Bounce Rate <span className="text-brand">Calculator</span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                See your bounce and complaint rates against the Amazon SES
                review and pause thresholds, and how much room you have left. An
                estimate that runs in your browser.
              </p>
            </div>

            <Suspense>
              <BounceRateCalculatorPageContent />
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
                The reference pages cover what SES counts and what to do next:{" "}
                <Link className={linkClass} href="/ses/bounce-rate">
                  SES bounce rate
                </Link>
                ,{" "}
                <Link className={linkClass} href="/ses/complaint-rate">
                  SES complaint rate
                </Link>{" "}
                and{" "}
                <Link className={linkClass} href="/ses/account-under-review">
                  account under review
                </Link>
                . To check your domain's authentication records, use the{" "}
                <Link className={linkClass} href="/tools">
                  deliverability checker
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
