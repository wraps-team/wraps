import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import ClientSDKReferencePageContent from "./page-content";

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
      name: "Platform SDK",
      item: "https://wraps.dev/docs/client-sdk-reference",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Platform SDK Reference",
  description: "Complete reference for @wraps.dev/client Platform API SDK.",
  path: "/docs/client-sdk-reference",
});

export default function ClientSDKReferencePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Platform SDK Reference</h2>
        <p>Complete reference for @wraps.dev/client Platform API SDK.</p>
        <h2>Installation</h2>
        <h2>Authentication</h2>
        <h2>Contacts API</h2>
        <h2>Broadcasts API</h2>
        <h2>Batches API</h2>
        <h2>Error Handling</h2>
      </article>
      <ClientSDKReferencePageContent />
    </>
  );
}
