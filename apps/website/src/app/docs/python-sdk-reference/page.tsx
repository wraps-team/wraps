import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import PythonSDKReferencePageContent from "./page-content";

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
      name: "Python Email SDK",
      item: "https://wraps.dev/docs/python-sdk-reference",
    },
  ],
};

export const metadata: Metadata = {
  title: "Python Email SDK Reference",
  description:
    "Complete API reference for the wraps-email Python SDK. Send emails, attachments, SES-stored templates, batch sends, and suppression management via AWS SES — your AWS account, no vendor lock-in.",
  openGraph: {
    title: "Python Email SDK Reference | Wraps",
    description:
      "Send email via AWS SES from Python with wraps-email. Attachments, templates, batch sends, and suppression — typed and lightweight.",
    type: "website",
    url: "https://wraps.dev/docs/python-sdk-reference",
  },
  twitter: {
    title: "Python Email SDK Reference | Wraps",
    description:
      "Send email via AWS SES from Python with wraps-email. Attachments, templates, batch sends, and suppression.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs/python-sdk-reference",
  },
};

export default function PythonSDKReferencePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h1>Python Email SDK Reference</h1>
        <p>
          Complete reference for the wraps-email Python SDK — send email via AWS
          SES from Python.
        </p>
        <h2>Installation</h2>
        <h2>Quick Start</h2>
        <h2>Configuration</h2>
        <h2>Sending Emails</h2>
        <h2>Attachments</h2>
        <h2>Batch Sending</h2>
        <h2>Templates</h2>
        <h2>Suppression</h2>
        <h2>Error Handling</h2>
        <h2>Fully Typed</h2>
      </article>
      <PythonSDKReferencePageContent />
    </>
  );
}
