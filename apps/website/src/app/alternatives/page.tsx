import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";
import { ALTERNATIVES_PAGES, PRICES_VERIFIED } from "@/config/alternatives";

const url = "https://wraps.dev/alternatives";
const description =
  "Ranked, honestly-written lists of the real alternatives to Resend, SendGrid, Postmark, Mailgun, and Customer.io. Published prices, a catch on every option, and the incumbent kept on the list.";

export const metadata: Metadata = {
  title: "Amazon SES and Email Platform Alternatives, Ranked",
  description,
  openGraph: {
    title: "Email Platform Alternatives, Ranked | Wraps",
    description,
    url,
  },
  twitter: {
    title: "Email Platform Alternatives, Ranked | Wraps",
    description,
  },
  alternates: { canonical: url },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://wraps.dev",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Alternatives",
      item: url,
    },
  ],
};

export default function AlternativesHubPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <JsonLd data={breadcrumbJsonLd} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <section className="mb-12">
            <SectionKicker>Alternatives</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Email platform alternatives
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              Ranked lists of what you can actually move to, with each
              vendor&apos;s published prices, who it genuinely suits, and the
              thing you will find out in month three. Every list keeps the
              incumbent on it, because staying put is a real option.
            </p>
            <p className="max-w-2xl text-muted-foreground">
              We make Wraps, and it appears on every list here. We have put it
              where it honestly belongs and named what it does not do. Prices
              verified {PRICES_VERIFIED}.
            </p>
          </section>

          <section className="mb-16">
            <div className="grid gap-4 sm:grid-cols-2">
              {ALTERNATIVES_PAGES.map((page) => (
                <Link href={`/alternatives/${page.slug}`} key={page.slug}>
                  <Card className="h-full transition-colors hover:border-orange-500/50">
                    <CardContent>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h2 className="font-heading font-semibold text-lg tracking-tight">
                          {page.incumbent} alternatives
                        </h2>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </div>
                      <p className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-[0.08em]">
                        {page.ranked.length} options, ranked
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {page.whyPeopleLeave[0]}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-lg border bg-muted/30 p-8">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Looking for a head-to-head instead?
            </h2>
            <p className="mb-4 text-muted-foreground">
              These pages rank the whole field. If you have already narrowed it
              to two and want the detailed feature and pricing tables, the
              comparison pages go deeper on Wraps against one competitor at a
              time.
            </p>
            <Link
              className="inline-flex items-center gap-2 text-primary underline underline-offset-4"
              href="/compare"
            >
              Compare Wraps to a specific platform
              <ArrowRight className="size-4" />
            </Link>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
