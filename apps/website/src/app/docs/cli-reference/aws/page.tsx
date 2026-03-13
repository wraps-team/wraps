import type { Metadata } from "next";
import Script from "next/script";
import CLIReferenceAWSPageContent from "./page-content";

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
      name: "AWS",
      item: "https://wraps.dev/docs/cli-reference/aws",
    },
  ],
};

export const metadata: Metadata = {
  title: "AWS CLI Commands",
  description:
    "Set up and diagnose your AWS credentials and permissions for Wraps.",
  openGraph: {
    title: "AWS CLI Commands | Wraps",
    description:
      "Set up and diagnose your AWS credentials and permissions for Wraps.",
    type: "website",
    url: "https://wraps.dev/docs/cli-reference/aws",
  },
  twitter: {
    title: "AWS CLI Commands | Wraps",
    description:
      "Set up and diagnose your AWS credentials and permissions for Wraps.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs/cli-reference/aws",
  },
};

export default function CLIReferenceAWSPage() {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        id="breadcrumb-schema"
        type="application/ld+json"
      />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>AWS CLI Commands</h2>
        <p>
          Set up and diagnose your AWS credentials and permissions for Wraps.
        </p>
        <h2>wraps aws setup</h2>
        <h2>wraps aws doctor</h2>
      </article>
      <CLIReferenceAWSPageContent />
    </>
  );
}
