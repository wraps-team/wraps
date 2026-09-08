import { Badge } from "@wraps/ui/components/ui/badge";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { SesCodeSnippet } from "@/components/ses-code-snippet";
import { SES_ERROR_CATEGORIES, type SesError } from "@/lib/ses-errors";

const SITE = "https://wraps.dev";

export function sesErrorUrl(error: SesError): string {
  return `${SITE}/ses/errors/${error.slug}`;
}

function categoryLabel(error: SesError): string {
  return (
    SES_ERROR_CATEGORIES.find((category) => category.id === error.category)
      ?.label ?? "Amazon SES"
  );
}

export function sesErrorMetadata(error: SesError): Metadata {
  const url = sesErrorUrl(error);
  return {
    title: error.title,
    description: error.description,
    openGraph: {
      title: `${error.title} | Wraps`,
      description: error.description,
      type: "article",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: `${error.title} | Wraps`,
      description: error.description,
    },
    alternates: { canonical: url },
  };
}

function faqSchema(error: SesError): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: error.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

function articleSchema(error: SesError): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: error.title,
    description: error.description,
    about: `Amazon SES ${error.awsExceptionName}`,
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
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": sesErrorUrl(error),
    },
  };
}

export function SesErrorArticle({ error }: { error: SesError }) {
  return (
    <>
      <JsonLd data={articleSchema(error)} />
      <JsonLd data={faqSchema(error)} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />

        <header className="border-b pt-24 pb-12">
          <div className="container mx-auto max-w-3xl px-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{categoryLabel(error)}</Badge>
              <Badge variant="secondary">{error.awsExceptionName}</Badge>
              {error.smtpCode ? (
                <Badge variant="secondary">SMTP {error.smtpCode}</Badge>
              ) : null}
            </div>
            <h1 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
              {error.title}
            </h1>
            <p className="text-lg text-muted-foreground">{error.description}</p>
          </div>
        </header>

        <main className="container mx-auto max-w-3xl px-4 py-12">
          <section aria-labelledby="the-error">
            <h2
              className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide"
              id="the-error"
            >
              The error
            </h2>
            <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-sm">
              <code>{error.literalMessage}</code>
            </pre>
            <p className="mt-3 text-muted-foreground text-sm">
              AWS exception <code>{error.awsExceptionName}</code>. The Wraps CLI
              reports it as <code>{error.wrapsErrorCode}</code>.
            </p>
          </section>

          <section aria-labelledby="why" className="mt-12">
            <h2 className="mb-3 font-bold text-2xl tracking-tight" id="why">
              Why this happens
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              {error.whyItHappens}
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
              {error.causes.map((cause) => (
                <li key={cause}>{cause}</li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="fix" className="mt-12">
            <h2 className="mb-3 font-bold text-2xl tracking-tight" id="fix">
              How to fix it
            </h2>
            <ol className="space-y-8">
              {error.fixes.map((fix, index) => (
                <li key={fix.heading}>
                  <h3 className="font-semibold text-lg">
                    {index + 1}. {fix.heading}
                  </h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">
                    {fix.body}
                  </p>
                  {fix.code ? (
                    <SesCodeSnippet
                      code={fix.code}
                      language={fix.codeLanguage ?? "bash"}
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="recurring" className="mt-12">
            <h2
              className="mb-3 font-bold text-2xl tracking-tight"
              id="recurring"
            >
              How to stop it recurring
            </h2>
            <div className="space-y-6">
              {error.prevention.map((item) => (
                <div key={item.heading}>
                  <h3 className="font-semibold text-lg">{item.heading}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="faq" className="mt-12">
            <h2 className="mb-3 font-bold text-2xl tracking-tight" id="faq">
              Common questions
            </h2>
            <div className="space-y-6">
              {error.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="font-semibold text-lg">{faq.question}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="wraps"
            className="mt-12 rounded-lg border bg-muted/40 p-6"
          >
            <h2 className="mb-3 font-bold text-xl tracking-tight" id="wraps">
              What Wraps does about this
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              {error.wrapsNote}
            </p>
          </section>

          <nav aria-label="Related" className="mt-12 border-t pt-8">
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  className="text-primary underline underline-offset-4"
                  href={error.awsDocsUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  AWS documentation for {error.awsExceptionName}
                </a>
              </li>
              {error.wrapsDocsUrl ? (
                <li>
                  <a
                    className="text-primary underline underline-offset-4"
                    href={error.wrapsDocsUrl}
                  >
                    Wraps docs the CLI links to for this error
                  </a>
                </li>
              ) : null}
              <li>
                <Link
                  className="text-primary underline underline-offset-4"
                  href="/ses/errors"
                >
                  All Amazon SES error codes
                </Link>
              </li>
              <li>
                <Link
                  className="text-primary underline underline-offset-4"
                  href="/ses"
                >
                  Running Amazon SES in production
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
