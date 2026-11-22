import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import PermissionsPageContent from "./page-content";

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
      name: "AWS Setup",
      item: "https://wraps.dev/docs/guides/aws-setup",
    },
    {
      "@type": "ListItem",
      position: 4,
      name: "IAM Permissions",
      item: "https://wraps.dev/docs/guides/aws-setup/permissions",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "IAM Permissions",
  description:
    "Required AWS IAM permissions for deploying Wraps infrastructure.",
  path: "/docs/guides/aws-setup/permissions",
});

export default function PermissionsPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>IAM Permissions</h2>
        <p>Required AWS IAM permissions for deploying Wraps infrastructure.</p>
      </article>
      <PermissionsPageContent />
    </>
  );
}
