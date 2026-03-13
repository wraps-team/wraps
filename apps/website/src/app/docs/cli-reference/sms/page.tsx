import type { Metadata } from "next";
import Script from "next/script";
import CLIReferenceSMSPageContent from "./page-content";

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
      name: "CLI Reference",
      item: "https://wraps.dev/docs/cli-reference",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "SMS",
      item: "https://wraps.dev/docs/cli-reference/sms",
    },
  ],
};

export const metadata: Metadata = {
  title: "SMS CLI Commands",
  description: "CLI commands for managing SMS infrastructure.",
  openGraph: {
    title: "SMS CLI Commands | Wraps",
    description: "CLI commands for managing SMS infrastructure.",
    type: "website",
    url: "https://wraps.dev/docs/cli-reference/sms",
  },
  twitter: {
    title: "SMS CLI Commands | Wraps",
    description: "CLI commands for managing SMS infrastructure.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs/cli-reference/sms",
  },
};

export default function CLIReferenceSMSPage() {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        id="breadcrumb-schema"
        type="application/ld+json"
      />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>SMS CLI Commands</h2>
        <p>CLI commands for managing SMS infrastructure.</p>
        <h2>wraps sms init</h2>
        <h2>wraps sms status</h2>
        <h2>wraps sms destroy</h2>
      </article>
      <CLIReferenceSMSPageContent />
    </>
  );
}
