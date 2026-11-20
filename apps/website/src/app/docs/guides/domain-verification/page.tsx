import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import DomainVerificationPageContent from "./page-content";

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
      name: "Domain Verification",
      item: "https://wraps.dev/docs/guides/domain-verification",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Domain Verification Guide",
  description: "Set up DKIM, SPF, and DMARC for your domain.",
  path: "/docs/guides/domain-verification",
});

export default function DomainVerificationPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Domain Verification Guide</h2>
        <p>Set up DKIM, SPF, and DMARC for your domain.</p>
        <h2>DKIM Setup</h2>
        <h2>SPF Configuration</h2>
        <h2>DMARC Policy</h2>
        <h2>DNS Providers</h2>
      </article>
      <DomainVerificationPageContent />
    </>
  );
}
