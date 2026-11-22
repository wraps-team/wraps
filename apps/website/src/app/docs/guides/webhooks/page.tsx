import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import WebhooksPageContent from "./page-content";

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
      name: "Webhooks",
      item: "https://wraps.dev/docs/guides/webhooks",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Webhooks Guide",
  description:
    "Receive real-time SES email events at your HTTPS endpoint. Set up webhook delivery, authenticate requests, and handle events in your application.",
  path: "/docs/guides/webhooks",
  social: {
    description:
      "Receive real-time SES email events at your HTTPS endpoint. Set up webhook delivery, authenticate requests, and handle events.",
  },
});

export default function WebhooksPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Webhooks Guide</h2>
        <p>
          Receive real-time SES email events at your HTTPS endpoint. Set up
          webhook delivery, authenticate requests, and handle events.
        </p>
        <h2>Overview</h2>
        <h2>Prerequisites</h2>
        <h2>Setup</h2>
        <h2>Webhook Payload</h2>
        <h2>Authenticating Requests</h2>
        <h2>Example: Express.js Handler</h2>
        <h2>Example: Next.js Route Handler</h2>
        <h2>Managing Your Webhook</h2>
        <h2>Troubleshooting</h2>
      </article>
      <WebhooksPageContent />
    </>
  );
}
