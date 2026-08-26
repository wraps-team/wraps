import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
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
      name: "API Versioning and Deprecation",
      item: "https://wraps.dev/docs/reference/versioning",
    },
  ],
};

const description =
  "How the Wraps Platform API is versioned, what counts as a breaking change, and how deprecations are signaled — Deprecation and Sunset response headers plus a 12-month notice period.";

export const metadata: Metadata = {
  title: "API Versioning and Deprecation Policy",
  description,
  openGraph: {
    title: "Wraps API Versioning and Deprecation Policy",
    description,
    type: "website",
    url: "https://wraps.dev/docs/reference/versioning",
  },
  twitter: {
    title: "Wraps API Versioning and Deprecation Policy",
    description,
  },
  alternates: {
    canonical: "https://wraps.dev/docs/reference/versioning",
  },
};

export default function VersioningReferencePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h2>Wraps API Versioning and Deprecation Policy</h2>
        <p>{description}</p>
        <h2>How the API is versioned</h2>
        <h2>What counts as a breaking change</h2>
        <h2>What does not count as a breaking change</h2>
        <h2>How a deprecation is signaled</h2>
        <h2>Notice periods</h2>
        <h2>What an integration should do</h2>
      </article>
      <PageContent />
    </>
  );
}
