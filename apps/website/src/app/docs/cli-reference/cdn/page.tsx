import type { Metadata } from "next";
import Script from "next/script";
import CLIReferenceCdnPageContent from "./page-content";

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
    {
      "@type": "ListItem",
      position: 3,
      name: "CDN",
      item: "https://wraps.dev/docs/cli-reference/cdn",
    },
  ],
};

export const metadata: Metadata = {
  title: "CDN CLI Commands",
  description: "CLI commands for managing CDN infrastructure.",
  openGraph: {
    title: "CDN CLI Commands | Wraps",
    description: "CLI commands for managing CDN infrastructure.",
    type: "website",
    url: "https://wraps.dev/docs/cli-reference/cdn",
  },
  twitter: {
    title: "CDN CLI Commands | Wraps",
    description: "CLI commands for managing CDN infrastructure.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs/cli-reference/cdn",
  },
};

export default function CLIReferenceCdnPage() {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        id="breadcrumb-schema"
        type="application/ld+json"
      />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>CDN CLI Commands</h2>
        <p>CLI commands for managing CDN infrastructure.</p>
        <h2>wraps cdn init</h2>
        <h2>wraps cdn status</h2>
        <h2>wraps cdn destroy</h2>
      </article>
      <CLIReferenceCdnPageContent />
    </>
  );
}
