import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import ExpressQuickstartPageContent from "./page-content";

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
      name: "Express",
      item: "https://wraps.dev/docs/quickstart/email/express",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Express Email Quickstart",
  description:
    "Deploy email infrastructure and send your first email from an Express application. Singleton pattern, error handling middleware, and production best practices.",
  path: "/docs/quickstart/email/express",
  social: {
    twitterCopy: {
      description:
        "Deploy email infrastructure and send your first email from an Express application.",
    },
  },
});

export default function ExpressQuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Send Email from Express</h2>
        <p>
          Deploy email infrastructure and send your first email from an Express
          application.
        </p>
        <h2>Prerequisites</h2>
        <h2>Step 1: Deploy Infrastructure</h2>
        <h2>Step 2: Add Your Domain</h2>
        <h2>Step 3: Install SDK</h2>
        <h2>Step 4: Create Email Service</h2>
        <h2>Step 5: Add a Send Route</h2>
        <h2>Step 6: Error Handling Middleware</h2>
      </article>
      <ExpressQuickstartPageContent />
    </>
  );
}
