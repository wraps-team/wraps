import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import EmailQuickstartPageContent from "./page-content";

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
      name: "Email",
      item: "https://wraps.dev/docs/quickstart/email",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Email Quickstart",
  description:
    "Deploy AWS SES email infrastructure and send your first email in under 2 minutes. Step-by-step guide with CLI commands and TypeScript SDK examples.",
  path: "/docs/quickstart/email",
  social: {
    twitterCopy: {
      description:
        "Deploy AWS SES email infrastructure and send your first email in under 2 minutes. Step-by-step guide.",
    },
  },
});

export default function EmailQuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Email Quickstart</h2>
        <p>Send your first email with Wraps in under 2 minutes.</p>
        <h2>Before You Start: AWS Credentials Required</h2>
        <p>
          Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables,
          run aws configure, or use aws sso login before running any command.
        </p>
        <h2>Step 1: Deploy Infrastructure</h2>
        <h2>Step 2: Install SDK</h2>
        <h2>Step 3: Send Your First Email</h2>
      </article>
      <EmailQuickstartPageContent />
    </>
  );
}
