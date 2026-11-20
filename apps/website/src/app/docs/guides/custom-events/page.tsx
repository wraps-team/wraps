import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import CustomEventsPageContent from "./page-content";

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
      name: "Custom Events",
      item: "https://wraps.dev/docs/guides/custom-events",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Custom Events",
  description:
    "Emit custom events from your application to trigger workflows, track user behavior, and resume waiting automation steps using the @wraps.dev/client SDK.",
  path: "/docs/guides/custom-events",
  social: {
    twitterCopy: {
      description:
        "Emit custom events from your application to trigger workflows and track user behavior using the @wraps.dev/client SDK.",
    },
  },
});

export default function CustomEventsPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Custom Events</h2>
        <p>
          Emit custom events from your application to trigger workflows, track
          user behavior, and resume waiting automation steps.
        </p>
        <h2>Overview</h2>
        <h2>Sending an Event</h2>
        <h2>Track Options</h2>
        <h2>Auto-Creating Contacts</h2>
        <h2>Batch Events</h2>
        <h2>Triggering Workflows</h2>
        <h2>Resuming Waiting Steps</h2>
        <h2>Event Limits</h2>
        <h2>Examples</h2>
      </article>
      <CustomEventsPageContent />
    </>
  );
}
