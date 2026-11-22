import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import Context7PageContent from "./page-content";

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
      name: "Context7",
      item: "https://wraps.dev/docs/guides/context7",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "AI-Assisted Development with Context7",
  description:
    "Give your AI coding assistant up-to-date Wraps documentation. Set up Context7 in Cursor, Claude Code, Windsurf, or any MCP-compatible editor to get accurate code suggestions for Wraps CLI, email SDK, and SMS SDK.",
  path: "/docs/guides/context7",
  social: {
    description:
      "Give your AI coding assistant up-to-date Wraps documentation. Set up Context7 to get accurate code suggestions for Wraps.",
  },
});

export default function Context7Page() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h2>AI-Assisted Development with Context7</h2>
        <p>
          Give your AI coding assistant up-to-date Wraps documentation. Set up
          Context7 in Cursor, Claude Code, Windsurf, or any MCP-compatible
          editor.
        </p>
        <h2>Why Context7</h2>
        <h2>Available Libraries</h2>
        <h2>Setup</h2>
        <h2>Using Context7 with Wraps</h2>
        <h2>Library IDs</h2>
        <h2>Tips</h2>
      </article>
      <Context7PageContent />
    </>
  );
}
