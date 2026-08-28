import { Button } from "@wraps/ui/components/ui/button";
import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { ArrowRight, CornerDownRight } from "lucide-react";
import Link from "next/link";
import { AlsoAlternatives } from "@/app/alternatives/components/also-alternatives";
import { AlternativesBreadcrumb } from "@/app/alternatives/components/breadcrumb";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";
import {
  type AlternativesPage,
  PRICES_VERIFIED,
  type RankedEntry,
  VENDORS,
} from "@/config/alternatives";

/**
 * Renders one ranked alternatives list. Five pages share this so the layout,
 * the disclosure, and the "every vendor gets a watch-out" rule cannot drift
 * apart page by page.
 */
export function AlternativesPageLayout({ page }: { page: AlternativesPage }) {
  const url = `https://wraps.dev/alternatives/${page.slug}`;

  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      <JsonLd data={breadcrumbSchema(page, url)} />
      <JsonLd data={itemListSchema(page, url)} />
      <JsonLd data={articleSchema(page, url)} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <AlternativesBreadcrumb current={`${page.incumbent} alternatives`} />

          <section className="mb-12">
            <SectionKicker>Alternatives</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              {page.ranked.length} {page.incumbent} alternatives, ranked
            </h1>
            <p className="mb-6 max-w-2xl text-lg text-muted-foreground">
              {page.intro}
            </p>
            <Disclosure incumbent={page.incumbent} />
          </section>

          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Why people leave {page.incumbent}
            </h2>
            <p className="mb-6 text-muted-foreground">
              Not a list of grievances. These are the four specific things that
              send people looking, and which one applies to you decides where
              you should go.
            </p>
            <Card>
              <CardContent>
                <ul className="space-y-3">
                  {page.whyPeopleLeave.map((reason) => (
                    <li className="flex items-start gap-3" key={reason}>
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-orange-500"
                      />
                      <span className="text-muted-foreground">{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Pick in thirty seconds
            </h2>
            <p className="mb-6 text-muted-foreground">
              If you only read one section, read this one.
            </p>
            <Card className="overflow-hidden py-0">
              <ul className="divide-y">
                {page.router.map((rule) => (
                  <li className="p-4 sm:p-5" key={rule.condition}>
                    <p className="font-medium">{rule.condition}</p>
                    <p className="mt-1 flex items-start gap-2 text-muted-foreground text-sm">
                      <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-orange-500" />
                      {rule.pick}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              The full list
            </h2>
            <p className="mb-6 text-muted-foreground">
              Ordered by how close each option is to being a replacement for{" "}
              {page.incumbent}, not by which one we would prefer you pick. Every
              entry has a catch, including ours. Prices are the vendor&apos;s
              published list prices as of {PRICES_VERIFIED}.
            </p>
            <div className="space-y-4">
              {page.ranked.map((entry, index) => (
                <RankedCard entry={entry} key={entry.vendor} rank={index + 1} />
              ))}
            </div>
          </section>

          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              When to stay on {page.incumbent}
            </h2>
            <p className="mb-6 text-muted-foreground">
              Switching email providers costs engineering time, domain
              reputation continuity, and a month of watching graphs. Here is
              when it is not worth it.
            </p>
            <Card>
              <CardContent>
                <ul className="space-y-3">
                  {page.stayIf.map((reason) => (
                    <li className="flex items-start gap-3" key={reason}>
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                      />
                      <span className="text-muted-foreground">{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          <section className="mb-16">
            <Link className="block" href={page.compareHref}>
              <Card className="transition-colors hover:border-orange-500/50">
                <CardContent className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      Already down to Wraps and {page.incumbent}?
                    </p>
                    <p className="text-muted-foreground text-sm">
                      The head-to-head goes deeper: full feature tables, cost at
                      four volumes, and the code diff for switching.
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </section>

          <AlsoAlternatives currentSlug={page.slug} />

          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              If the AWS row is the one that fits
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-muted-foreground">
              Wraps deploys email infrastructure into your own AWS account, then
              gives you the platform on top. Free to start, no credit card, and
              the infrastructure keeps running whether or not you keep paying
              us.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/docs/quickstart/email">
                  Read the quickstart
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/tools/ses-calculator">Price your volume</Link>
              </Button>
            </div>
          </section>

          <div className="mt-12 border-t pt-6 text-center text-muted-foreground text-xs">
            <p>
              Prices verified against vendor pricing pages in {PRICES_VERIFIED}.
              Email pricing moves; if a number here is stale or wrong, that is a
              bug.
            </p>
            <p className="mt-1">
              Tell us at{" "}
              <a
                className="text-primary underline"
                href="mailto:support@wraps.dev"
              >
                support@wraps.dev
              </a>{" "}
              and we will fix it, including when the correction does not favour
              us.
            </p>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

function Disclosure({ incumbent }: { incumbent: string }) {
  return (
    <Card className="border-orange-500/30 bg-orange-500/5">
      <CardContent>
        <p className="text-muted-foreground text-sm">
          <strong className="text-foreground">We make Wraps</strong>, which is
          on this list. We have put it where it honestly belongs rather than at
          the top, said plainly what it does not do, and given every other
          option a fair description including the ones that beat us. {incumbent}{" "}
          itself is the last entry, because staying put is a real choice and is
          often the right one.
        </p>
      </CardContent>
    </Card>
  );
}

function RankedCard({ entry, rank }: { entry: RankedEntry; rank: number }) {
  const vendor = VENDORS[entry.vendor];

  return (
    <Card className={cardAccent(entry)} id={vendor.id}>
      <CardContent>
        <div className="mb-3 flex items-start gap-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-mono font-medium text-muted-foreground text-sm">
            {rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3
                className={`font-heading font-semibold text-xl tracking-tight ${
                  vendor.isUs ? "text-primary" : ""
                }`}
              >
                {vendor.name}
              </h3>
              {vendor.isUs ? <Badge>That&apos;s us</Badge> : null}
              {entry.isIncumbent ? <Badge>Staying put</Badge> : null}
            </div>
            <p className="mt-0.5 text-muted-foreground text-sm">
              {vendor.category}
            </p>
          </div>
        </div>

        <p className="mb-4 sm:pl-12">{entry.verdict}</p>

        <dl className="space-y-3 border-t pt-4 text-sm sm:pl-12">
          <Fact label="Pricing" value={vendor.pricing} />
          <Fact label="Best for" value={vendor.bestFor} />
          <Fact label="Watch out for" value={vendor.watchOut} />
        </dl>

        {vendor.isUs ? null : (
          <p className="mt-4 text-sm sm:pl-12">
            <a
              className="text-primary underline underline-offset-4"
              href={vendor.url}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              Check our numbers on {vendor.name}&apos;s own pricing page
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Our own entry is outlined, the incumbent's is recessed, everything else plain. */
function cardAccent(entry: RankedEntry): string {
  if (VENDORS[entry.vendor].isUs) {
    return "border-primary/30";
  }
  if (entry.isIncumbent) {
    return "bg-muted/30";
  }
  return "";
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="sm:flex sm:gap-4">
      <dt className="shrink-0 font-medium sm:w-32">{label}</dt>
      <dd className="text-muted-foreground">{value}</dd>
    </div>
  );
}

function breadcrumbSchema(page: AlternativesPage, url: string) {
  return {
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
        item: "https://wraps.dev/alternatives",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${page.incumbent} alternatives`,
        item: url,
      },
    ],
  };
}

function itemListSchema(page: AlternativesPage, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${page.incumbent} alternatives`,
    description: page.description,
    url,
    numberOfItems: page.ranked.length,
    itemListElement: page.ranked.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: VENDORS[entry.vendor].name,
      description: entry.verdict,
      url: `${url}#${entry.vendor}`,
    })),
  };
}

function articleSchema(page: AlternativesPage, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${page.ranked.length} ${page.incumbent} alternatives, ranked`,
    description: page.description,
    datePublished: "2026-08-27T00:00:00.000Z",
    dateModified: "2026-08-27T00:00:00.000Z",
    author: {
      "@type": "Organization",
      name: "Wraps",
      url: "https://wraps.dev",
    },
    publisher: {
      "@type": "Organization",
      name: "Wraps",
      logo: {
        "@type": "ImageObject",
        url: "https://wraps.dev/logo.png",
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}
