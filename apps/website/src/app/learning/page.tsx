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
  type GlossaryCategory,
  glossaryTermsInCategory,
} from "@/lib/glossary";

const TITLE = "Learning Center";
const DESCRIPTION =
  "Everything Wraps has on email authentication, deliverability, and infrastructure — glossary terms, deep guides, and the tools that check each one, organized by topic.";
const URL = "https://wraps.dev/learning";

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

const collectionSchema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: TITLE,
  description: DESCRIPTION,
  url: URL,
  hasPart: GLOSSARY.map((term) => ({
    "@type": "DefinedTerm",
    name: term.term,
    url: `https://wraps.dev/glossary/${term.slug}`,
  })),
};

const FURTHER_READING: Partial<
  Record<GlossaryCategory, { label: string; href: string }[]>
> = {
  authentication: [
    { label: "SPF record guide", href: "/blog/spf-guide" },
    {
      label: "What changes under DMARCbis",
      href: "/blog/dmarcbis-what-changes",
    },
    {
      label: "Why your DMARC policy might be useless",
      href: "/blog/your-dmarc-policy-is-useless",
    },
    { label: "SPF record builder (tool)", href: "/tools/spf-builder" },
  ],
  deliverability: [
    {
      label: "SES bounce rate: thresholds and fixes",
      href: "/ses/bounce-rate",
    },
    { label: "SES complaint rate", href: "/ses/complaint-rate" },
    { label: "Landing in the spam folder", href: "/ses/spam-folder" },
    { label: "Account under review", href: "/ses/account-under-review" },
    { label: "How email actually works", href: "/blog/how-email-works" },
  ],
  infrastructure: [
    { label: "SES sending limits", href: "/ses/limits" },
    { label: "SES sandbox guide", href: "/blog/ses-sandbox-guide" },
    {
      label: "SES production architecture",
      href: "/blog/ses-production-architecture",
    },
    { label: "AWS account setup", href: "/docs/guides/aws-setup" },
    { label: "SES pricing calculator (tool)", href: "/tools/ses-calculator" },
    { label: "SES error reference", href: "/ses/errors" },
  ],
  // compliance and metrics intentionally omitted — no existing deep guide or
  // tool covers them yet. Do not add a placeholder or an unrelated link.
};

export default function Page() {
  return (
    <>
      <JsonLd data={collectionSchema} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />

        <header className="border-b pt-24 pb-12">
          <div className="container mx-auto max-w-4xl px-4">
            <Badge className="mb-4" variant="outline">
              Email reference
            </Badge>
            <h1 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
              Learning center
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              {DESCRIPTION}
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
            const furtherReading = FURTHER_READING[categoryId];
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
                <ul className="grid gap-2 sm:grid-cols-2">
                  {terms.map((term) => (
                    <li key={term.slug}>
                      <Link
                        className="text-primary text-sm underline underline-offset-4"
                        href={`/glossary/${term.slug}`}
                      >
                        {term.term}
                      </Link>
                    </li>
                  ))}
                </ul>
                {furtherReading !== undefined && furtherReading.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                      Further reading
                    </h3>
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                      {furtherReading.map((item) => (
                        <li className="rounded-lg border p-4" key={item.href}>
                          <Link
                            className="font-semibold hover:underline"
                            href={item.href}
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
