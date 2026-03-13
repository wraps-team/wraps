import type { Metadata } from "next";
import Script from "next/script";
import CLIReferencePlatformPageContent from "./page-content";

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
      name: "Platform",
      item: "https://wraps.dev/docs/cli-reference/platform",
    },
  ],
};

export const metadata: Metadata = {
  title: "Platform CLI Commands",
  description:
    "Connect your AWS infrastructure to the Wraps Platform for dashboards, templates, and workflows.",
  openGraph: {
    title: "Platform CLI Commands | Wraps",
    description:
      "Connect your AWS infrastructure to the Wraps Platform for dashboards, templates, and workflows.",
    type: "website",
    url: "https://wraps.dev/docs/cli-reference/platform",
  },
  twitter: {
    title: "Platform CLI Commands | Wraps",
    description:
      "Connect your AWS infrastructure to the Wraps Platform for dashboards, templates, and workflows.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs/cli-reference/platform",
  },
};

export default function CLIReferencePlatformPage() {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        id="breadcrumb-schema"
        type="application/ld+json"
      />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Platform CLI Commands</h2>
        <p>
          Connect your AWS infrastructure to the Wraps Platform for dashboards,
          templates, and workflows.
        </p>
        <h2>wraps platform connect</h2>
        <h2>wraps platform update-role</h2>
      </article>
      <CLIReferencePlatformPageContent />
    </>
  );
}
