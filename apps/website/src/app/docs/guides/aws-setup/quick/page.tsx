import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import QuickStartPageContent from "./page-content";

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
      name: "Quick Start",
      item: "https://wraps.dev/docs/guides/aws-setup/quick",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Quick AWS Setup",
  description: "Fast track AWS setup for Wraps.",
  path: "/docs/guides/aws-setup/quick",
});

export default function QuickStartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Quick AWS Setup</h2>
        <p>Fast track AWS setup for Wraps - get started in minutes.</p>
      </article>
      <QuickStartPageContent />
    </>
  );
}
