import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import DocsPageContent from "./page-content";

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
  ],
};

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Get started with Wraps. Deploy production-ready email infrastructure to your AWS account in minutes.",
  openGraph: {
    title: "Documentation | Wraps",
    description:
      "Get started with Wraps. Deploy production-ready email infrastructure to your AWS account in minutes.",
    type: "website",
    url: "https://wraps.dev/docs",
  },
  twitter: {
    title: "Documentation | Wraps",
    description:
      "Get started with Wraps. Deploy production-ready email infrastructure to your AWS account in minutes.",
  },
  alternates: {
    canonical: "https://wraps.dev/docs",
  },
};

export default function DocsPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <nav aria-hidden="true" className="sr-only">
        <h2>Wraps Documentation</h2>
        <p>
          Deploy email, SMS, and CDN infrastructure to your AWS account. You own
          everything — we provide the tooling.
        </p>
        <h3>Build</h3>
        <ul>
          <li>Email SDK - Send email, manage templates, track events</li>
          <li>SMS SDK - Send SMS, manage opt-outs, verify numbers</li>
          <li>Platform SDK - Contacts, broadcasts, workflows, segments</li>
        </ul>
        <h3>Deploy</h3>
        <ul>
          <li>CLI Reference - All commands and flags</li>
          <li>Infrastructure - What gets deployed to your AWS account</li>
          <li>CDK - AWS CDK construct</li>
          <li>Pulumi - Pulumi component</li>
        </ul>
        <h3>Operate</h3>
        <ul>
          <li>Guides - AWS setup, domains, production access</li>
          <li>API Reference - REST API and OpenAPI spec</li>
          <li>Errors - Error codes with solutions</li>
          <li>Environment Variables - CLI, SDK, and CI/CD config</li>
        </ul>
      </nav>
      <DocsPageContent />
    </>
  );
}
