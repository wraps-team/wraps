import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import ProductionAccessPageContent from "./page-content";

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
      name: "Production Access",
      item: "https://wraps.dev/docs/guides/production-access",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Production Access Guide",
  description:
    "Step-by-step guide to getting AWS SES production access approval. Includes request templates, common rejection reasons, and best practices for approval.",
  path: "/docs/guides/production-access",
  social: {
    description:
      "Step-by-step guide to getting AWS SES production access approval. Includes request templates and best practices.",
    twitterCopy: {
      description:
        "Step-by-step guide to getting AWS SES production access approval. Includes templates and best practices.",
    },
  },
});

export default function ProductionAccessPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Production Access Guide</h2>
        <p>How to get AWS SES production access approval.</p>
        <h2>What is the SES Sandbox?</h2>
        <h2>Before You Request</h2>
        <h2>Option 1: AWS Console</h2>
        <h2>Option 2: AWS CLI</h2>
        <h2>What to Expect</h2>
        <h2>Tips for Faster Approval</h2>
        <h2>If Your Request Is Denied</h2>
        <h2>Next Steps</h2>
      </article>
      <ProductionAccessPageContent />
    </>
  );
}
