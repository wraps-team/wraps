import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import SMSSDKReferencePageContent from "./page-content";

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
      name: "SMS SDK",
      item: "https://wraps.dev/docs/sms-sdk-reference",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "SMS SDK Reference",
  description: "Complete reference for @wraps.dev/sms TypeScript SDK.",
  path: "/docs/sms-sdk-reference",
});

export default function SMSSDKReferencePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>SMS SDK Reference</h2>
        <p>Complete reference for @wraps.dev/sms TypeScript SDK.</p>
        <h2>Installation</h2>
        <h2>Configuration</h2>
        <h2>Sending SMS</h2>
        <h2>Opt-out Management</h2>
        <h2>Error Handling</h2>
      </article>
      <SMSSDKReferencePageContent />
    </>
  );
}
