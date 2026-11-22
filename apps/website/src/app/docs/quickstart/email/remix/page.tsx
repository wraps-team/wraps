import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import RemixQuickstartPageContent from "./page-content";

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
      name: "Remix",
      item: "https://wraps.dev/docs/quickstart/email/remix",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Remix Email Quickstart",
  description:
    "Deploy email infrastructure and send your first email from a Remix application. Remix actions, form handling, and deployment configuration.",
  path: "/docs/quickstart/email/remix",
  social: {
    twitterCopy: {
      description:
        "Deploy email infrastructure and send your first email from a Remix application.",
    },
  },
});

export default function RemixQuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Send Email from Remix</h2>
        <p>
          Deploy email infrastructure and send your first email from a Remix
          application.
        </p>
        <h2>Prerequisites</h2>
        <h2>Step 1: Deploy Infrastructure</h2>
        <h2>Step 2: Add Your Domain</h2>
        <h2>Step 3: Install SDK</h2>
        <h2>Step 4: Send from a Remix Action</h2>
        <h2>Step 5: Deploy</h2>
      </article>
      <RemixQuickstartPageContent />
    </>
  );
}
