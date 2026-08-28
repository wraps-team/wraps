import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { alternativesPageBySlug } from "@/config/alternatives";

const comparisons = [
  {
    competitor: "Resend",
    href: "/compare/resend-vs-wraps",
    tagline: "Same DX, different economics",
  },
  {
    competitor: "Amazon SES",
    href: "/compare/amazon-ses-vs-wraps",
    tagline: "Same infrastructure, better DX",
  },
  {
    competitor: "SendGrid",
    href: "/compare/sendgrid-vs-wraps",
    tagline: "Escape the legacy tax",
  },
  {
    competitor: "Customer.io",
    href: "/compare/customer-io-vs-wraps",
    tagline: "Unlimited contacts, no surprise bills",
  },
  {
    competitor: "Postmark",
    href: "/compare/postmark-vs-wraps",
    tagline: "Beyond transactional sending",
  },
  {
    competitor: "Klaviyo",
    href: "/compare/klaviyo-vs-wraps",
    tagline: "Up to 5.6x cheaper at scale",
  },
  {
    competitor: "Mailgun",
    href: "/compare/mailgun-vs-wraps",
    tagline: "Your infra, AWS pricing, no suspensions",
  },
  {
    competitor: "Hand-rolled bounce handling",
    href: "/compare/ses-bounce-handling-hand-rolled-vs-wraps",
    tagline: "152 honest lines, and what they don't cover",
  },
];

/**
 * Cross-links to other comparison pages, excluding the current one.
 *
 * `alternativesSlug` points at the ranked list covering the same incumbent. A
 * head-to-head answers "is Wraps better than X"; the ranked list answers "what
 * else is there", which is the question most readers arrive with first.
 */
export function AlsoCompare({
  alternativesSlug,
  current,
}: {
  alternativesSlug?: string;
  current: string;
}) {
  const others = comparisons.filter((c) => c.href !== current);
  const alternatives = alternativesSlug
    ? alternativesPageBySlug(alternativesSlug)
    : undefined;

  return (
    <section className="mb-16">
      {alternatives ? (
        <Link
          className="mb-6 block"
          href={`/alternatives/${alternatives.slug}`}
        >
          <Card className="transition-colors hover:border-orange-500/50">
            <CardContent className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  Not sure it comes down to these two?
                </p>
                <p className="text-muted-foreground text-sm">
                  We also rank {alternatives.ranked.length}{" "}
                  {alternatives.incumbent} alternatives, prices included, with
                  Wraps placed where it honestly belongs.
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      ) : null}
      <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
        Also Compare
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {others.map((c) => (
          <Link href={c.href} key={c.href}>
            <Card className="h-full transition-colors hover:border-orange-500/50">
              <CardContent className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{c.competitor} vs Wraps</p>
                  <p className="text-muted-foreground text-sm">{c.tagline}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
