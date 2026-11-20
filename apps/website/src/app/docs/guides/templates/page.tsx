import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import PageContent from "./page-content";

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
      name: "Templates as Code",
      item: "https://wraps.dev/docs/guides/templates",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Templates as Code",
  description:
    "Write email templates as React components, preview them locally, and push to SES and the Wraps dashboard.",
  path: "/docs/guides/templates",
});

export default function TemplatesPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Templates as Code</h2>
        <p>
          Write email templates as React components, preview them locally, and
          push to SES and the Wraps dashboard.
        </p>
        <h2>Getting Started</h2>
        <h2>Configuration</h2>
        <h2>Writing Templates</h2>
        <h2>Preview</h2>
        <h2>Push to SES</h2>
        <h2>Sending with Templates</h2>
      </article>
      <PageContent />
    </>
  );
}
