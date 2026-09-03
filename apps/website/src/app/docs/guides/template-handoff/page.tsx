import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import TemplateHandoffPageContent from "./page-content";

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
      item: "https://wraps.dev/docs/guides/template-handoff",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Sharing Templates With Marketing",
      item: "https://wraps.dev/docs/guides/template-handoff",
    },
  ],
};

const DESCRIPTION =
  "Sharing email template management between engineers and a non-technical marketing team: who edits what, how the CLI and dashboard detect each other's changes, and what happens when both sides edit the same template.";

export const metadata: Metadata = {
  title: "Sharing Templates With Marketing",
  description: DESCRIPTION,
  openGraph: {
    title: "Sharing Templates With Marketing | Wraps",
    description:
      "Engineers own the template in git, marketing edits copy in the dashboard. Here is where the two meet and what happens when they collide.",
    type: "article",
    url: "https://wraps.dev/docs/guides/template-handoff",
  },
  twitter: {
    title: "Sharing Templates With Marketing | Wraps",
    description:
      "Engineers own the template in git, marketing edits copy in the dashboard. Here is where the two meet and what happens when they collide.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs/guides/template-handoff",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <TemplateHandoffPageContent />
    </>
  );
}
