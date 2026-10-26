import { Badge } from "@wraps/ui/components/ui/badge";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { ResendForgeNotice } from "@/components/resend-forge-notice";
import {
  ALTERNATIVES_PAGES,
  PRICES_VERIFIED,
  VENDORS,
  type Vendor,
} from "@/config/alternatives";
import { type VersusPage, versusPath } from "@/config/versus";

const SITE = "https://wraps.dev";

export function versusUrl(page: VersusPage): string {
  return `${SITE}${versusPath(page)}`;
}

export function versusMetadata(page: VersusPage): Metadata {
  const url = versusUrl(page);
  return {
    title: page.title,
    description: page.description,
    openGraph: {
      title: `${page.title} | Wraps`,
      description: page.description,
      type: "article",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: `${page.title} | Wraps`,
      description: page.description,
    },
    alternates: { canonical: url },
  };
}

function breadcrumbSchema(page: VersusPage): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      {
        "@type": "ListItem",
        position: 2,
        name: "Versus",
        item: `${SITE}/versus`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: page.title,
        item: versusUrl(page),
      },
    ],
  };
}

function articleSchema(page: VersusPage): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.description,
    about: [VENDORS[page.a].name, VENDORS[page.b].name],
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
    mainEntityOfPage: { "@type": "WebPage", "@id": versusUrl(page) },
  };
}

function faqSchema(page: VersusPage): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/** The /alternatives list for a vendor, when one exists. */
function alternativesHrefFor(vendor: Vendor): string | undefined {
  const match = ALTERNATIVES_PAGES.find((page) => page.slug === vendor.id);
  return match ? `/alternatives/${match.slug}` : undefined;
}

function Breadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8">
      <ol className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-sm">
        <li>
          <Link className="transition-colors hover:text-foreground" href="/">
            Home
          </Link>
        </li>
        <li>
          <ChevronRight aria-hidden="true" className="size-3.5" />
        </li>
        <li>
          <Link
            className="transition-colors hover:text-foreground"
            href="/versus"
          >
            Versus
          </Link>
        </li>
        <li>
          <ChevronRight aria-hidden="true" className="size-3.5" />
        </li>
        <li className="text-foreground">{current}</li>
      </ol>
    </nav>
  );
}

/**
 * The shared facts, rendered from the vendor record rather than restated in
 * versus.ts. A repricing is one edit in config/alternatives.ts and every page
 * here follows it.
 */
function AtAGlance({ a, b }: { a: Vendor; b: Vendor }) {
  const rows: { label: string; a: string; b: string }[] = [
    { label: "What it is", a: a.category, b: b.category },
    { label: "Published pricing", a: a.pricing, b: b.pricing },
    { label: "Best for", a: a.bestFor, b: b.bestFor },
    { label: "Watch out for", a: a.watchOut, b: b.watchOut },
  ];

  return (
    <section aria-labelledby="at-a-glance" className="mt-12">
      <h2
        className="mb-4 font-heading font-semibold text-2xl tracking-tight"
        id="at-a-glance"
      >
        At a glance
      </h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-2xl border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th
                className="w-40 p-3 font-medium text-muted-foreground"
                scope="col"
              >
                &nbsp;
              </th>
              <th className="p-3 font-semibold" scope="col">
                {a.name}
              </th>
              <th className="p-3 font-semibold" scope="col">
                {b.name}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-b last:border-b-0 align-top"
                key={row.label}
              >
                <th
                  className="p-3 text-left font-medium text-muted-foreground"
                  scope="row"
                >
                  {row.label}
                </th>
                <td className="p-3 text-muted-foreground">{row.a}</td>
                <td className="p-3 text-muted-foreground">{row.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-muted-foreground text-xs">
        Prices are each vendor&apos;s published list prices, verified{" "}
        {PRICES_VERIFIED}. Check the vendor&apos;s own page before you sign
        anything.
      </p>
    </section>
  );
}

/**
 * Strengths and trade-offs side by side. Rendered only when the page carries
 * all four arrays, so the corpus can be deepened in batches without half a
 * page's worth of empty headings appearing on the ones not yet rewritten.
 */
function ProsAndCons({
  a,
  b,
  page,
}: {
  a: Vendor;
  b: Vendor;
  page: VersusPage;
}) {
  const { prosA, consA, prosB, consB } = page;
  const columns = [
    { vendor: a, pros: prosA, cons: consA },
    { vendor: b, pros: prosB, cons: consB },
  ];

  return (
    <section aria-labelledby="pros-cons" className="mt-12">
      <h2
        className="mb-6 font-heading font-bold text-2xl tracking-tight"
        id="pros-cons"
      >
        Pros and cons, side by side
      </h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {columns.map((column) => (
          <div className="rounded-lg border p-5" key={column.vendor.id}>
            <h3 className="mb-4 font-semibold text-lg">{column.vendor.name}</h3>
            <p className="mb-2 font-mono text-muted-foreground text-xs uppercase tracking-widest">
              Strengths
            </p>
            <ul className="mb-5 list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              {column.pros.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mb-2 font-mono text-muted-foreground text-xs uppercase tracking-widest">
              Trade-offs
            </p>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              {column.cons.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function MigrationChecklist({ items }: { items: readonly string[] }) {
  return (
    <section aria-labelledby="migration" className="mt-12">
      <h2
        className="mb-3 font-heading font-bold text-2xl tracking-tight"
        id="migration"
      >
        What actually moves when you switch
      </h2>
      <p className="mb-6 text-muted-foreground">
        In roughly the order you would do it. The expensive parts of an email
        migration are never the send call.
      </p>
      <ol className="list-decimal space-y-3 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  );
}

function BuyingQuestions({ items }: { items: readonly string[] }) {
  return (
    <section aria-labelledby="buying-questions" className="mt-12">
      <h2
        className="mb-3 font-heading font-bold text-2xl tracking-tight"
        id="buying-questions"
      >
        Questions to ask before you sign
      </h2>
      <p className="mb-6 text-muted-foreground">
        Put these to a sales rep, or find the answer in the documentation before
        anyone quotes you a number.
      </p>
      <ol className="list-decimal space-y-3 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  );
}

export function VersusArticle({ page }: { page: VersusPage }) {
  const a = VENDORS[page.a];
  const b = VENDORS[page.b];
  const aAlternatives = alternativesHrefFor(a);
  const bAlternatives = alternativesHrefFor(b);

  return (
    <>
      <JsonLd data={breadcrumbSchema(page)} />
      <JsonLd data={articleSchema(page)} />
      <JsonLd data={faqSchema(page)} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />

        <header className="border-b pt-24 pb-12">
          <div className="container mx-auto max-w-3xl px-4">
            <Breadcrumb current={`${a.name} vs ${b.name}`} />
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{a.name}</Badge>
              <Badge variant="outline">{b.name}</Badge>
            </div>
            <h1 className="mb-4 font-heading font-bold text-3xl tracking-tight md:text-4xl">
              {page.title}
            </h1>
            <p className="text-lg text-muted-foreground">{page.description}</p>
            {page.forgeNotice && <ResendForgeNotice className="mt-6" />}
          </div>
        </header>

        <main className="container mx-auto max-w-3xl px-4 py-12">
          <p className="text-lg text-muted-foreground leading-relaxed">
            {page.intro}
          </p>

          <AtAGlance a={a} b={b} />

          <section aria-labelledby="dimensions" className="mt-12">
            <h2
              className="mb-6 font-heading font-bold text-2xl tracking-tight"
              id="dimensions"
            >
              Where they actually differ
            </h2>
            <div className="space-y-10">
              {page.dimensions.map((dimension) => (
                <div key={dimension.heading}>
                  <h3 className="mb-3 font-semibold text-lg">
                    {dimension.heading}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <p className="mb-2 font-mono text-muted-foreground text-xs uppercase tracking-widest">
                        {a.name}
                      </p>
                      <p className="text-muted-foreground leading-relaxed">
                        {dimension.a}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="mb-2 font-mono text-muted-foreground text-xs uppercase tracking-widest">
                        {b.name}
                      </p>
                      <p className="text-muted-foreground leading-relaxed">
                        {dimension.b}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <ProsAndCons a={a} b={b} page={page} />

          <section aria-labelledby="pick" className="mt-12">
            <h2
              className="mb-6 font-heading font-bold text-2xl tracking-tight"
              id="pick"
            >
              Pick in thirty seconds
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="mb-3 font-semibold text-lg">
                  Choose {a.name} if
                </h3>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                  {page.pickA.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 font-semibold text-lg">
                  Choose {b.name} if
                </h3>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                  {page.pickB.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <MigrationChecklist items={page.migrationChecklist} />

          <BuyingQuestions items={page.buyingQuestions} />

          {page.thirdOption ? (
            <section
              aria-labelledby="third-option"
              className="mt-12 rounded-lg border bg-muted/40 p-6"
            >
              <h2
                className="mb-3 font-heading font-bold text-xl tracking-tight"
                id="third-option"
              >
                A third shape of answer
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {page.thirdOption}
              </p>
              <p className="mt-3 text-muted-foreground text-xs">
                Wraps publishes this page. We are not one of the two vendors
                being compared here, and this note is on it because the tension
                above is one owning the AWS account actually addresses — not
                because it is on every page.
              </p>
            </section>
          ) : null}

          <section aria-labelledby="faq" className="mt-12">
            <h2
              className="mb-6 font-heading font-bold text-2xl tracking-tight"
              id="faq"
            >
              Common questions
            </h2>
            <div className="space-y-6">
              {page.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="font-semibold text-lg">{faq.question}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <nav aria-label="Sources and related" className="mt-12 border-t pt-8">
            <h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
              Sources
            </h2>
            <ul className="mb-8 space-y-2 text-sm">
              {[a, b].map((vendor) => (
                <li key={vendor.id}>
                  <a
                    className="text-primary underline underline-offset-4"
                    href={vendor.url}
                    rel="nofollow noreferrer"
                    target="_blank"
                  >
                    {vendor.name} pricing, published by {vendor.name}
                  </a>
                </li>
              ))}
            </ul>

            <h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
              Related
            </h2>
            <ul className="space-y-2 text-sm">
              {aAlternatives ? (
                <li>
                  <Link
                    className="text-primary underline underline-offset-4"
                    href={aAlternatives}
                  >
                    {a.name} alternatives, ranked
                  </Link>
                </li>
              ) : null}
              {bAlternatives ? (
                <li>
                  <Link
                    className="text-primary underline underline-offset-4"
                    href={bAlternatives}
                  >
                    {b.name} alternatives, ranked
                  </Link>
                </li>
              ) : null}
              <li>
                <Link
                  className="text-primary underline underline-offset-4"
                  href="/versus"
                >
                  All head-to-head comparisons between other vendors
                </Link>
              </li>
              <li>
                <Link
                  className="text-primary underline underline-offset-4"
                  href="/approaches"
                >
                  The four ways to send application email, compared
                </Link>
              </li>
            </ul>
          </nav>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
