import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight, Check, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";

const TITLE = "Email Vendor Lock-In: The Five Things That Actually Trap You";
const DESCRIPTION =
  "Exporting your contacts is the easy part. The five things that make leaving a transactional email provider expensive, and the questions to ask before you sign.";
const URL = "https://wraps.dev/blog/email-vendor-lock-in";
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
    title: "Email Vendor Lock-In | Wraps",
    description: DESCRIPTION,
    type: "article",
    url: URL,
    images: [
      {
        url: "https://wraps.dev/og-image.png",
        width: 1200,
        height: 630,
        alt: "Email vendor lock-in",
      },
    ],
    publishedTime: PUBLISHED,
  },
  twitter: {
    title: "Email Vendor Lock-In | Wraps",
    description: DESCRIPTION,
  },
  alternates: { canonical: URL },
};

type Trap = {
  n: string;
  name: string;
  body: string[];
  test: string;
};

const TRAPS: Trap[] = [
  {
    n: "01",
    name: "The sending reputation is on their IPs, not your domain",
    body: [
      "This is the one that costs real money, and it is the one nobody checks before signing. You spend months building a sending history: low complaint rates, consistent volume, engaged recipients. That history attaches to the IP addresses doing the sending, and on most plans those addresses belong to the provider and are shared with other customers.",
      "When you leave, you do not take it with you. You start again on a new pool at a lower volume, ramping slowly while mailbox providers decide whether to trust you. Every other item on this list is a weekend of engineering. This one is a quarter of degraded deliverability.",
    ],
    test: "Ask whether the sending identity is yours or theirs. If the answer involves their IP pool, your reputation is not portable.",
  },
  {
    n: "02",
    name: "Templates carry their merge syntax, not yours",
    body: [
      "Every provider has a templating dialect. Handlebars with custom helpers, a proprietary block editor that exports JSON, substitution tags with their own escaping rules. The export button gives you HTML, and that HTML has their syntax baked into it.",
      "The fix is cheap if you do it on day one and expensive if you do it in year three: keep templates in your own repo in a format that renders anywhere. React Email compiles to plain HTML and does not care who sends it. MJML works the same way. If templates only exist inside the vendor's editor, they are the vendor's.",
    ],
    test: "Can you render a production email from source control, without calling the vendor's API?",
  },
  {
    n: "03",
    name: "The suppression list is a liability you cannot re-derive",
    body: [
      "Every hard bounce and every complaint you have ever received is recorded somewhere. That list is the reason you are not mailing addresses that already burned you. Lose it and you re-mail all of them, at once, from a brand new sending identity that has no reputation to absorb the damage.",
      "That is the worst possible first week on a new provider, and it is entirely self-inflicted. Some providers export it readily. Some give you an API and a rate limit and wish you luck.",
    ],
    test: "Export the suppression list today. If you cannot do it in one call, you do not really have it.",
  },
  {
    n: "04",
    name: "Event history has a retention window and no bulk export",
    body: [
      "Opens, clicks, bounces, deliveries. Most providers hold these for 30 to 90 days depending on plan and expose them through a paginated API rather than a dump. That is usually fine day to day, and it is a problem the week you need to answer a compliance question about a message you sent eight months ago.",
      "This one matters less than the first three for most teams. It matters a great deal if you are in a regulated industry, and it tends to be discovered at the worst time.",
    ],
    test: "Ask for the retention window in writing, and ask whether there is an export or only an API.",
  },
  {
    n: "05",
    name: "The credentials are wired into more places than you remember",
    body: [
      "SMTP credentials and API keys spread. They end up in the main application, a cron job, two Lambdas, a Zapier somebody set up, the billing service, and a staging environment nobody has touched in a year. Migration means finding all of them, and the ones you miss fail silently until a customer says they never got a receipt.",
      "This is the most tractable item here. Route every send through one internal module from the beginning and the swap is a single file. Teams that skip that step pay for it once, loudly.",
    ],
    test: "Grep for the provider's SDK import across every repo. The count is your migration size.",
  },
];

const ANSWERS: { q: string; managed: string; byoc: string }[] = [
  {
    q: "Sending reputation",
    managed: "Their IP pool. Not portable.",
    byoc: "Your SES account and your domain. It stays when the platform goes.",
  },
  {
    q: "Suppression list",
    managed: "Theirs, exportable to varying degrees.",
    byoc: "SES account-level suppression in your AWS. Already yours.",
  },
  {
    q: "Delivery events",
    managed: "Their store, plan-limited retention.",
    byoc: "Your DynamoDB table, your retention policy.",
  },
  {
    q: "Templates",
    managed: "Their editor and dialect.",
    byoc: "Still the vendor's problem. See below.",
  },
  {
    q: "Contacts and workflows",
    managed: "Theirs.",
    byoc: "Still the vendor's problem. See below.",
  },
];

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
              Email vendor lock-in:{" "}
              <span className="text-primary">
                the five things that actually trap you
              </span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Exporting your contacts is the easy part. Here is what makes
              leaving expensive, and what to ask before you sign.
            </p>
            <div className="mt-4 flex items-center gap-2 text-muted-foreground text-sm">
              <span>7 min read</span>
              <span>&bull;</span>
              <span>Wraps Team</span>
            </div>
          </div>
        </header>

        <main className="container mx-auto max-w-4xl space-y-16 px-4 py-16">
          <section>
            <p className="mb-6 text-lg text-muted-foreground">
              SendGrid, Postmark, Mailgun, and Resend all let you export your
              contacts. That is not the part that traps you.
            </p>
            <p className="mb-6 text-muted-foreground">
              Lock-in on a transactional email provider is not contractual and
              it is rarely about data portability in the way the marketing pages
              discuss it. It is about the assets you build up while you are a
              customer that turn out to belong to the vendor. Five of them
              matter, in roughly this order.
            </p>
          </section>

          {TRAPS.map((trap) => (
            <section key={trap.n}>
              <div className="mb-4 flex items-baseline gap-4">
                <span className="font-mono text-lg text-primary">{trap.n}</span>
                <h2 className="font-bold text-2xl">{trap.name}</h2>
              </div>
              {trap.body.map((para) => (
                <p
                  className="mb-4 text-muted-foreground"
                  key={para.slice(0, 40)}
                >
                  {para}
                </p>
              ))}
              <div className="mt-6 rounded-xl border bg-muted/30 p-4">
                <div className="mb-1 font-semibold text-sm">The check</div>
                <p className="text-muted-foreground text-sm">{trap.test}</p>
              </div>
            </section>
          ))}

          <section>
            <h2 className="mb-4 font-bold text-2xl">
              The question that covers all five
            </h2>
            <p className="mb-4 text-muted-foreground">
              Could you move to a different provider in a week and keep your
              delivery rates? Not your data. Your delivery rates.
            </p>
            <p className="mb-4 text-muted-foreground">
              Most teams have never asked it, and the answer is usually no
              because of item one. That is worth knowing before you sign rather
              than during the migration, because the answer is decided at signup
              and cannot be changed afterwards without doing the migration you
              were trying to avoid.
            </p>
          </section>

          <section>
            <h2 className="mb-4 font-bold text-2xl">
              What bring-your-own-cloud fixes, and what it does not
            </h2>
            <p className="mb-6 text-muted-foreground">
              Wraps deploys sending infrastructure into your own AWS account, so
              some of this list stops being a vendor question. Some of it does
              not, and pretending otherwise would make this a worse buying
              guide.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th className="w-1/4 py-3 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Asset
                    </th>
                    <th className="py-3 pr-4 font-medium text-xs uppercase tracking-wide">
                      Managed provider
                    </th>
                    <th className="py-3 font-medium text-xs uppercase tracking-wide">
                      Wraps
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ANSWERS.map((row) => (
                    <tr
                      className="border-border/60 border-b align-top"
                      key={row.q}
                    >
                      <th className="py-4 pr-4 font-medium text-sm" scope="row">
                        {row.q}
                      </th>
                      <td className="py-4 pr-4 text-muted-foreground">
                        {row.managed}
                      </td>
                      <td className="py-4 text-muted-foreground">{row.byoc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div className="rounded-xl border p-6">
                <div className="mb-3 flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-500">
                  <Check className="h-4 w-4" />
                  Solved by the architecture
                </div>
                <p className="text-muted-foreground text-sm">
                  Your sending identity, reputation, suppression list, and event
                  history sit in your AWS account under your own IAM. Stop
                  paying Wraps and the sending infrastructure keeps running,
                  because it was never ours to switch off.
                </p>
              </div>
              <div className="rounded-xl border p-6">
                <div className="mb-3 flex items-center gap-2 font-semibold text-muted-foreground">
                  <X className="h-4 w-4" />
                  Not solved
                </div>
                <p className="text-muted-foreground text-sm">
                  Contacts, templates, and workflow definitions live in the
                  Wraps database, not yours. Export them before you leave.
                  Templates are the softer case since they are React Email in
                  your repo if you author them that way, but the platform data
                  is platform data and moving off us means moving it.
                </p>
              </div>
            </div>

            <p className="mt-8 text-muted-foreground">
              That is a real limit, not a rounding error. What changes is which
              half of the list is at stake: the expensive half, reputation and
              suppression, stops being a migration problem. The cheap half is
              still a migration.
            </p>
          </section>

          <section className="rounded-2xl border bg-muted/30 p-8">
            <h2 className="mb-3 font-bold text-2xl">
              Run the check on what you have now
            </h2>
            <p className="mb-6 text-muted-foreground">
              The migration guide covers moving an existing SES setup, and the
              BYOC page has the full architecture including what stays behind if
              you leave.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/docs/guides/migration">
                  Migration guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/byoc">How BYOC works here</Link>
              </Button>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
