import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import AWSSetupPageContent from "./page-content";

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
      name: "AWS Setup",
      item: "https://wraps.dev/docs/guides/aws-setup",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "AWS Setup Guide",
  description: "Configure your AWS account for Wraps.",
  path: "/docs/guides/aws-setup",
});

export default function AWSSetupPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>AWS Setup Guide</h2>
        <p>Configure your AWS account for Wraps.</p>
        <h2>Quick Setup</h2>
        <h2>Full Setup</h2>
        <h2>IAM Permissions</h2>
        <h2>Troubleshooting</h2>
      </article>
      <AWSSetupPageContent />
    </>
  );
}
