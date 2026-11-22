import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import CloudflareQuickstartPageContent from "./page-content";

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
      name: "Cloudflare Workers",
      item: "https://wraps.dev/docs/quickstart/email/cloudflare",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Cloudflare Workers Email Quickstart",
  description:
    "Send email from a Cloudflare Worker with Wraps. Enable nodejs_compat, store AWS credentials as Wrangler secrets, and send your first email from the edge.",
  path: "/docs/quickstart/email/cloudflare",
  social: {
    twitterCopy: {
      description:
        "Send email from a Cloudflare Worker with Wraps using nodejs_compat and Wrangler secrets.",
    },
  },
});

export default function CloudflareQuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Send Email from Cloudflare Workers</h2>
        <p>
          Send email from a Cloudflare Worker with Wraps. Enable nodejs_compat,
          store AWS credentials as Wrangler secrets, and send from the edge.
        </p>
        <h2>Prerequisites</h2>
        <h2>Step 1: Deploy Infrastructure</h2>
        <h2>Step 2: Add Your Domain</h2>
        <h2>Step 3: Create a Worker and Install the SDK</h2>
        <h2>Step 4: Enable Node.js Compatibility</h2>
        <h2>Step 5: Store AWS Credentials as Secrets</h2>
        <h2>Step 6: Send Email from the Worker</h2>
        <h2>Step 7: Deploy</h2>
      </article>
      <CloudflareQuickstartPageContent />
    </>
  );
}
