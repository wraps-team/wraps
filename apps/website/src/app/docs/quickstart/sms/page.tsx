import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import SmsQuickstartPageContent from "./page-content";

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
      name: "SMS",
      item: "https://wraps.dev/docs/quickstart/sms",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "SMS Quickstart",
  description: "Send SMS messages through AWS with the Wraps SMS SDK.",
  path: "/docs/quickstart/sms",
});

export default function SmsQuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>SMS Quickstart</h2>
        <p>Send SMS messages through AWS with the Wraps SMS SDK.</p>
        <h2>Before You Start: AWS Credentials Required</h2>
        <p>
          Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables,
          run aws configure, or use aws sso login before running any command.
        </p>
        <h2>Step 1: Deploy Infrastructure</h2>
        <h2>Step 2: Install SDK</h2>
        <h2>Step 3: Send Your First SMS</h2>
      </article>
      <SmsQuickstartPageContent />
    </>
  );
}
