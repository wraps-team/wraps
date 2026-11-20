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
      name: "Rate Limits",
      item: "https://wraps.dev/docs/reference/rate-limits",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "API Rate Limits",
  description:
    "Rate limits for the Wraps Platform API by plan. Includes per-minute and daily limits, response headers, and handling 429 errors.",
  path: "/docs/reference/rate-limits",
});

export default function RateLimitsReferencePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h2>API Rate Limits</h2>
        <p>
          Rate limits for the Wraps Platform API by plan, with response headers
          and error handling.
        </p>
        <h2>Limits by Plan</h2>
        <h2>Public Endpoints</h2>
        <h2>Response Headers</h2>
        <h2>Handling 429 Errors</h2>
      </article>
      <PageContent />
    </>
  );
}
