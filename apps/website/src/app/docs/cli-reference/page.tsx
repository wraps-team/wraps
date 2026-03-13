import type { Metadata } from "next";
import Script from "next/script";
import CLIReferencePageContent from "./page-content";

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
      name: "CLI Reference",
      item: "https://wraps.dev/docs/cli-reference",
    },
  ],
};

export const metadata: Metadata = {
  title: "CLI Reference",
  description: "Complete reference for all Wraps CLI commands.",
  openGraph: {
    title: "CLI Reference | Wraps",
    description: "Complete reference for all Wraps CLI commands.",
    type: "website",
    url: "https://wraps.dev/docs/cli-reference",
  },
  twitter: {
    title: "CLI Reference | Wraps",
    description: "Complete reference for all Wraps CLI commands.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs/cli-reference",
  },
};

export default function CLIReferencePage() {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        id="breadcrumb-schema"
        type="application/ld+json"
      />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Wraps CLI Reference</h2>
        <p>Complete reference for all Wraps CLI commands.</p>
        <h2>Installation</h2>
        <h2>Email Commands</h2>
        <h2>SMS Commands</h2>
        <h2>CDN Commands</h2>
        <h2>Platform Commands</h2>
      </article>
      <CLIReferencePageContent />
    </>
  );
}
