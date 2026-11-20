import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import MigrationGuidePageContent from "./page-content";

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Docs",
      item: "https://wraps.dev/docs",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Guides",
      item: "https://wraps.dev/docs/guides",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Migration Guide",
      item: "https://wraps.dev/docs/guides/migration",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Migration Guide",
  description:
    "Switch from SendGrid, Postmark, or Resend to Wraps. Side-by-side code comparisons, cost analysis, and step-by-step migration instructions.",
  path: "/docs/guides/migration",
  social: {
    twitterCopy: {
      description: "Switch from SendGrid, Postmark, or Resend to Wraps.",
    },
  },
});

export default function MigrationGuidePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Migration Guide</h2>
        <p>Switch from SendGrid, Postmark, or Resend to Wraps.</p>
        <h2>Why Migrate to Wraps</h2>
        <h2>Migrating from SendGrid</h2>
        <h2>Migrating from Postmark</h2>
        <h2>Migrating from Resend</h2>
        <h2>Common Migration Steps</h2>
        <h2>Cost Comparison</h2>
        <h2>Next Steps</h2>
      </article>
      <MigrationGuidePageContent />
    </>
  );
}
