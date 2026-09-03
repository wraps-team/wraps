import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import ReputationPageContent from "./page-content";

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
      item: "https://wraps.dev/docs/guides/reputation",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Domain Reputation",
      item: "https://wraps.dev/docs/guides/reputation",
    },
  ],
};

const DESCRIPTION =
  "Keeping domain reputation high and complaint rates low on Amazon SES: what actually moves the number, how to watch it per configuration set, and the runbook for the day a rate starts climbing.";

export const metadata: Metadata = {
  title: "Domain Reputation on SES",
  description: DESCRIPTION,
  openGraph: {
    title: "Domain Reputation on SES | Wraps",
    description:
      "Complaint rate is a recipient-quality problem before it is a technical one. What moves it, how to watch it, and what to do when it climbs.",
    type: "article",
    url: "https://wraps.dev/docs/guides/reputation",
  },
  twitter: {
    title: "Domain Reputation on SES | Wraps",
    description:
      "Complaint rate is a recipient-quality problem before it is a technical one. What moves it, how to watch it, and what to do when it climbs.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs/guides/reputation",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <ReputationPageContent />
    </>
  );
}
