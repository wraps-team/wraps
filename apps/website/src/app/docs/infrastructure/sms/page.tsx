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
      name: "SMS",
      item: "https://wraps.dev/docs/infrastructure/sms",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "What Gets Deployed: SMS",
  description:
    "Every AWS resource Wraps creates when you run wraps sms init. Includes IAM roles, phone numbers, opt-out management, and delivery tracking.",
  path: "/docs/infrastructure/sms",
  social: {
    description:
      "Every AWS resource Wraps creates when you run wraps sms init.",
  },
});

export default function InfrastructureSmsPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>What Gets Deployed: SMS</h2>
        <p>Every AWS resource Wraps creates when you run wraps sms init.</p>
        <h2>Overview</h2>
        <h2>Core Resources</h2>
        <h2>Starter Preset</h2>
        <h2>Production Preset</h2>
        <h2>Enterprise Preset</h2>
        <h2>Cost Breakdown</h2>
      </article>
      <PageContent />
    </>
  );
}
