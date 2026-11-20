import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import NextjsQuickstartPageContent from "./page-content";

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
      name: "Next.js",
      item: "https://wraps.dev/docs/quickstart/email/nextjs",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Next.js Email Quickstart",
  description:
    "Deploy email infrastructure and send your first email from a Next.js application in under 5 minutes. Server Actions, API Routes, and Vercel OIDC.",
  path: "/docs/quickstart/email/nextjs",
  social: {
    twitterCopy: {
      description:
        "Deploy email infrastructure and send your first email from a Next.js application in under 5 minutes.",
    },
  },
});

export default function NextjsQuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Send Email from Next.js</h2>
        <p>
          Deploy email infrastructure and send your first email from a Next.js
          application in under 5 minutes.
        </p>
        <h2>Prerequisites</h2>
        <h2>Step 1: Deploy Infrastructure</h2>
        <h2>Step 2: Add Your Domain</h2>
        <h2>Step 3: Install SDK</h2>
        <h2>Step 4: Send from a Server Action</h2>
        <h2>Step 5: Send from an API Route</h2>
        <h2>Step 6: Deploy to Vercel</h2>
      </article>
      <NextjsQuickstartPageContent />
    </>
  );
}
