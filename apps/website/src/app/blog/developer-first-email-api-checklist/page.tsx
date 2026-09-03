import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";

const TITLE = "What to Look For in a Developer-First Transactional Email API";
const DESCRIPTION =
  "Seven things that separate an email API you enjoy from one you tolerate, each with a test you can run in an afternoon. Includes where Wraps fails the list.";
const URL = "https://wraps.dev/blog/developer-first-email-api-checklist";
const PUBLISHED = "2026-09-03T00:00:00.000Z";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: TITLE,
  description: DESCRIPTION,
  image: "https://wraps.dev/og-image.png",
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
    description:
      "Email infrastructure experts building tools to deploy production-ready email systems to AWS.",
    sameAs: ["https://github.com/wraps-team", "https://twitter.com/wrapsdev"],
  },
  publisher: {
    "@type": "Organization",
    name: "Wraps",
    logo: { "@type": "ImageObject", url: "https://wraps.dev/logo.png" },
  },
  mainEntityOfPage: { "@type": "WebPage", "@id": URL },
};

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: "Developer-First Email API Checklist | Wraps",
    description: DESCRIPTION,
    type: "article",
    url: URL,
    images: [
      {
        url: "https://wraps.dev/og-image.png",
        width: 1200,
        height: 630,
        alt: "Developer-first email API checklist",
      },
    ],
    publishedTime: PUBLISHED,
  },
  twitter: {
    title: "Developer-First Email API Checklist | Wraps",
    description: DESCRIPTION,
  },
  alternates: { canonical: URL },
};

type Item = {
  n: string;
  name: string;
  why: string;
  test: string;
  wraps: { verdict: "pass" | "fail" | "partial"; note: string };
};

const ITEMS: Item[] = [
  {
    n: "01",
    name: "Idempotency on the send call",
    why: "Your worker retries. The queue redelivers. A Lambda times out after the send succeeded but before the ack. Without a key the API can deduplicate on, every one of those is a second copy of a password reset in somebody's inbox. Stripe solved this in 2015 and email providers have been slow to follow.",
    test: "Send the same request twice with the same idempotency key. Two emails means no idempotency, whatever the docs imply.",
    wraps: {
      verdict: "fail",
      note: "Wraps does not accept an idempotency key on send today. Workflow steps deduplicate internally on an execution and step id, but a direct email.send() called twice sends twice. Resend added idempotency keys in 2025 and is ahead of us here. If you are sending from an at-least-once queue, deduplicate on your side.",
    },
  },
  {
    n: "02",
    name: "Time from signup to a delivered email",
    why: "This is the single best proxy for how much the vendor thought about developers. Not time to a 200 response — time to a message that actually lands in an inbox you control.",
    test: "Time yourself, from account creation to a real delivered message. Under ten minutes is good. An hour means the setup cost is being hidden from the pricing page.",
    wraps: {
      verdict: "partial",
      note: "One command deploys the infrastructure in about two minutes. Then AWS reviews your SES sandbox request before you can mail anyone who has not verified themselves, which takes an hour to three days and is AWS's decision, not ours. Fast to your own inbox, slower to strangers than a managed API.",
    },
  },
  {
    n: "03",
    name: "Templates that live in source control",
    why: "A drag-and-drop editor is useful for the people who are not you. It becomes a problem when it is the only place a template exists, because now the marketing email cannot be code reviewed, diffed, or rolled back, and the template is stuck in the vendor's dialect.",
    test: "Render a production template from a file in your repo, with no vendor API call in the path.",
    wraps: {
      verdict: "pass",
      note: "Templates are React Email components. They compile to plain HTML that any provider can send, so they keep working if you leave. The editor is TSX in Monaco rather than a block builder, which is the right trade for engineers and the wrong one if your marketing team wants to work unaided.",
    },
  },
  {
    n: "04",
    name: "Webhooks with a signature and a retry policy",
    why: "Delivery events are how you know anything. What matters is not that webhooks exist but that they are signed, that failures retry with backoff, and that there is a dead letter path so a bad deploy on your side does not silently drop an hour of events.",
    test: "Return a 500 from your handler on purpose. Find out whether the event comes back, how many times, and where it goes when it stops.",
    wraps: {
      verdict: "partial",
      note: "Retries are the strong half: events go SES to EventBridge to SQS with a dead letter queue, all inside your AWS account, so when your handler fails the messages sit in your own queue instead of disappearing into a vendor's retry budget. The signature is the weak half. The X-Wraps-Signature header carries a static shared secret, not an HMAC over the body, so it tells you the request came from us but proves nothing about the payload and does nothing against replay. Verify it, and do not treat it as a Stripe-style signature.",
    },
  },
  {
    n: "05",
    name: "Observability past a delivery percentage",
    why: "A dashboard that reports 98% delivered is not observability. You need the event trail for one message, by id, when a specific customer says they did not get their invoice.",
    test: "Take a message id from a send you made last week and pull its full event trace. Count the clicks it took.",
    wraps: {
      verdict: "pass",
      note: "Per-message event timelines, with send, delivery, open, click, bounce, complaint and reject. Retention is plan-fixed rather than configurable: 30 days on Free, 90 on Pro, 365 on Business. On the Production and Enterprise presets the raw events also land in a DynamoDB table in your account, so a longer window is yours to build. The Starter preset does not deploy that table.",
    },
  },
  {
    n: "06",
    name: "Transactional and marketing kept apart",
    why: "One promotional send with a bad list can take the complaint rate above the threshold, and the password resets go to spam with it. The two streams need separate identities so the reputation damage cannot cross over.",
    test: "Ask how to isolate the two. If the answer is a tag or a category rather than a separate sending identity, they share a fate.",
    wraps: {
      verdict: "partial",
      note: "You can separate them properly because it is your SES account: configuration sets, separate subdomains, separate identities are all available. Wraps does not force that split for you or set it up by default, so this is a thing you have to know to do.",
    },
  },
  {
    n: "07",
    name: "An honest answer about deliverability",
    why: "Nobody can promise inbox placement, and a vendor that does is telling you something useful about themselves. What you want is a clear statement of whose reputation you are sending on and what happens to it when a neighbour on the same IP pool has a bad week.",
    test: "Ask whether you are on a shared IP pool, what a dedicated one costs, and who owns the sending identity.",
    wraps: {
      verdict: "pass",
      note: "You send on your own SES account and your own domain, so there are no neighbours. That cuts the other way too: a bad list is entirely your complaint rate, with no shared pool to absorb it, and getting out of the SES sandbox is on you.",
    },
  },
];

const VERDICT_STYLES: Record<Item["wraps"]["verdict"], string> = {
  pass: "text-emerald-600 dark:text-emerald-500",
  partial: "text-yellow-600 dark:text-yellow-500",
  fail: "text-red-600 dark:text-red-500",
};

const VERDICT_LABEL: Record<Item["wraps"]["verdict"], string> = {
  pass: "Wraps passes",
  partial: "Wraps partly passes",
  fail: "Wraps fails this",
};

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />

      <div className="min-h-screen bg-background">
        <LandingNavbar />

        <header className="relative overflow-hidden border-b pt-24 pb-16">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="container relative mx-auto px-4">
            <Badge className="mb-4" variant="outline">
              Buying guide
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              What to look for in a{" "}
              <span className="text-primary">
                developer-first transactional email API
              </span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Seven things that separate an API you enjoy from one you tolerate.
              Each has a test you can run in an afternoon, and a note on how
              Wraps does against it.
            </p>
            <div className="mt-4 flex items-center gap-2 text-muted-foreground text-sm">
              <span>9 min read</span>
              <span>&bull;</span>
              <span>Wraps Team</span>
            </div>
          </div>
        </header>

        <main className="container mx-auto max-w-4xl space-y-16 px-4 py-16">
          <section>
            <p className="mb-6 text-lg text-muted-foreground">
              Wraps fails the first item on this list. We build one of these, so
              read the scoring with that in mind, and the scoring is here anyway
              because a checklist only one product passes is an advertisement.
            </p>
            <p className="text-muted-foreground">
              Every item below is something you can verify yourself in an
              afternoon with a free account. That is the point. Feature matrices
              are written by marketing teams; these tests are not.
            </p>
          </section>

          {ITEMS.map((item) => (
            <section key={item.n}>
              <div className="mb-4 flex items-baseline gap-4">
                <span className="font-mono text-lg text-primary">{item.n}</span>
                <h2 className="font-bold text-2xl">{item.name}</h2>
              </div>
              <p className="mb-6 text-muted-foreground">{item.why}</p>

              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="mb-1 font-semibold text-sm">The test</div>
                <p className="text-muted-foreground text-sm">{item.test}</p>
              </div>

              <div className="mt-4 rounded-xl border p-4">
                <div
                  className={`mb-1 font-semibold text-sm ${VERDICT_STYLES[item.wraps.verdict]}`}
                >
                  {VERDICT_LABEL[item.wraps.verdict]}
                </div>
                <p className="text-muted-foreground text-sm">
                  {item.wraps.note}
                </p>
              </div>
            </section>
          ))}

          <section>
            <h2 className="mb-4 font-bold text-2xl">
              What the list leaves out on purpose
            </h2>
            <p className="mb-4 text-muted-foreground">
              Price is not on it. Price is easy to compare and it is the thing
              everybody already checks, which is why it is a bad filter — every
              provider knows their pricing page is being read. The seven items
              above are the ones that are expensive to discover after you have
              built on top of somebody.
            </p>
            <p className="text-muted-foreground">
              SDK language coverage is also not on it. If you are on TypeScript
              or Python every serious provider has you covered, and if you are
              on something rarer you already know to check.
            </p>
          </section>

          <section className="rounded-2xl border bg-muted/30 p-8">
            <h2 className="mb-3 font-bold text-2xl">Run the tests</h2>
            <p className="mb-6 text-muted-foreground">
              The quickstart gets you to a delivered email, which covers item
              two. The events guide covers items four and five.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/docs/quickstart/email">
                  Email quickstart
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/docs/guides/webhooks">Events and webhooks</Link>
              </Button>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
