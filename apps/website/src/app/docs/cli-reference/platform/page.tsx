import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
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

export const metadata: Metadata = pageMetadata({
  title: "Platform CLI Commands",
  description:
    "Connect your AWS infrastructure to the Wraps Platform for dashboards, templates, and workflows.",
  path: "/docs/cli-reference/platform",
});

export default function CLIReferencePlatformPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
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
