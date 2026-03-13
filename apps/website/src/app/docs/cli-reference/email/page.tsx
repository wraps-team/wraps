import type { Metadata } from "next";
import Script from "next/script";
import CLIReferenceEmailPageContent from "./page-content";

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
      name: "Email",
      item: "https://wraps.dev/docs/cli-reference/email",
    },
  ],
};

export const metadata: Metadata = {
  title: "Email CLI Commands",
  description: "CLI commands for managing email infrastructure.",
  openGraph: {
    title: "Email CLI Commands | Wraps",
    description: "CLI commands for managing email infrastructure.",
    type: "website",
    url: "https://wraps.dev/docs/cli-reference/email",
  },
  twitter: {
    title: "Email CLI Commands | Wraps",
    description: "CLI commands for managing email infrastructure.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs/cli-reference/email",
  },
};

export default function CLIReferenceEmailPage() {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        id="breadcrumb-schema"
        type="application/ld+json"
      />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Email CLI Commands</h2>
        <p>CLI commands for managing email infrastructure.</p>
        <h2>wraps email init</h2>
        <h2>wraps email status</h2>
        <h2>wraps email domains</h2>
        <h2>wraps email upgrade</h2>
        <h2>wraps email destroy</h2>
      </article>
      <CLIReferenceEmailPageContent />
    </>
  );
}
