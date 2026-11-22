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
      name: "Guides",
      item: "https://wraps.dev/docs/guides",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Building Workflows",
      item: "https://wraps.dev/docs/guides/workflows",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Building Workflows",
  description:
    "Create automated email and SMS sequences using the Wraps workflow DSL.",
  path: "/docs/guides/workflows",
});

export default function WorkflowsPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Building Workflows</h2>
        <p>
          Create automated email and SMS sequences using the Wraps workflow DSL.
        </p>
        <h2>Defining a Workflow</h2>
        <h2>Trigger Types</h2>
        <h2>Step Helpers</h2>
        <h2>Validate and Push</h2>
        <h2>Re-engagement Example</h2>
      </article>
      <PageContent />
    </>
  );
}
