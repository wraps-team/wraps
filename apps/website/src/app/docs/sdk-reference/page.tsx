import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import SDKReferencePageContent from "./page-content";

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
      name: "Email SDK Reference",
      item: "https://wraps.dev/docs/sdk-reference",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Email SDK Reference",
  description:
    "Complete API reference for @wraps.dev/email TypeScript SDK. Send emails, use templates, track delivery events, manage suppression lists, and integrate with AWS SES.",
  path: "/docs/sdk-reference",
  social: {
    description:
      "Complete API reference for @wraps.dev/email TypeScript SDK. Send emails, use templates, and integrate with AWS SES.",
  },
});

export default function SDKReferencePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Email SDK Reference</h2>
        <p>Complete reference for @wraps.dev/email TypeScript SDK.</p>
        <h2>Installation</h2>
        <h2>Configuration</h2>
        <h2>Sending Emails</h2>
        <h2>Templates</h2>
        <h2>Email Events</h2>
        <h2>Suppression List</h2>
        <h2>Error Handling</h2>
      </article>
      <SDKReferencePageContent />
    </>
  );
}
