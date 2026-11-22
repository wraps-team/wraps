import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import PlatformQuickstartPageContent from "./page-content";

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
      name: "Platform",
      item: "https://wraps.dev/docs/quickstart/platform",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Platform Quickstart",
  description:
    "Get started with the Wraps Platform for contacts and broadcasts.",
  path: "/docs/quickstart/platform",
});

export default function PlatformQuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Platform Quickstart</h2>
        <p>Get started with the Wraps Platform for contacts and broadcasts.</p>
        <h2>Before You Start: Wraps API Key Required</h2>
        <p>
          Create an API key in your organization settings and set it as
          WRAPS_API_KEY before writing any code. No AWS credentials needed.
        </p>
        <h2>Step 1: Connect Your Account</h2>
        <h2>Step 2: Import Contacts</h2>
        <h2>Step 3: Create Your First Broadcast</h2>
      </article>
      <PlatformQuickstartPageContent />
    </>
  );
}
