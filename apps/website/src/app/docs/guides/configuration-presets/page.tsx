import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import PageContent from "./page-content";

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
      name: "Configuration Presets",
      item: "https://wraps.dev/docs/guides/configuration-presets",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Configuration Presets",
  description:
    "Understanding Wraps email configuration presets — features, costs, and how to choose the right one.",
  path: "/docs/guides/configuration-presets",
});

export default function ConfigurationPresetsPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>Configuration Presets</h2>
        <p>
          Understanding Wraps email configuration presets — features, costs, and
          how to choose the right one.
        </p>
        <h2>Overview</h2>
        <h2>Preset Comparison</h2>
        <h2>Starter Preset</h2>
        <h2>Production Preset</h2>
        <h2>Enterprise Preset</h2>
        <h2>Cost by Volume</h2>
        <h2>Upgrading Between Presets</h2>
      </article>
      <PageContent />
    </>
  );
}
