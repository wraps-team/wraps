import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import InfrastructurePageContent from "./page-content";

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
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Infrastructure",
  description:
    "What gets deployed to your AWS account for each Wraps service. Detailed resource breakdowns for Email, SMS, CDN, and EventBridge events.",
  path: "/docs/infrastructure",
  social: {
    twitterCopy: {
      description:
        "What gets deployed to your AWS account for each Wraps service.",
    },
  },
});

export default function InfrastructurePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <nav aria-hidden="true" className="sr-only">
        <h2>Infrastructure Overview</h2>
        <p>What gets deployed to your AWS account for each Wraps service.</p>
        <ul>
          <li>Email - SES, DynamoDB, Lambda, EventBridge, and IAM roles</li>
          <li>SMS - End User Messaging, phone numbers, and event tracking</li>
          <li>CDN - S3, CloudFront, ACM certificates, and IAM roles</li>
          <li>EventBridge Events - Event types, payloads, and custom rules</li>
        </ul>
      </nav>
      <InfrastructurePageContent />
    </>
  );
}
