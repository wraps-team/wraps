import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";
import { PRICES_VERIFIED, VENDORS } from "@/config/alternatives";
import { VERSUS_PAGES, versusPath } from "@/config/versus";
import { pageMetadata } from "@/lib/page-metadata";

const url = "https://wraps.dev/versus";
const description =
  "Head-to-head comparisons between other email vendors, written by someone who is not one of them. Published prices, the real tension in each pair, and who each one is actually for.";

export const metadata: Metadata = pageMetadata({
  title: "Email Vendor Comparisons, Head to Head",
  description,
  path: "/versus",
});

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
    { "@type": "ListItem", position: 2, name: "Versus", item: url },
  ],
};

export default function VersusHubPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <JsonLd data={breadcrumbJsonLd} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <section className="mb-12">
            <SectionKicker>Versus</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Email vendors, head to head
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              Comparisons between two other vendors, with each one&apos;s
              published prices, the tension the pair is actually about, and a
              straight answer about who should pick which. Wraps is never one of
              the two being compared on these pages.
            </p>
            <p className="max-w-2xl text-muted-foreground">
              We make Wraps and we publish this, so read it with that in mind.
              Most of these pages do not mention us at all, and the ones that do
              say what it would cost you. Prices verified {PRICES_VERIFIED}.
            </p>
          </section>

          <section className="mb-16">
            <div className="grid gap-4 sm:grid-cols-2">
              {VERSUS_PAGES.map((page) => (
                <Link href={versusPath(page)} key={page.slug}>
                  <Card className="h-full transition-colors hover:border-brand/50">
                    <CardContent>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h2 className="font-heading font-semibold text-lg tracking-tight">
                          {VENDORS[page.a].name} vs {VENDORS[page.b].name}
                        </h2>
                        <ArrowRight
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                      </div>
                      <p className="mb-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow">
                        {page.dimensions.length} dimensions compared
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {page.description}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-lg border bg-muted/30 p-8">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Looking for the whole field instead of a pair?
            </h2>
            <p className="mb-4 text-muted-foreground">
              These pages compare two vendors. If you have not narrowed it down
              yet, the alternatives lists rank the realistic options for a given
              incumbent, with a catch stated on every one of them.
            </p>
            <Link
              className="inline-flex items-center gap-2 text-primary underline underline-offset-4"
              href="/alternatives"
            >
              Browse the ranked alternatives lists
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
