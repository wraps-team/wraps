import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import CdnQuickstartPageContent from "./page-content";

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
      name: "CDN",
      item: "https://wraps.dev/docs/quickstart/cdn",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "CDN Quickstart",
  description: "Deploy a CDN for your email assets with Wraps.",
  path: "/docs/quickstart/cdn",
});

export default function CdnQuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>CDN Quickstart</h2>
        <p>Deploy a CDN for your email assets with Wraps.</p>
        <h2>Before You Start: AWS Credentials Required</h2>
        <p>
          Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables,
          run aws configure, or use aws sso login before running any command.
        </p>
        <h2>Step 1: Deploy CDN</h2>
        <h2>Step 2: Configure Assets</h2>
        <h2>Step 3: Use in Templates</h2>
      </article>
      <CdnQuickstartPageContent />
    </>
  );
}
