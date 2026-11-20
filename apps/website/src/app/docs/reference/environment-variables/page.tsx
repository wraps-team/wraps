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
      name: "Environment Variables",
      item: "https://wraps.dev/docs/reference/environment-variables",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Environment Variables",
  description:
    "All environment variables used by the Wraps CLI and SDKs, including AWS credentials, DNS automation, and CI/CD configuration.",
  path: "/docs/reference/environment-variables",
});

export default function EnvironmentVariablesPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Environment Variables</h2>
        <p>All environment variables used by the Wraps CLI and SDKs.</p>
        <h2>Wraps Configuration</h2>
        <h2>AWS Credentials</h2>
        <h2>DNS Automation</h2>
        <h2>Pulumi (Internal)</h2>
        <h2>CI/CD Examples</h2>
        <h2>Next Steps</h2>
      </article>
      <PageContent />
    </>
  );
}
