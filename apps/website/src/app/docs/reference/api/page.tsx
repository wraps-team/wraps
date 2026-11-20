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
      name: "API Reference",
      item: "https://wraps.dev/docs/reference/api",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "API Reference",
  description:
    "OpenAPI reference for the Wraps Platform API. Endpoints for contacts, batch sending, workflows, events, and webhooks.",
  path: "/docs/reference/api",
});

export default function ApiReferencePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h2>API Reference</h2>
        <p>
          OpenAPI reference for the Wraps Platform API with interactive
          documentation.
        </p>
        <h2>Base URL</h2>
        <h2>Authentication</h2>
        <h2>Endpoints</h2>
        <h2>OpenAPI Spec</h2>
      </article>
      <PageContent />
    </>
  );
}
