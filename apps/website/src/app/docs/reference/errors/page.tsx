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
      name: "Error Codes & Troubleshooting",
      item: "https://wraps.dev/docs/reference/errors",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Error Codes & Troubleshooting",
  description:
    "Complete reference for all Wraps CLI error codes and SDK error classes, with solutions for each.",
  path: "/docs/reference/errors",
});

export default function ErrorsReferencePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Error Codes & Troubleshooting</h2>
        <p>
          Complete reference for all CLI error codes and SDK error classes, with
          solutions for each.
        </p>
        <h2>CLI Error Codes</h2>
        <h3>Credential Errors</h3>
        <h3>IAM & Permission Errors</h3>
        <h3>Stack & Deployment Errors</h3>
        <h3>Email Errors</h3>
        <h3>SMS Errors</h3>
        <h3>SMTP Errors</h3>
        <h3>State Errors</h3>
        <h3>Template Errors</h3>
        <h2>SDK Error Classes</h2>
        <h3>Email SDK</h3>
        <h3>SMS SDK</h3>
        <h2>Retry Pattern</h2>
        <h2>Next Steps</h2>
      </article>
      <PageContent />
    </>
  );
}
