import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { SES_DENIAL_GAPS } from "@/lib/ses-production-access";
import SESProductionAccessPageContent from "./page-content";

const TITLE = "SES Production Access Request Builder";
const DESCRIPTION =
  "Write the AWS SES production access request that answers the four questions the form never asks — or paste a denial and find out which one you missed. Runs entirely in your browser: no account, no upload, no AI.";
const URL = "https://wraps.dev/tools/ses-production-access";

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
      name: "Tools",
      item: "https://wraps.dev/tools",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "SES Production Access Request Builder",
      item: URL,
    },
  ],
};

const appSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: TITLE,
  description:
    "Builds an Amazon SES production access request from six answers, and matches a pasted denial against the four gaps that cause most refusals. Client-side only.",
  url: URL,
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
    "Support-case text built from six answers",
    "Denial matcher for the four common refusal reasons",
    "Pre-filled appeal reply for the existing support case",
    "Warns instead of inventing a claim you have not earned",
    "Runs entirely in the browser — nothing is uploaded",
  ],
};

const FAQ: { question: string; answer: string }[] = [
  {
    question: "Why did AWS deny my SES production access request?",
    answer:
      "The request form asks for an email type, a website and contact addresses, so reviewers have to infer your sending practices from very little. Denials cluster into four gaps: the account has verified a single email address rather than a domain; the website does not explain the mail; nothing says how recipients ended up on the list; and there is no bounce or complaint handling. The standard refusal — that your use of Amazon SES could have a negative impact on our service — names none of them, which is why it feels arbitrary.",
  },
  {
    question: "What should I write in an SES production access request?",
    answer:
      "Answer the four questions the form never asks, in plain sentences: what you send and what triggers it, how an address gets onto your list, roughly how many emails you expect to send, and what happens to a bounce or a complaint. Name your unsubscribe mechanism. Keep it short and specific — a paragraph of detail a reviewer can check against your site beats a page of intent.",
  },
  {
    question: "Can I appeal an SES production access denial?",
    answer:
      "Yes. A denial is not final. AWS delivers the decision through a Support Center case tied to your request, and that case is where you reply with more detail. Fix the gap first — verify the domain, put a signup form on the site, set up bounce handling — then reply on the existing case. Opening a fresh request instead throws away the context the reviewer already has.",
  },
  {
    question: "Do I need a verified domain for SES production access?",
    answer:
      "You are not formally required to have one, but a request from an account that has verified only a single email address gives the reviewer nothing to check, and it is the most common reason a request stalls. Verify the sending domain, enable DKIM and wait for the status to leave Pending, and publish SPF and DMARC records before you submit.",
  },
  {
    question: "Does this tool send my denial text anywhere?",
    answer:
      "No. The matching runs in your browser with plain keyword rules, and the request text is assembled from fixed templates in the same place. There is no account, no upload, no model call, and no server involved. Deterministic templates are the point: this output goes to AWS support under your name, so the same answers always produce the same words.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((entry) => ({
    "@type": "Question",
    name: entry.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: entry.answer,
    },
  })),
};

export default function SESProductionAccessPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={appSchema} />
      <JsonLd data={faqSchema} />
      <div className="min-h-dvh bg-background">
        <LandingNavbar />

        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10">
              <div className="mb-5 inline-flex items-center gap-2 font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
                <span className="size-1.5 rounded-full bg-brand" />
                <span>wraps · free tool</span>
              </div>
              <h1 className="mb-4 text-pretty font-heading font-semibold text-3xl tracking-tight sm:text-5xl">
                SES production access,{" "}
                <span className="text-brand-text">written out</span>
              </h1>
              <p className="max-w-3xl text-balance text-base text-muted-foreground sm:text-lg">
                AWS asks for an email type, a website and a contact address,
                then decides from that whether to trust you with everyone&apos;s
                inbox. This builds the text that answers what the form left out
                — and if you have already been refused, it matches the refusal
                against the four gaps that cause most of them.
              </p>
              <p className="mt-4 max-w-3xl text-muted-foreground text-sm">
                Everything runs in your browser. No account, nothing uploaded,
                no AI writing on your behalf — the templates are fixed, because
                this goes to AWS support under your name.
              </p>
            </div>

            <Suspense>
              <SESProductionAccessPageContent />
            </Suspense>

            <section className="mt-16">
              <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
                Why requests get denied
              </h2>
              <p className="mb-6 max-w-3xl text-muted-foreground">
                The refusal AWS sends names nothing: &ldquo;we reviewed your
                request and determined that your use of Amazon SES could have a
                negative impact on our service.&rdquo; It reads as a judgment of
                you. It is closer to a judgment of the form, which did not have
                room for any of this. Denials cluster into four gaps.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {SES_DENIAL_GAPS.map((gap) => (
                  <Card className="border-border bg-card" key={gap.id}>
                    <CardHeader>
                      <CardTitle className="font-heading text-base tracking-tight">
                        {gap.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <p className="text-muted-foreground">{gap.summary}</p>
                      <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                        {gap.remediation.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <p className="mt-6 max-w-3xl text-muted-foreground text-sm">
                Fix the gap before you reply, not after. A reply describing a
                process AWS cannot see on your site or in your account does not
                help your case — the reviewer checks. The full walkthrough,
                including how to read the review status from the CLI, is in the{" "}
                <Link
                  className="text-brand-text underline underline-offset-2"
                  href="/docs/guides/production-access"
                >
                  production access guide
                </Link>
                .
              </p>
            </section>

            <section className="mt-14">
              <Card className="border-border bg-card">
                <CardContent className="p-6 md:p-8">
                  <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
                    <div className="flex-1">
                      <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
                        The bounce pipeline is the gap you cannot write your way
                        out of
                      </h2>
                      <p className="text-muted-foreground">
                        Three of the four gaps are things you write down. The
                        fourth is a thing that has to exist. Wraps deploys the
                        bounce and complaint pipeline and the suppression list
                        into your own AWS account during{" "}
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                          wraps email init
                        </code>
                        , so the paragraph above describes something real.
                      </p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto md:flex-col lg:flex-row">
                      <Button asChild size="lg" variant="brand">
                        <a href="https://app.wraps.dev/auth?mode=signup">
                          Start free
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                      <Button asChild size="lg" variant="outline">
                        <Link href="/docs/guides/bounce-handling">
                          Bounce handling
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <p className="mt-16 text-muted-foreground">
              Not submitted yet? Work through the{" "}
              <Link
                className="text-brand-text underline underline-offset-2"
                href="/blog/ses-sandbox-guide#pre-request-checklist"
              >
                16-point pre-request checklist
              </Link>{" "}
              first — it is free, it ticks off as you go, and most refusals are
              something on it that was skipped.
            </p>

            <section className="mt-16">
              <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
                Frequently asked questions
              </h2>
              <div className="space-y-4">
                {FAQ.map((entry) => (
                  <Card className="border-border bg-card" key={entry.question}>
                    <CardHeader>
                      <CardTitle className="font-heading text-base tracking-tight">
                        {entry.question}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-muted-foreground text-sm">
                      <p>{entry.answer}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section className="mt-14 grid gap-4 sm:grid-cols-3">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="font-heading text-base tracking-tight">
                    <Link
                      className="text-brand-text underline underline-offset-2"
                      href="/blog/ses-sandbox-guide"
                    >
                      Getting out of the sandbox
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  The whole path, start to finish: what the sandbox restricts,
                  what to have ready, and what a denial actually means.
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="font-heading text-base tracking-tight">
                    <Link
                      className="text-brand-text underline underline-offset-2"
                      href="/ses/limits"
                    >
                      Sending limits
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  Sandbox quotas, the per-second rate against the rolling
                  24-hour cap, and how increases actually happen.
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="font-heading text-base tracking-tight">
                    <Link
                      className="text-brand-text underline underline-offset-2"
                      href="/tools/ses-calculator"
                    >
                      SES cost calculator
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  What the volume you just quoted actually costs at AWS pricing,
                  infrastructure included.
                </CardContent>
              </Card>
            </section>
          </div>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
