import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import TemplatesQuickstartPageContent from "./page-content";

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
      name: "Templates",
      item: "https://wraps.dev/docs/quickstart/email/templates",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Templates Quickstart",
  description:
    "Build email templates as React components, preview with hot-reload, and push to AWS SES in minutes. Step-by-step quickstart guide.",
  path: "/docs/quickstart/email/templates",
  social: {
    twitterCopy: {
      description:
        "Build email templates as React components, preview with hot-reload, and push to AWS SES in minutes.",
    },
  },
});

export default function TemplatesQuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Templates Quickstart</h2>
        <p>
          Build email templates as React components and push to AWS SES in
          minutes.
        </p>
        <h2>Prerequisites</h2>
        <h2>Step 1: Initialize Templates</h2>
        <h2>Step 2: Write a Template</h2>
        <h2>Step 3: Preview Locally</h2>
        <h2>Step 4: Push to Production</h2>
        <h2>Step 5: Send Using the Template</h2>
      </article>
      <TemplatesQuickstartPageContent />
    </>
  );
}
