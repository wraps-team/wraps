import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import CookbookPageContent from "./page-content";

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
      name: "Cookbook",
      item: "https://wraps.dev/docs/cookbook",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Cookbook",
  description:
    "Copy-pasteable code recipes for common email and SMS patterns using the Wraps TypeScript SDKs. Send emails, handle bounces, manage suppression lists, automate workflows, and more.",
  path: "/docs/cookbook",
  social: {
    description:
      "Copy-pasteable code recipes for common email and SMS patterns using the Wraps TypeScript SDKs.",
  },
});

export default function CookbookPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h2>Cookbook</h2>
        <p>Copy-pasteable code recipes for common patterns.</p>
        <h2>Email</h2>
        <h3>Send a welcome email on signup</h3>
        <h3>Batch send a newsletter</h3>
        <h3>Send with dynamic templates</h3>
        <h3>Handle bounces with webhooks</h3>
        <h3>Track email events</h3>
        <h3>Manage suppression lists</h3>
        <h2>Workflows</h2>
        <h3>Set up a drip campaign</h3>
        <h2>Inbound</h2>
        <h3>Receive and parse inbound email</h3>
        <h2>SMS</h2>
        <h3>Send SMS with opt-out handling</h3>
      </article>
      <CookbookPageContent />
    </>
  );
}
