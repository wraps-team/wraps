import type { Metadata } from "next";
import Script from "next/script";
import CLIReferenceAuthPageContent from "./page-content";

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
      name: "Auth",
      item: "https://wraps.dev/docs/cli-reference/auth",
    },
  ],
};

export const metadata: Metadata = {
  title: "Auth CLI Commands",
  description:
    "Authenticate with the Wraps Platform for dashboard access, templates, and workflows.",
  openGraph: {
    title: "Auth CLI Commands | Wraps",
    description:
      "Authenticate with the Wraps Platform for dashboard access, templates, and workflows.",
    type: "website",
    url: "https://wraps.dev/docs/cli-reference/auth",
  },
  twitter: {
    title: "Auth CLI Commands | Wraps",
    description:
      "Authenticate with the Wraps Platform for dashboard access, templates, and workflows.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs/cli-reference/auth",
  },
};

export default function CLIReferenceAuthPage() {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        id="breadcrumb-schema"
        type="application/ld+json"
      />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Auth CLI Commands</h2>
        <p>
          Authenticate with the Wraps Platform for dashboard access, templates,
          and workflows.
        </p>
        <h2>wraps auth login</h2>
        <h2>wraps auth status</h2>
        <h2>wraps auth logout</h2>
      </article>
      <CLIReferenceAuthPageContent />
    </>
  );
}
