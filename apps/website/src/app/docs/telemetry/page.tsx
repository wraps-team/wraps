import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import TelemetryPageContent from "./page-content";

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
      name: "Telemetry",
      item: "https://wraps.dev/docs/telemetry",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Telemetry",
  description: "Learn about Wraps CLI telemetry and how to opt out.",
  path: "/docs/telemetry",
});

export default function TelemetryPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Telemetry</h2>
        <p>Learn about Wraps CLI telemetry and how to opt out.</p>
      </article>
      <TelemetryPageContent />
    </>
  );
}
