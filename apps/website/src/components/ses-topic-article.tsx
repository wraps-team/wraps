import { Badge } from "@wraps/ui/components/ui/badge";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { SesCodeSnippet } from "@/components/ses-code-snippet";

const SITE = "https://wraps.dev";

export type SesTopicSection = {
  heading: string;
  /** Paragraphs, in order. */
  body: string[];
  bullets?: string[];
  code?: string;
  codeLanguage?: string;
};

/**
 * A threshold row. Every number here is quoted from AWS's own documentation
 * and the table renders `sourceUrl` next to it, because the whole reason these
 * pages beat the incumbents is that the numbers are attributable.
 */
export type SesThresholdRow = {
  metric: string;
  bestPractice: string;
  review: string;
  pause: string;
};

export type SesTopicFaq = {
  question: string;
  answer: string;
};

export type SesTopicLink = {
  href: string;
  label: string;
  blurb: string;
  external?: boolean;
};

export type SesTopic = {
  /** Route segment under /ses. */
  slug: string;
  /** Metadata title and H1. */
  title: string;
  description: string;
  badge: string;
  /** The paragraph under the H1. */
  lede: string;
  /** How to tell which version of this problem you have. Leads the page. */
  triage: { symptom: string; meaning: string }[];
  thresholds?: {
    caption: string;
    sourceUrl: string;
    sourceLabel: string;
    rows: SesThresholdRow[];
  };
  sections: SesTopicSection[];
  /** Drawn from SES_SOLVED_VS_UNSOLVED.md. What nobody can do for you. */
  limits: { heading: string; body: string[] };
  faqs: SesTopicFaq[];
  related: SesTopicLink[];
};

export function sesTopicUrl(topic: SesTopic): string {
  return `${SITE}/ses/${topic.slug}`;
}

export function sesTopicMetadata(topic: SesTopic): Metadata {
  const url = sesTopicUrl(topic);
  return {
    title: topic.title,
    description: topic.description,
    openGraph: {
      title: `${topic.title} | Wraps`,
      description: topic.description,
      type: "article",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: `${topic.title} | Wraps`,
      description: topic.description,
    },
    alternates: { canonical: url },
  };
}

function faqSchema(topic: SesTopic): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: topic.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

function articleSchema(topic: SesTopic): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: topic.title,
    description: topic.description,
    about: "Amazon Simple Email Service",
    proficiencyLevel: "Expert",
    author: {
      "@type": "Organization",
      name: "Wraps",
      url: SITE,
      sameAs: ["https://github.com/wraps-team", "https://twitter.com/wrapsdev"],
    },
    publisher: {
      "@type": "Organization",
      name: "Wraps",
      logo: { "@type": "ImageObject", url: `${SITE}/logo.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": sesTopicUrl(topic) },
  };
}

function RelatedLink({ item }: { item: SesTopicLink }) {
  const className = "font-medium text-primary underline underline-offset-4";
  return (
    <div className="rounded-lg border p-5">
      <h3 className="font-semibold">
        {item.external ? (
          <a
            className={className}
            href={item.href}
            rel="noreferrer"
            target="_blank"
          >
            {item.label}
          </a>
        ) : (
          <Link className={className} href={item.href}>
            {item.label}
          </Link>
        )}
      </h3>
      <p className="mt-2 text-muted-foreground text-sm">{item.blurb}</p>
    </div>
  );
}

export function SesTopicArticle({ topic }: { topic: SesTopic }) {
  return (
    <>
      <JsonLd data={articleSchema(topic)} />
      <JsonLd data={faqSchema(topic)} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />

        <header className="border-b pt-24 pb-12">
          <div className="container mx-auto max-w-3xl px-4">
            <Badge className="mb-4" variant="outline">
              {topic.badge}
            </Badge>
            <h1 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
              {topic.title}
            </h1>
            <p className="text-lg text-muted-foreground">{topic.lede}</p>
          </div>
        </header>

        <main className="container mx-auto max-w-3xl px-4 py-12">
          <section aria-labelledby="triage">
            <h2 className="mb-3 font-bold text-2xl tracking-tight" id="triage">
              Which one is happening to you
            </h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold" scope="col">
                      What you are seeing
                    </th>
                    <th className="px-4 py-3 font-semibold" scope="col">
                      What it usually means
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topic.triage.map((row) => (
                    <tr className="border-b last:border-0" key={row.symptom}>
                      <td className="px-4 py-3 align-top">{row.symptom}</td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {row.meaning}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {topic.thresholds ? (
            <section aria-labelledby="thresholds" className="mt-12">
              <h2
                className="mb-3 font-bold text-2xl tracking-tight"
                id="thresholds"
              >
                The numbers AWS enforces
              </h2>
              <p className="mb-4 text-muted-foreground">
                {topic.thresholds.caption}
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 font-semibold" scope="col">
                        Metric
                      </th>
                      <th className="px-4 py-3 font-semibold" scope="col">
                        Aim below
                      </th>
                      <th className="px-4 py-3 font-semibold" scope="col">
                        AWS places under review
                      </th>
                      <th className="px-4 py-3 font-semibold" scope="col">
                        AWS may pause sending
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topic.thresholds.rows.map((row) => (
                      <tr className="border-b last:border-0" key={row.metric}>
                        <td className="px-4 py-3 align-top font-medium">
                          {row.metric}
                        </td>
                        <td className="px-4 py-3 align-top text-muted-foreground">
                          {row.bestPractice}
                        </td>
                        <td className="px-4 py-3 align-top text-muted-foreground">
                          {row.review}
                        </td>
                        <td className="px-4 py-3 align-top text-muted-foreground">
                          {row.pause}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-muted-foreground text-sm">
                Source:{" "}
                <a
                  className="text-primary underline underline-offset-4"
                  href={topic.thresholds.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {topic.thresholds.sourceLabel}
                </a>
                . AWS changes these occasionally, so check the source before you
                plan around a number.
              </p>
            </section>
          ) : null}

          {topic.sections.map((section) => (
            <section className="mt-12" key={section.heading}>
              <h2 className="mb-3 font-bold text-2xl tracking-tight">
                {section.heading}
              </h2>
              {section.body.map((paragraph) => (
                <p
                  className="mb-4 text-muted-foreground leading-relaxed"
                  key={paragraph}
                >
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="mt-2 list-disc space-y-2 pl-6 text-muted-foreground">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
              {section.code ? (
                <SesCodeSnippet
                  code={section.code}
                  language={section.codeLanguage ?? "bash"}
                />
              ) : null}
            </section>
          ))}

          <section
            aria-labelledby="limits"
            className="mt-12 rounded-lg border bg-muted/40 p-6"
          >
            <h2 className="mb-3 font-bold text-xl tracking-tight" id="limits">
              {topic.limits.heading}
            </h2>
            {topic.limits.body.map((paragraph) => (
              <p
                className="mb-3 text-muted-foreground leading-relaxed last:mb-0"
                key={paragraph}
              >
                {paragraph}
              </p>
            ))}
          </section>

          <section aria-labelledby="faq" className="mt-12">
            <h2 className="mb-3 font-bold text-2xl tracking-tight" id="faq">
              Common questions
            </h2>
            <div className="space-y-6">
              {topic.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="font-semibold text-lg">{faq.question}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="related" className="mt-12 border-t pt-8">
            <h2 className="mb-4 font-bold text-xl tracking-tight" id="related">
              Where to go next
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {topic.related.map((item) => (
                <RelatedLink item={item} key={item.href} />
              ))}
            </div>
            <p className="mt-6 text-muted-foreground text-sm">
              <Link
                className="text-primary underline underline-offset-4"
                href="/ses"
              >
                Back to running Amazon SES in production
              </Link>
            </p>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
