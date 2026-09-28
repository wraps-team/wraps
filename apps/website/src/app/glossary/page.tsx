import { Badge } from "@wraps/ui/components/ui/badge";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import {
  GLOSSARY,
  GLOSSARY_CATEGORIES,
  GLOSSARY_CATEGORY_META,
  glossaryTermsInCategory,
} from "@/lib/glossary";

const TITLE = "Email Terminology Glossary";
const DESCRIPTION =
  "SPF, DKIM, DMARC, bounces, suppression lists, and every other term that comes up running Amazon SES in production — defined from the code that actually checks each one.";
const URL = "https://wraps.dev/glossary";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
  },
  alternates: { canonical: URL },
};

const listSchema = {
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  name: TITLE,
  description: DESCRIPTION,
  url: URL,
  hasDefinedTerm: GLOSSARY.map((term) => ({
    "@type": "DefinedTerm",
    name: term.term,
    url: `https://wraps.dev/glossary/${term.slug}`,
  })),
};

export default function Page() {
  return (
    <>
      <JsonLd data={listSchema} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />

        <header className="border-b pt-24 pb-12">
          <div className="container mx-auto max-w-4xl px-4">
            <Badge className="mb-4" variant="outline">
              Email reference
            </Badge>
            <h1 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
              Email terminology glossary
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              {GLOSSARY.length} terms, grouped by what they're actually for.
              Every authentication entry is written from what Wraps'
              deliverability checker evaluates, not from general knowledge —
              where a failure mode already has its own page, this links to it
              instead of restating it.
            </p>
            <p className="mt-4 text-muted-foreground text-sm">
              Part of the Wraps{" "}
              <Link className="underline hover:no-underline" href="/learning">
                Learning Center
              </Link>
              .
            </p>
          </div>
        </header>

        <main className="container mx-auto max-w-4xl px-4 py-12">
          {GLOSSARY_CATEGORIES.map((categoryId) => {
            const category = GLOSSARY_CATEGORY_META[categoryId];
            const terms = glossaryTermsInCategory(categoryId);
            if (terms.length === 0) {
              return null;
            }
            return (
              <section
                aria-labelledby={categoryId}
                className="mb-14"
                key={categoryId}
              >
                <h2
                  className="font-bold text-2xl tracking-tight"
                  id={categoryId}
                >
                  {category.label}
                </h2>
                <p className="mt-2 mb-5 text-muted-foreground">
                  {category.blurb}
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {terms.map((term) => (
                    <li className="rounded-lg border p-4" key={term.slug}>
                      <Link
                        className="font-semibold hover:underline"
                        href={`/glossary/${term.slug}`}
                      >
                        {term.term}
                      </Link>
                      <p className="mt-1 text-muted-foreground text-sm">
                        {term.shortDefinition}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
