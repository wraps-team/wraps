import { Badge } from "@wraps/ui/components/ui/badge";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import {
  SES_ERROR_CATEGORIES,
  SES_ERRORS,
  sesErrorsInCategory,
} from "@/lib/ses-errors";

const TITLE = "Amazon SES Error Codes: Every Exception and Its Fix";
const DESCRIPTION =
  "Every Amazon SES exception the Wraps CLI knows how to explain, grouped by what actually went wrong: verification, throughput, account state, credentials.";
const URL = "https://wraps.dev/ses/errors";

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
  "@type": "ItemList",
  name: TITLE,
  description: DESCRIPTION,
  itemListElement: SES_ERRORS.map((error, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: error.awsExceptionName,
    url: `https://wraps.dev/ses/errors/${error.slug}`,
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
              Amazon SES reference
            </Badge>
            <h1 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
              Amazon SES error codes
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              {SES_ERRORS.length} exceptions, each with the literal string AWS
              returns and what to do about it. The remediation on every page is
              adapted from the Wraps CLI&apos;s own error catalog, which has to
              explain these failures to people mid-command.
            </p>
          </div>
        </header>

        <main className="container mx-auto max-w-4xl px-4 py-12">
          {SES_ERROR_CATEGORIES.map((category) => {
            const errors = sesErrorsInCategory(category.id);
            if (errors.length === 0) {
              return null;
            }
            return (
              <section
                aria-labelledby={category.id}
                className="mb-14"
                key={category.id}
              >
                <h2
                  className="font-bold text-2xl tracking-tight"
                  id={category.id}
                >
                  {category.label}
                </h2>
                <p className="mt-2 mb-5 text-muted-foreground">
                  {category.blurb}
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 font-semibold" scope="col">
                          AWS exception
                        </th>
                        <th className="px-4 py-3 font-semibold" scope="col">
                          What AWS says
                        </th>
                        <th className="px-4 py-3 font-semibold" scope="col">
                          Wraps code
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((error) => (
                        <tr className="border-b last:border-0" key={error.slug}>
                          <td className="whitespace-nowrap px-4 py-3 align-top">
                            <Link
                              className="font-medium text-primary underline underline-offset-4"
                              href={`/ses/errors/${error.slug}`}
                            >
                              {error.awsExceptionName}
                            </Link>
                            {error.smtpCode ? (
                              <span className="ml-2 text-muted-foreground text-xs">
                                SMTP {error.smtpCode}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-top text-muted-foreground">
                            {error.literalMessage}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 align-top">
                            <code className="text-muted-foreground text-xs">
                              {error.wrapsErrorCode}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          <section
            aria-labelledby="not-here"
            className="rounded-lg border bg-muted/40 p-6"
          >
            <h2 className="mb-3 font-bold text-xl tracking-tight" id="not-here">
              Not the error you have
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              These are the AWS exceptions the Wraps CLI maps to specific
              guidance. Anything else it surfaces as the real AWS error code
              rather than guessing, because the failure mode worth avoiding is a
              tool that reports every unknown AWS error as a credentials
              problem. The Wraps-side codes are documented separately in the{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href="/docs/reference/errors"
              >
                CLI error reference
              </Link>
              .
            </p>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              For the operational side of SES rather than a specific exception,
              start at{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href="/ses"
              >
                running Amazon SES in production
              </Link>
              .
            </p>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
