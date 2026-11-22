import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import WorkflowsQuickstartPageContent from "./page-content";

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
      name: "Quickstart",
      item: "https://wraps.dev/docs/quickstart",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Email",
      item: "https://wraps.dev/docs/quickstart/email",
    },
    {
      "@type": "ListItem",
      position: 4,
      name: "Workflows",
      item: "https://wraps.dev/docs/quickstart/email/workflows",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Workflows Quickstart",
  description:
    "Define automated email sequences as code and deploy them in minutes. Initialize, validate, and push workflows using the Wraps CLI.",
  path: "/docs/quickstart/email/workflows",
  social: {
    twitterCopy: {
      description:
        "Define automated email sequences as code and deploy them in minutes.",
    },
  },
});

export default function WorkflowsQuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Workflows Quickstart</h2>
        <p>
          Define automated email sequences as code and deploy them in minutes.
        </p>
        <h2>Prerequisites</h2>
        <h2>Step 1: Initialize Workflows</h2>
        <h2>Step 2: Write a Workflow</h2>
        <h2>Step 3: Validate Locally</h2>
        <h2>Step 4: Push to Production</h2>
        <h2>Step 5: Trigger a Workflow</h2>
      </article>
      <WorkflowsQuickstartPageContent />
    </>
  );
}
