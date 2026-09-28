import { Badge } from "@wraps/ui/components/ui/badge";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { SesCodeSnippet } from "@/components/ses-code-snippet";
import {
  GLOSSARY_CATEGORY_META,
  type GlossaryTerm,
  glossaryTermBySlug,
} from "@/lib/glossary";

const SITE = "https://wraps.dev";

export function glossaryUrl(term: GlossaryTerm): string {
  return `${SITE}/glossary/${term.slug}`;
}

/** A howToCheck value that is itself a command, as opposed to a sentence of prose. */
function looksLikeCommand(value: string): boolean {
  return /^(aws|dig|curl|wraps|npx|nslookup)\b/.test(value.trim());
}

export function glossaryMetadata(term: GlossaryTerm): Metadata {
  const url = glossaryUrl(term);
  const title = `${term.term}: Definition and How It Works`;
  return {
    title,
    description: term.shortDefinition,
    openGraph: {
      title: `${title} | Wraps`,
      description: term.shortDefinition,
      type: "article",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Wraps`,
      description: term.shortDefinition,
    },
    alternates: { canonical: url },
  };
}

function breadcrumbSchema(term: GlossaryTerm): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      {
        "@type": "ListItem",
        position: 2,
        name: "Glossary",
        item: `${SITE}/glossary`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: term.term,
        item: glossaryUrl(term),
      },
    ],
  };
}

function definedTermSchema(term: GlossaryTerm): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: term.term,
    description: term.shortDefinition,
    url: glossaryUrl(term),
    inDefinedTermSet: `${SITE}/glossary`,
  };
}

function faqSchema(term: GlossaryTerm): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: term.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function GlossaryArticle({ term }: { term: GlossaryTerm }) {
  const category = GLOSSARY_CATEGORY_META[term.category];
  const related = term.relatedSlugs.map((slug) => glossaryTermBySlug(slug));

  return (
    <>
      <JsonLd data={breadcrumbSchema(term)} />
      <JsonLd data={definedTermSchema(term)} />
      <JsonLd data={faqSchema(term)} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />

        <header className="border-b pt-24 pb-12">
          <div className="container mx-auto max-w-3xl px-4">
            <nav
              aria-label="Breadcrumb"
              className="mb-4 text-muted-foreground text-sm"
            >
              <Link className="hover:underline" href="/glossary">
                Glossary
              </Link>
              <span className="mx-2">/</span>
              <span>{term.term}</span>
            </nav>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{category.label}</Badge>
              {term.aliases.slice(0, 2).map((alias) => (
                <Badge key={alias} variant="secondary">
                  {alias}
                </Badge>
              ))}
            </div>
            <h1 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
              {term.term}
            </h1>
            <p className="text-lg text-muted-foreground">
              {term.shortDefinition}
            </p>
          </div>
        </header>

        <main className="container mx-auto max-w-3xl px-4 py-12">
          {term.body.map((section) => (
            <section className="mt-12 first:mt-0" key={section.heading}>
              <h2 className="mb-3 font-bold text-2xl tracking-tight">
                {section.heading}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {section.content}
              </p>
            </section>
          ))}

          <section aria-labelledby="why-it-matters" className="mt-12">
            <h2
              className="mb-3 font-bold text-2xl tracking-tight"
              id="why-it-matters"
            >
              Why it matters
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              {term.whyItMatters}
            </p>
          </section>

          {term.howToCheck ? (
            <section aria-labelledby="how-to-check" className="mt-12">
              <h2
                className="mb-3 font-bold text-2xl tracking-tight"
                id="how-to-check"
              >
                How to check it
              </h2>
              {looksLikeCommand(term.howToCheck) ? (
                <SesCodeSnippet code={term.howToCheck} language="bash" />
              ) : (
                <p className="text-muted-foreground leading-relaxed">
                  {term.howToCheck}
                </p>
              )}
            </section>
          ) : null}

          <section aria-labelledby="faq" className="mt-12">
            <h2 className="mb-3 font-bold text-2xl tracking-tight" id="faq">
              Common questions
            </h2>
            <div className="space-y-6">
              {term.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="font-semibold text-lg">{faq.question}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {related.length > 0 ? (
            <nav aria-label="Related terms" className="mt-12 border-t pt-8">
              <h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                Related terms
              </h2>
              <ul className="flex flex-wrap gap-2">
                {related.map((relatedTerm) => (
                  <li key={relatedTerm.slug}>
                    <Link
                      className="inline-block rounded-full border px-3 py-1 text-sm hover:bg-muted"
                      href={`/glossary/${relatedTerm.slug}`}
                    >
                      {relatedTerm.term}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          <nav aria-label="See also" className="mt-8 border-t pt-8">
            <h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
              See also
            </h2>
            <ul className="space-y-2 text-sm">
              {term.seeAlso.map((link) => (
                <li key={link.href}>
                  <Link
                    className="text-primary underline underline-offset-4"
                    href={link.href}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  className="text-primary underline underline-offset-4"
                  href="/glossary"
                >
                  All email terminology
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
