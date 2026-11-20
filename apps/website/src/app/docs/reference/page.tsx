import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import ReferencePageContent from "./page-content";

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
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Reference",
  description:
    "Technical reference for the Wraps API, error codes, rate limits, JSON output format, and environment variables.",
  path: "/docs/reference",
  social: {
    twitterCopy: {
      description:
        "Technical reference for the Wraps API, error codes, rate limits, and environment variables.",
    },
  },
});

export default function ReferencePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <nav aria-hidden="true" className="sr-only">
        <h2>Reference</h2>
        <p>
          Technical reference for the Wraps API, error codes, rate limits, and
          environment variables.
        </p>
        <ul>
          <li>API Reference - REST API endpoints and authentication</li>
          <li>Error Reference - CLI and SDK error codes with solutions</li>
          <li>Rate Limits - API and AWS service rate limits</li>
          <li>JSON Output - Machine-readable CLI output format</li>
          <li>
            Environment Variables - Configuration for CLI, SDKs, and CI/CD
          </li>
        </ul>
      </nav>
      <ReferencePageContent />
    </>
  );
}
