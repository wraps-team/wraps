import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import BetterAuthPageContent from "./page-content";

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
      name: "Better Auth",
      item: "https://wraps.dev/docs/guides/better-auth",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Better Auth",
  description:
    "One plugin block sends every Better Auth auth email through SES in your own AWS account: verification, password reset, magic link, OTP, and organization invites. No Wraps account needed.",
  path: "/docs/guides/better-auth",
  social: {
    description:
      "One plugin block sends every Better Auth auth email through SES in your own AWS account, with @wraps.dev/better-auth.",
    twitterCopy: {
      description:
        "Send Better Auth verification, password reset, magic link, and OTP emails through SES in your own AWS account.",
    },
  },
});

export default function BetterAuthPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      {/* Server-rendered content for SEO */}
      <article aria-hidden="true" className="sr-only">
        <h1>Better Auth</h1>
        <p>
          The @wraps.dev/better-auth plugin sends every auth email Better Auth
          leaves to you through SES in your own AWS account, from one plugin
          block: verification, password reset, password changed, magic link,
          OTP, and organization invites. Sending runs on your AWS credentials
          alone, so no Wraps account is required.
        </p>
        <h2>Prerequisites</h2>
        <h2>Installation</h2>
        <h2>Send the Verification Email</h2>
        <h2>The Other Auth Emails</h2>
        <h2>AWS Credentials</h2>
        <h2>Branding and Templates</h2>
        <h2>When a Send Fails</h2>
        <h2>Serverless and waitUntil</h2>
        <h2>Troubleshooting</h2>
        <h2>Sync Signups to Wraps Contacts (Optional)</h2>
        <h2>Options</h2>
        <h2>Next Steps</h2>
      </article>
      <BetterAuthPageContent />
    </>
  );
}
