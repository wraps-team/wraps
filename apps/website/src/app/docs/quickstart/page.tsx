import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import QuickstartPageContent from "./page-content";

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
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Quickstart",
  description:
    "Deploy your first email infrastructure in 2 minutes with the Wraps CLI.",
  path: "/docs/quickstart",
});

export default function QuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Wraps Quickstart Guide</h2>
        <p>
          Deploy your first email infrastructure in 2 minutes with the Wraps
          CLI.
        </p>
        <h2>Choose Your Quickstart</h2>
        <ul>
          <li>Email - Send emails through AWS SES</li>
          <li>SMS - Send SMS through AWS Pinpoint</li>
          <li>CDN - Deploy CDN for email assets</li>
          <li>Platform - Contacts and broadcasts</li>
        </ul>
      </article>
      <QuickstartPageContent />
    </>
  );
}
