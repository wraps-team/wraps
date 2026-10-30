import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { ScalePlanContent } from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "SSO, Behavioral Segments, and What's Next: Inside the Wraps Scale Plan",
  description:
    "Every Scale-exclusive feature explained — SSO + SCIM, behavioral segments, unlimited AWS accounts, 1-year history — plus a look at the audit trail and custom retention coming next.",
  datePublished: "2026-05-06T00:00:00.000Z",
  dateModified: "2026-05-06T00:00:00.000Z",
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
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://wraps.dev/blog/scale-plan-enterprise-features",
  },
};

export const metadata: Metadata = {
  title:
    "SSO, Behavioral Segments, and What's Next: Inside the Wraps Scale Plan",
  description:
    "Every Scale-exclusive feature explained — SSO + SCIM, behavioral segments, unlimited AWS accounts, 1-year history — plus a look at the audit trail and custom retention coming next.",
  openGraph: {
    title: "Inside the Wraps Scale Plan | Wraps",
    description:
      "SSO, behavioral segments, unlimited AWS accounts, 1-year event history — plus audit trail and custom retention on the roadmap.",
    type: "article",
    url: "https://wraps.dev/blog/scale-plan-enterprise-features",
    publishedTime: "2026-05-06T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Inside the Wraps Scale Plan | Wraps",
    description:
      "SSO, behavioral segments, unlimited AWS accounts, 1-year event history — plus audit trail and custom retention on the roadmap.",
  },
  alternates: {
    canonical: "https://wraps.dev/blog/scale-plan-enterprise-features",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-top from-brand/20 via-transparent to-transparent" />

          <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-16">
            <div className="mb-4 flex items-center gap-2 font-medium text-brand-text text-sm">
              <Building2 size={16} />
              <span>Product</span>
              <span className="text-muted-foreground">&bull;</span>
              <span className="text-muted-foreground">7 min read</span>
              <span className="text-muted-foreground">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              SSO, Behavioral Segments,
              <span className="block bg-gradient-to-r from-brand to-warning bg-clip-text text-transparent">
                and What's Next
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              Every Scale-exclusive feature explained with real numbers, plus a
              look at what's coming: audit trail, custom data retention, RBAC,
              and the Send API.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {[
                "SSO + SCIM",
                "Behavioral segments",
                "Unlimited AWS accounts",
                "1M events/mo",
                "1-year history",
              ].map((tag) => (
                <span
                  className="rounded-full border bg-muted/30 px-3 py-1 text-muted-foreground text-sm"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </header>

        <ScalePlanContent />

        <LandingFooter />
      </div>
    </>
  );
}
