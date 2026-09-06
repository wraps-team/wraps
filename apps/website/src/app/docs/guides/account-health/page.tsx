import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import AccountHealthPageContent from "./page-content";

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
      item: "https://wraps.dev/docs/guides/account-health",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Account Health API",
      item: "https://wraps.dev/docs/guides/account-health",
    },
  ],
};

const DESCRIPTION =
  "GET /v1/account/health: query the SES health verdict Wraps already computes every hour, so an agent or CI job can ask 'am I safe to send right now?' before it sends. Zero AWS calls, bounded by the last hourly sweep.";

export const metadata: Metadata = {
  title: "Account Health API",
  description: DESCRIPTION,
  openGraph: {
    title: "Account Health API | Wraps",
    description: DESCRIPTION,
    type: "article",
    url: "https://wraps.dev/docs/guides/account-health",
  },
  twitter: {
    title: "Account Health API | Wraps",
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://wraps.dev/docs/guides/account-health",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h1>Account Health API</h1>
        <p>{DESCRIPTION}</p>
        <h2>Why this endpoint exists</h2>
        <h2>GET /v1/account/health</h2>
        <h2>GET /v1/account/health/:awsAccountId</h2>
        <h2>Reading the status field</h2>
        <h2>Why unknown is not healthy</h2>
        <h2>Thresholds and headroom</h2>
        <h2>Freshness: checkedAt</h2>
      </article>
      <AccountHealthPageContent />
    </>
  );
}
