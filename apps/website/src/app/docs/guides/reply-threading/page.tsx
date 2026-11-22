import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import ReplyThreadingPageContent from "./page-content";

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
      name: "Reply Threading",
      item: "https://wraps.dev/docs/guides/reply-threading",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Reply Threading Guide",
  description:
    "Thread inbound replies to the original conversation using HMAC-signed reply-to addresses. Verified conversationId, per-domain secrets, and auto-reply detection on email.received events.",
  path: "/docs/guides/reply-threading",
  social: {
    description:
      "HMAC-signed reply-to addresses give you a verified conversationId on inbound replies. Per-domain secrets in your AWS account; Wraps never sees them.",
    twitterCopy: {
      description:
        "HMAC-signed reply-to addresses for verified conversation threading on inbound email events.",
    },
  },
});

export default function ReplyThreadingPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Reply Threading Guide</h2>
        <p>
          Thread inbound replies to the original conversation using HMAC-signed
          reply-to addresses. Verified conversationId, per-domain secrets, and
          auto-reply detection on email.received events.
        </p>
        <h2>Overview</h2>
        <h2>Trust Model</h2>
        <h2>Enable Per Domain</h2>
        <h2>Signing From the SDK</h2>
        <h2>Event Shape</h2>
        <h2>Status Values</h2>
        <h2>Filter Pattern</h2>
        <h2>Auto-Reply Detection</h2>
        <h2>Rotation</h2>
        <h2>Debugging</h2>
        <h2>Status Command</h2>
        <h2>Longer-Lived Tokens</h2>
        <h2>Security</h2>
        <h2>Replay Defense</h2>
      </article>
      <ReplyThreadingPageContent />
    </>
  );
}
