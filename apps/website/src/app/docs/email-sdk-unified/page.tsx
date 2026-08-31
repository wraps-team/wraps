import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import EmailSDKUnifiedPageContent from "./page-content";

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
      name: "Email SDK (Unified)",
      item: "https://wraps.dev/docs/email-sdk-unified",
    },
  ],
};

export const metadata: Metadata = {
  title: "Email SDK (Unified Docs Prototype)",
  description:
    "Prototype: a single email SDK docs page with a TypeScript/Python language toggle that switches every code sample at once.",
  robots: { index: false, follow: false },
  alternates: {
    canonical: "https://wraps.dev/docs/email-sdk-unified",
  },
};

export default function EmailSDKUnifiedPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h1>Email SDK</h1>
        <p>
          Send email via AWS SES. Pick TypeScript or Python; every example
          follows.
        </p>
        <h2>Installation</h2>
        <h2>Quick Start</h2>
        <h2>Sending Emails</h2>
        <h2>Attachments</h2>
        <h2>Templates</h2>
        <h2>Suppression</h2>
        <h2>Error Handling</h2>
      </article>
      <EmailSDKUnifiedPageContent />
    </>
  );
}
