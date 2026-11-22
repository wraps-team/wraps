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
      name: "Reference",
      item: "https://wraps.dev/docs/reference",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "JSON Output",
      item: "https://wraps.dev/docs/reference/json-output",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "JSON Output Reference",
  description:
    "Complete reference for Wraps CLI --json flag. Machine-readable output schemas for every command.",
  path: "/docs/reference/json-output",
});

export default function JSONOutputReferencePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>JSON Output Reference</h2>
        <p>Machine-readable output schemas for every CLI command.</p>
        <h2>Envelope Format</h2>
        <h2>Usage</h2>
        <h2>Email Commands</h2>
        <h2>SMS Commands</h2>
        <h2>CDN Commands</h2>
        <h2>Auth Commands</h2>
        <h2>Platform Commands</h2>
        <h2>Error Handling</h2>
      </article>
      <PageContent />
    </>
  );
}
