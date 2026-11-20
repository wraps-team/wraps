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
      name: "Email",
      item: "https://wraps.dev/docs/infrastructure/email",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "What Gets Deployed: Email",
  description:
    "Every AWS resource Wraps creates when you run wraps email init, organized by configuration preset. Includes IAM roles, SES, DynamoDB, Lambda, EventBridge, and SQS.",
  path: "/docs/infrastructure/email",
  social: {
    description:
      "Every AWS resource Wraps creates when you run wraps email init, organized by configuration preset.",
  },
});

export default function InfrastructureEmailPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>What Gets Deployed: Email</h2>
        <p>
          Every AWS resource Wraps creates when you run wraps email init,
          organized by configuration preset.
        </p>
        <h2>Architecture Overview</h2>
        <h2>Core Resources (All Presets)</h2>
        <h2>Starter Preset</h2>
        <h2>Production Preset</h2>
        <h2>Enterprise Preset</h2>
        <h2>Cost Breakdown</h2>
        <h2>Resource Tags</h2>
        <h2>IAM Policy Details</h2>
      </article>
      <PageContent />
    </>
  );
}
