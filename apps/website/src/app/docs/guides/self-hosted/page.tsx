import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import SelfHostedPageContent from "./page-content";

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
      name: "Self-Hosted Deployment",
      item: "https://wraps.dev/docs/guides/self-hosted",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Self-Hosted Deployment Guide",
  description:
    "Deploy the full Wraps control plane to your own AWS account. API, dashboard, database, and email infrastructure — everything in your infrastructure.",
  path: "/docs/guides/self-hosted",
  social: {
    twitterCopy: {
      description:
        "Deploy the full Wraps control plane to your own AWS account.",
    },
  },
});

export default function SelfHostedPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h1>Self-Hosted Deployment Guide</h1>
        <p>
          Deploy the full Wraps control plane to your own AWS account. API,
          dashboard, database, and email infrastructure — everything in your
          infrastructure.
        </p>
        <h2>Overview</h2>
        <h2>Prerequisites</h2>
        <h2>Step 1: Deploy the Control Plane API</h2>
        <h2>Step 2: Deploy Email Infrastructure</h2>
        <h2>Step 3: Connect to the Dashboard</h2>
        <h2>Step 4: Get Your Environment Variables</h2>
        <h2>Step 5: Deploy the Dashboard to Vercel</h2>
        <h2>Step 6: Set Up Vercel OIDC Authentication</h2>
        <h2>Step 7: Sign In to Your Instance</h2>
        <h2>Step 8: Verify Your Deployment</h2>
      </article>
      <SelfHostedPageContent />
    </>
  );
}
