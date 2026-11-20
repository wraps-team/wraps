import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import FullGuidePageContent from "./page-content";

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
      name: "AWS Setup",
      item: "https://wraps.dev/docs/guides/aws-setup",
    },
    {
      "@type": "ListItem",
      position: 4,
      name: "Full Setup",
      item: "https://wraps.dev/docs/guides/aws-setup/full",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Full AWS Setup",
  description: "Complete AWS setup guide for Wraps.",
  path: "/docs/guides/aws-setup/full",
});

export default function FullGuidePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Full AWS Setup</h2>
        <p>Complete AWS setup guide for Wraps with detailed explanations.</p>
      </article>
      <FullGuidePageContent />
    </>
  );
}
