import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
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

export const metadata: Metadata = pageMetadata({
  title: "CDN CLI Commands",
  description: "CLI commands for managing CDN infrastructure.",
  path: "/docs/cli-reference/cdn",
});

export default function CLIReferenceCdnPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
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
