import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import GuidesPageContent from "./page-content";

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
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Guides",
  description:
    "In-depth guides for production access, domain verification, AWS setup, templates, workflows, and configuration presets.",
  path: "/docs/guides",
  social: {
    twitterCopy: {
      description:
        "In-depth guides for production access, domain verification, and AWS setup.",
    },
  },
});

export default function GuidesPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <nav aria-hidden="true" className="sr-only">
        <h2>Wraps Guides</h2>
        <p>
          In-depth guides for production access, domain verification, and AWS
          setup.
        </p>
        <h2>Available Guides</h2>
        <ul>
          <li>AWS Setup - Configure your AWS account for Wraps</li>
          <li>Production Access - Get AWS SES production access approval</li>
          <li>Domain Verification - Set up DKIM, SPF, and DMARC</li>
          <li>
            Configuration Presets - Starter, Production, and Enterprise features
            and costs
          </li>
          <li>Templates as Code - Write email templates as React components</li>
          <li>Building Workflows - Automated email and SMS sequences</li>
          <li>
            Vercel Setup - Deploy with OIDC federation and zero stored
            credentials
          </li>
          <li>Migration Guide - Switch from SendGrid, Postmark, or Resend</li>
        </ul>
      </nav>
      <GuidesPageContent />
    </>
  );
}
