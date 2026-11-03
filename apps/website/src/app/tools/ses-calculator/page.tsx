import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import type { SesPlanId } from "@/lib/ses-cost";
import {
  AWS_INFRA_PRICING,
  SES_EXAMPLE_VOLUMES,
  SES_PLAN_IDS,
  SES_PLAN_INCLUDES,
  SES_PLANS,
  SES_VOLUME_BANDS,
  sesSendingCost,
} from "@/lib/ses-cost";
import SESCalculatorPageContent from "./page-content";

const SES_PRICING_URL = "https://aws.amazon.com/ses/pricing/";
const SES_PLANS_DOCS_URL =
  "https://docs.aws.amazon.com/ses/latest/dg/pricing-plans.html";

const SNIPPET_TITLE =
  "Amazon SES Pricing 2026: $0.10 or $0.16 per 1,000 Emails";
const SNIPPET_DESCRIPTION =
  "SES à la carte is $0.10 per 1,000 emails; since July 2026 new accounts start on Essentials at $0.16. All 4 plans, free tier, switch-back steps, calculator.";

export const metadata: Metadata = {
  title: SNIPPET_TITLE,
  description: SNIPPET_DESCRIPTION,
  openGraph: {
    title: `${SNIPPET_TITLE} | Wraps`,
    description: SNIPPET_DESCRIPTION,
  },
  twitter: {
    title: `${SNIPPET_TITLE} | Wraps`,
    description: SNIPPET_DESCRIPTION,
  },
  alternates: {
    canonical: "https://wraps.dev/tools/ses-calculator",
  },
};

/** À la carte line items beyond sending, from the AWS SES pricing page. */
const OTHER_CHARGES = [
  {
    item: "Attachments",
    price: "$0.12 per GB sent",
    note: "Charged on every plan, including à la carte.",
  },
  {
    item: "Standard dedicated IP",
    price: `$${AWS_INFRA_PRICING.DEDICATED_IP_PER_MONTH} per IP per month`,
    note: "Not included in any plan.",
  },
  {
    item: "Managed dedicated IPs",
    price: "$15 per account per month, plus $0.08 per 1,000 emails up to 10M",
    note: "Included in Pro and Enterprise.",
  },
  {
    item: "Virtual Deliverability Manager",
    price: "$0.07 per 1,000 emails up to 10M",
    note: "Included in every plan.",
  },
  {
    item: "Email validation",
    price: "$0.01 per address",
    note: "Pro includes 2,500 a month, Enterprise 5,000.",
  },
  {
    item: "Global Endpoints",
    price: "$0.03 per 1,000 emails, on top of sending",
    note: "Included in Enterprise.",
  },
  {
    item: "Receiving email",
    price:
      "$0.10 per 1,000 emails, plus $0.09 per 1,000 incoming 256 KB chunks",
    note: "Inbound mail is metered separately from sending.",
  },
] as const;

function formatRate(perThousand: number): string {
  return `$${perThousand.toFixed(2)}`;
}

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function bandRate(planId: SesPlanId, band: number): number {
  const { tiers } = SES_PLANS[planId];
  return (tiers[band] ?? tiers.at(-1) ?? tiers[0]).perThousandEmails;
}

function monthlyTotal(planId: SesPlanId, emails: number): number {
  const plan = SES_PLANS[planId];
  return plan.monthlyFee + sesSendingCost(plan, emails);
}

const FAQS = [
  {
    question: "How much does AWS SES cost per email?",
    answer:
      "AWS SES costs $0.10 per 1,000 emails ($0.0001 per email) at the à la carte rate. AWS defaults every new account to the Essentials plan instead, at $0.16 per 1,000 emails; if AWS defaulted you there and you never chose a plan, moving back to à la carte takes effect immediately. A production setup also needs an event pipeline for bounces, complaints and opens (EventBridge, SQS, Lambda and DynamoDB), billed on separate AWS lines, which the calculator prices at your volume.",
  },
  {
    question: "What is the total cost of running AWS SES in production?",
    answer:
      "For 50,000 emails a month, SES sending costs $5 on à la carte or $8 on the Essentials plan AWS gives new accounts. On top of that comes the event pipeline and email history storage (EventBridge, SQS, Lambda and DynamoDB), which the calculator prices at your volume with each service's free tier applied. SES sending itself has no free allowance.",
  },
  {
    question: "Does AWS SES have a free tier?",
    answer:
      "Not a free sending allowance: the current Amazon SES pricing page lists none. New AWS customers get up to $200 in AWS Free Tier credits instead ($100 at sign-up and up to $100 more for trying services), and those credits can pay SES charges. The 3,000 free messages a month for the first 12 months that many guides quote still appears in the SES FAQ, but not on the pricing page. The Lambda, SQS and DynamoDB services behind an event pipeline have their own free tiers, which the calculator applies.",
  },
  {
    question: "How much does a dedicated IP cost in AWS SES?",
    answer:
      "A standard dedicated IP costs $24.95 per IP per month, on any plan. Managed dedicated IPs cost $15 per account per month plus $0.08 per 1,000 emails up to 10M on à la carte. The Pro and Enterprise plans include managed dedicated IPs. A dedicated IP gives you sole control of your sending reputation, which only pays off at steady, high volume; most senders do fine on SES's shared IPs.",
  },
  {
    question: "Is AWS SES cheaper than SendGrid, Resend, or Postmark?",
    answer:
      "On sending fees, yes. SES costs $0.10 per 1,000 emails at the à la carte rate (AWS defaults new accounts to the pricier Essentials plan at $0.16 per 1,000 instead) with no monthly minimum, so 50,000 emails cost $5. Resend's Pro plan, for comparison, is $20 a month for 50,000 emails. The trade-off is SES requires infrastructure setup, which tools like Wraps automate with a single command.",
  },
] as const;

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Amazon SES Pricing Calculator",
  description:
    "Interactive calculator for estimating AWS SES email costs including full infrastructure pricing for Lambda, DynamoDB, SQS, EventBridge, dedicated IPs, and more.",
  url: "https://wraps.dev/tools/ses-calculator",
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
    "AWS SES sending cost calculation",
    "Full infrastructure cost breakdown (Lambda, DynamoDB, SQS, EventBridge)",
    "Feature-based pricing (event tracking, dedicated IP, HTTPS tracking)",
    "AWS Free Tier calculations included",
    "Shareable calculator configurations via URL",
    "Volume presets for common use cases",
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

const externalLinkClass = "text-primary underline-offset-4 hover:underline";

export default function SESCalculatorPage() {
  return (
    <>
      <JsonLd data={webAppSchema} />
      <JsonLd data={faqSchema} />
      <div className="min-h-dvh bg-background">
        <LandingNavbar />

        {/* Main Content */}
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="mx-auto max-w-6xl">
            {/* Page Header: the answer comes before the calculator */}
            <div className="mb-10 text-center">
              <Badge className="mb-4" variant="outline">
                Checked against AWS pricing, November 2026
              </Badge>
              <h1 className="mb-6 text-balance font-bold text-4xl tracking-tight">
                Amazon SES Pricing Calculator
              </h1>
              <p className="mx-auto max-w-3xl text-pretty text-left text-foreground/90 text-lg leading-relaxed">
                Amazon SES costs <strong>$0.10 per 1,000 emails</strong> on à la
                carte pricing, plus $0.12 per GB of attachments, with no monthly
                fee. Since July 21, 2026, AWS starts new accounts, and any
                account and Region with no metered SES use since June 1, 2025,
                on the <strong>Essentials plan at $0.16 per 1,000</strong>{" "}
                instead. Pro costs $105 a month plus $0.22 per 1,000; Enterprise
                $500 a month plus $0.23. There is no free sending allowance on
                the current pricing page: new AWS customers get up to $200 in
                credits instead.
              </p>
            </div>

            {/* The four plans */}
            <section aria-labelledby="ses-plans" className="mb-12">
              <h2
                className="mb-4 font-bold text-2xl tracking-tight"
                id="ses-plans"
              >
                The four SES pricing plans
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Monthly fee</TableHead>
                    {SES_VOLUME_BANDS.map((band) => (
                      <TableHead key={band}>{band}</TableHead>
                    ))}
                    <TableHead>Included beyond sending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SES_PLAN_IDS.map((id) => {
                    const plan = SES_PLANS[id];
                    return (
                      <TableRow key={id}>
                        <TableCell className="font-medium">
                          {plan.name}
                          {plan.defaultForNewAccounts ? (
                            <Badge className="ml-2" variant="secondary">
                              New-account default
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {plan.monthlyFee === 0
                            ? "None"
                            : formatUsd(plan.monthlyFee)}
                        </TableCell>
                        {SES_VOLUME_BANDS.map((band, index) => (
                          <TableCell className="font-mono" key={band}>
                            {formatRate(bandRate(id, index))}
                          </TableCell>
                        ))}
                        <TableCell className="min-w-64 whitespace-normal text-muted-foreground">
                          {SES_PLAN_INCLUDES[id]}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="mt-4 text-muted-foreground text-sm">
                Price per 1,000 emails sent. Rates are marginal, so each one
                covers only the emails in its band, and fees apply per account,
                per Region. Source:{" "}
                <a
                  className={externalLinkClass}
                  href={SES_PRICING_URL}
                  rel="noopener"
                  target="_blank"
                >
                  Amazon SES pricing
                </a>
                .
              </p>
            </section>

            {/* Interactive Calculator Widget */}
            <section aria-labelledby="calculator-heading" id="calculator">
              <h2
                className="mb-2 font-bold text-2xl tracking-tight"
                id="calculator-heading"
              >
                Calculate your monthly SES bill
              </h2>
              <p className="mb-6 max-w-3xl text-muted-foreground">
                Set your volume and plan. The breakdown adds the event pipeline
                most SES setups need for bounces, complaints, opens and clicks:
                EventBridge, SQS, Lambda and DynamoDB, each billed on its own
                AWS line, with their free tiers applied.
              </p>
              <Suspense>
                <SESCalculatorPageContent />
              </Suspense>
            </section>

            {/* Mid-page CTA — high-intent users who just saw their number */}
            <section className="mt-12">
              <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background">
                <CardContent className="p-6 md:p-8">
                  <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
                    <div className="flex-1">
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-primary text-xs uppercase tracking-wider">
                        One command
                      </div>
                      <h3 className="mb-2 font-bold text-2xl tracking-tight">
                        Deploy this exact setup in minutes
                      </h3>
                      <p className="text-muted-foreground">
                        Wraps provisions every service in your breakdown —
                        Lambda, SQS, DynamoDB, EventBridge — to your AWS
                        account. Still AWS pricing, still your data, no
                        boilerplate.
                      </p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto md:flex-col lg:flex-row">
                      <Button asChild size="lg">
                        <a href="https://app.wraps.dev/auth?mode=signup">
                          Start free
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                      <Button asChild size="lg" variant="outline">
                        <Link href="/docs/quickstart/email">
                          See quickstart
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Worked costs by volume */}
            <section aria-labelledby="ses-volume-costs" className="mt-16">
              <h2
                className="mb-2 font-bold text-2xl tracking-tight"
                id="ses-volume-costs"
              >
                What SES costs at common volumes
              </h2>
              <p className="mb-4 max-w-3xl text-muted-foreground">
                At every volume, à la carte is the cheapest way to send. The
                plans cost more because they bundle features à la carte bills
                separately, so they only pay off if you would turn those
                features on anyway.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Emails per month</TableHead>
                    {SES_PLAN_IDS.map((id) => (
                      <TableHead key={id}>{SES_PLANS[id].name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SES_EXAMPLE_VOLUMES.map((emails) => (
                    <TableRow key={emails}>
                      <TableCell className="font-medium">
                        {emails.toLocaleString("en-US")}
                      </TableCell>
                      {SES_PLAN_IDS.map((id) => (
                        <TableCell className="font-mono" key={id}>
                          {formatUsd(monthlyTotal(id, emails))}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-4 text-muted-foreground text-sm">
                Sending fees plus each plan&apos;s monthly fee, for one Region,
                before attachments. 20M emails shows the marginal bands at work:
                Essentials charges $0.16 per 1,000 on the first 10M and $0.14 on
                the next 10M.
              </p>
            </section>

            {/* Who was defaulted, and how to move back */}
            <section aria-labelledby="ses-switch-plan" className="mt-16">
              <h2
                className="mb-4 font-bold text-2xl tracking-tight"
                id="ses-switch-plan"
              >
                Are you on Essentials? How to switch back to à la carte
              </h2>
              <div className="max-w-3xl space-y-4 text-muted-foreground">
                <p>
                  AWS put an account and Region on Essentials if the account is
                  new, or if it had no metered SES activity since June 1, 2025.
                  Accounts that kept sending stayed on à la carte. Plans are set
                  per Region, so check each Region you send from.
                </p>
                <ol className="list-inside list-decimal space-y-2">
                  <li>
                    In the SES console, open the <strong>Pricing plan</strong>{" "}
                    page for the Region. It shows the current plan and any
                    change scheduled for the next billing cycle.
                  </li>
                  <li>
                    Choose <strong>Cancel plan</strong> to return to à la carte,
                    or <strong>Change plan</strong> to move between Essentials,
                    Pro and Enterprise.
                  </li>
                  <li>
                    If AWS defaulted you to Essentials and you never chose a
                    plan, that first cancellation applies immediately. Any other
                    downgrade applies at the start of the next billing cycle.
                  </li>
                </ol>
                <p>
                  To check from a terminal, run{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-sm">
                    npx @wraps.dev/cli email plan
                  </code>
                  : it reports the plan for your default Region (or each Region
                  you have deployed Wraps to; pass --region for another), prices
                  your recent volume under all four, and{" "}
                  <code className="rounded bg-muted px-1 font-mono text-foreground text-sm">
                    --set NONE
                  </code>{" "}
                  moves that Region back to à la carte (
                  <Link
                    className={externalLinkClass}
                    href="/docs/cli-reference/email"
                  >
                    CLI reference
                  </Link>
                  ).
                </p>
                <p className="text-sm">
                  Sources:{" "}
                  <a
                    className={externalLinkClass}
                    href={SES_PLANS_DOCS_URL}
                    rel="noopener"
                    target="_blank"
                  >
                    SES pricing plans documentation
                  </a>
                  . For when Pro or Enterprise pays for itself, read{" "}
                  <Link
                    className={externalLinkClass}
                    href="/blog/ses-pricing-plans-2026"
                  >
                    our breakdown of the 2026 SES plans
                  </Link>
                  .
                </p>
              </div>
            </section>

            {/* Everything else SES bills for */}
            <section aria-labelledby="ses-other-charges" className="mt-16">
              <h2
                className="mb-2 font-bold text-2xl tracking-tight"
                id="ses-other-charges"
              >
                Other SES charges
              </h2>
              <p className="mb-4 max-w-3xl text-muted-foreground">
                These are the à la carte prices for the features the plans
                bundle, and for the ones no plan covers.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Charge</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>On the plans</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {OTHER_CHARGES.map((charge) => (
                    <TableRow key={charge.item}>
                      <TableCell className="font-medium">
                        {charge.item}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {charge.price}
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">
                        {charge.note}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-4 text-muted-foreground text-sm">
                Source:{" "}
                <a
                  className={externalLinkClass}
                  href={SES_PRICING_URL}
                  rel="noopener"
                  target="_blank"
                >
                  Amazon SES pricing
                </a>
                , checked November 3, 2026.
              </p>
            </section>

            {/* FAQ Section */}
            <section className="mt-16 space-y-8">
              <div className="text-center">
                <h2 className="mb-4 font-bold text-3xl tracking-tight">
                  Frequently Asked Questions
                </h2>
                <p className="mx-auto max-w-2xl text-muted-foreground">
                  Common questions about AWS SES pricing and costs.
                </p>
              </div>

              <div className="space-y-4">
                {FAQS.map((faq) => (
                  <Card key={faq.question}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {faq.question}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-muted-foreground text-sm">
                      <p>{faq.answer}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* Pricing Notes */}
            <Card className="mt-12">
              <CardHeader>
                <CardTitle>Pricing Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <h3 className="mb-2 font-semibold">How We Calculate Costs</h3>
                  <p className="text-pretty text-muted-foreground">
                    All costs are based on official AWS pricing as of 2026-07-21
                    for US East (N. Virginia) region. Costs include AWS free
                    tier benefits where applicable. Storage costs shown
                    represent <strong>steady-state</strong> (after retention
                    period fills up) - initial months will be cheaper as storage
                    builds gradually. Your actual costs may vary based on region
                    and usage patterns.
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">What&apos;s Included</h3>
                  <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                    <li>
                      SES email sending ($0.10 per 1,000 emails at the à la
                      carte rate; AWS defaults new accounts to Essentials at
                      $0.16 per 1,000 instead)
                    </li>
                    <li>
                      Event processing (EventBridge, SQS, Lambda) if enabled
                    </li>
                    <li>Email history storage in DynamoDB if enabled</li>
                    <li>Optional dedicated IP address ($24.95/month)</li>
                    <li>
                      All infrastructure runs in your AWS account - you pay AWS
                      directly
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">Wraps Platform Fee</h3>
                  <p className="text-pretty text-muted-foreground">
                    Wraps is a platform fee for email infrastructure you own.
                    You pay us for tooling (dashboard, workflows, AI, analytics)
                    and AWS directly for sending ($0.10/1K emails at the à la
                    carte rate, or $0.16/1K if your account defaults to
                    Essentials). Sends, domains, contacts, and templates are
                    unlimited on every plan. Paid plans unlock longer dashboard
                    history, more AWS accounts, and features like topics,
                    segments, and campaigns.
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">CLI & SDK</h3>
                  <p className="text-pretty text-muted-foreground">
                    The Wraps CLI and TypeScript SDK work with all plans,
                    including Free. Deploy to your AWS account — no vendor
                    lock-in, no hidden fees.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Cross-links to other tools */}
            <section className="mt-12">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent>
                  <div className="flex flex-col items-center gap-4 text-center md:flex-row md:text-left">
                    <div className="flex-1">
                      <h3 className="mb-2 font-bold text-xl">
                        Check your email deliverability
                      </h3>
                      <p className="text-muted-foreground">
                        Use our free Email Deliverability Checker to verify SPF,
                        DKIM, DMARC, and domain reputation before you send.
                      </p>
                    </div>
                    <Button asChild size="lg">
                      <Link href="/tools">
                        Check Your Domain
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
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
