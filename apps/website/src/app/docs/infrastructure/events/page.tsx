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
      name: "EventBridge Events",
      item: "https://wraps.dev/docs/infrastructure/events",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "EventBridge Events",
  description:
    "Every email event flows through your AWS account's EventBridge bus. Learn what events are available, their payloads, and how to create custom rules for alerts, analytics, and workflows.",
  path: "/docs/infrastructure/events",
  social: {
    description:
      "Every email event flows through your AWS account's EventBridge bus. Create custom rules for alerts, analytics, and workflows.",
  },
});

export default function InfrastructureEventsPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>EventBridge Events</h2>
        <p>
          Every email event flows through your AWS account's EventBridge bus.
          Create custom rules for alerts, analytics, and workflows.
        </p>
        <h2>How It Works</h2>
        <h2>What Wraps Handles Automatically</h2>
        <h2>Event Types Reference</h2>
        <h2>Bounce and Complaint Reference</h2>
        <h2>Creating Custom Rules</h2>
        <h2>Common Use Cases</h2>
        <h2>Quotas and Limits</h2>
      </article>
      <PageContent />
    </>
  );
}
