import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import PageContent from "./page-content";

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
      name: "Infrastructure",
      item: "https://wraps.dev/docs/infrastructure",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "CDN",
      item: "https://wraps.dev/docs/infrastructure/cdn",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "What Gets Deployed: CDN",
  description:
    "Every AWS resource Wraps creates when you run wraps cdn init. Includes S3, CloudFront, ACM certificates, and IAM roles for hosting email assets and images.",
  path: "/docs/infrastructure/cdn",
  social: {
    description:
      "Every AWS resource Wraps creates when you run wraps cdn init.",
  },
});

export default function InfrastructureCdnPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>What Gets Deployed: CDN</h2>
        <p>Every AWS resource Wraps creates when you run wraps cdn init.</p>
        <h2>Overview</h2>
        <h2>Core Resources</h2>
        <h2>Custom Domain Resources</h2>
        <h2>Cost Estimate</h2>
      </article>
      <PageContent />
    </>
  );
}
