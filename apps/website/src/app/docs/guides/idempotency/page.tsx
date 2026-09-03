import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import IdempotencyPageContent from "./page-content";

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
      item: "https://wraps.dev/docs/guides/idempotency",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Duplicate Sends",
      item: "https://wraps.dev/docs/guides/idempotency",
    },
  ],
};

const DESCRIPTION =
  "Sending email from a queue or background worker without delivering it twice. Why at-least-once delivery guarantees duplicates, how to build a dedupe key that survives a Lambda retry, and what Wraps does and does not do for you.";

export const metadata: Metadata = {
  title: "Preventing Duplicate Sends",
  description: DESCRIPTION,
  openGraph: {
    title: "Preventing Duplicate Sends | Wraps",
    description:
      "SQS is at-least-once. Your worker will send the same email twice unless you stop it. Here is where to put the dedupe.",
    type: "article",
    url: "https://wraps.dev/docs/guides/idempotency",
  },
  twitter: {
    title: "Preventing Duplicate Sends | Wraps",
    description:
      "SQS is at-least-once. Your worker will send the same email twice unless you stop it. Here is where to put the dedupe.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs/guides/idempotency",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <IdempotencyPageContent />
    </>
  );
}
