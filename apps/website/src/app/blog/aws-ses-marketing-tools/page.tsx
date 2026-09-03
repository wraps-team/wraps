import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";

const TITLE = "Tools That Run Marketing Campaigns On Your Own AWS SES";
const DESCRIPTION =
  "Sendy, EmailOctopus, MailBluster, Mailblast and Wraps all put a campaign UI on top of SES you own. How they differ on deployment, where your data sits, and who each one is for.";
const URL = "https://wraps.dev/blog/aws-ses-marketing-tools";
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
    title: "Marketing Tools On Your Own AWS SES | Wraps",
    description: DESCRIPTION,
    type: "article",
    url: URL,
    images: [
      {
        url: "https://wraps.dev/og-image.png",
        width: 1200,
        height: 630,
        alt: "Marketing campaign tools built on AWS SES",
      },
    ],
    publishedTime: PUBLISHED,
  },
  twitter: {
    title: "Marketing Tools On Your Own AWS SES | Wraps",
    description: DESCRIPTION,
  },
  alternates: { canonical: URL },
};

type Tool = {
  name: string;
  site: string;
  shape: string;
  body: string;
  forYou: string;
};

const TOOLS: Tool[] = [
  {
    name: "Sendy",
    site: "sendy.co",
    shape: "Self-hosted PHP, one-time license",
    body: "The original of this category and still the most literal version of it. You buy a license, install the application on your own server, point it at your SES credentials, and it is entirely yours after that. No subscription, no vendor holding your list.",
    forYou:
      "You want the cheapest possible long-run cost and you are comfortable running and updating a PHP app, including the server it sits on and the backups.",
  },
  {
    name: "EmailOctopus",
    site: "emailoctopus.com",
    shape: "Hosted, with a connect-your-own-SES option",
    body: "A hosted campaign product with a friendly editor, historically offered both on its own sending infrastructure and in a mode where you supply SES credentials and pay less. Check which mode a given plan is on before assuming your sending runs through your account.",
    forYou:
      "You want a hosted tool with a gentle learning curve and are happy to let somebody else host the app as long as the sending is on your SES.",
  },
  {
    name: "MailBluster",
    site: "mailbluster.com",
    shape: "Hosted UI over your SES",
    body: "Built specifically as a front end for SES sending. You connect your AWS credentials, it runs the campaigns, segmentation and subscriber management, and the mail leaves through your account.",
    forYou:
      "You are running list-based marketing at volume and want SES economics without operating anything yourself.",
  },
  {
    name: "Mailblast",
    site: "mailblast.io",
    shape: "Hosted UI over your SES",
    body: "The same shape as MailBluster: a hosted campaign layer that sends through the SES account you connect. Positioned tightly around SES rather than as a general ESP.",
    forYou:
      "Same audience as above. Worth pricing both, since the two compete directly and the difference is mostly UI and plan structure.",
  },
  {
    name: "Wraps",
    site: "wraps.dev",
    shape: "Deploys the infrastructure, not just a UI over it",
    body: "Ours, so weigh it accordingly. The difference from everything above is that the others connect to SES you already set up; Wraps deploys the sending infrastructure — SES, EventBridge, SQS, Lambda, DynamoDB, IAM — into your account with one CLI command, and on the Production and Enterprise presets the raw delivery events land in a DynamoDB table you own. Templates are React Email components in your repo. Contacts, templates, workflows and a per-message send record live in our database, not yours, so this is a copy in your account rather than the only copy.",
    forYou:
      "You have engineers, you are already on AWS, and you want transactional and marketing on one pipeline you own. Not for you if nobody wants an AWS account.",
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
              Roundup
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              Tools that run marketing campaigns{" "}
              <span className="text-primary">on your own AWS SES</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Five options, sorted by how much of the stack you end up
              operating. One of them is ours.
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
              SES will send a million emails for about $100 and give you no way
              to write one. That gap is a whole product category: campaign tools
              that supply the editor, the list management and the scheduling,
              and hand the actual sending to an SES account you own.
            </p>
            <p className="text-muted-foreground">
              The useful axis between them is not features, it is how much you
              operate. Everything below is described by deployment shape for
              that reason. Plans and prices in this category change often —
              treat any number you find, here or elsewhere, as a prompt to go
              look.
            </p>
          </section>

          {TOOLS.map((t) => (
            <section key={t.name}>
              <div className="mb-2 flex flex-wrap items-baseline gap-3">
                <h2 className="font-bold text-2xl">{t.name}</h2>
                <span className="font-mono text-muted-foreground text-sm">
                  {t.site}
                </span>
              </div>
              <Badge className="mb-4" variant="secondary">
                {t.shape}
              </Badge>
              <p className="mb-4 text-muted-foreground">{t.body}</p>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="mb-1 font-semibold text-sm">Pick it if</div>
                <p className="text-muted-foreground text-sm">{t.forYou}</p>
              </div>
            </section>
          ))}

          <section>
            <h2 className="mb-4 font-bold text-2xl">
              The question that separates them
            </h2>
            <p className="mb-4 text-muted-foreground">
              Ask where the delivery events go, and specifically whether you get
              a copy or the only copy. Most of this category connects to your
              SES for sending and then keeps the opens, clicks and bounces in
              the vendor&apos;s own database, which means the economics are
              yours but the data is not. Wraps writes them to a table in your
              account and keeps its own copy to render the dashboard, which is
              better than one but is not the same as sole custody. That is a
              perfectly reasonable trade either way, and it is worth making
              knowingly.
            </p>
            <p className="text-muted-foreground">
              Second question: what happens to your campaigns if the vendor goes
              away. A self-hosted install keeps running. A hosted UI over your
              SES stops, though your domain reputation and suppression list
              survive because those live in your AWS account either way. That
              last part is the real benefit of this whole category over a
              conventional ESP.
            </p>
          </section>

          <section className="rounded-2xl border bg-muted/30 p-8">
            <h2 className="mb-3 font-bold text-2xl">
              If you want the Wraps one
            </h2>
            <p className="mb-6 text-muted-foreground">
              The marketing page covers what the campaign side does and, more
              usefully, three things it does not.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/for/marketing">
                  Wraps for marketing teams
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/byoc">How the architecture works</Link>
              </Button>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
