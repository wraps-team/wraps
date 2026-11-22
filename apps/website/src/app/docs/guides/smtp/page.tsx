import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import SMTPPageContent from "./page-content";

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
      name: "SMTP Credentials",
      item: "https://wraps.dev/docs/guides/smtp",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "SMTP Credentials Guide",
  description:
    "Generate SMTP credentials for your AWS SES infrastructure. Use with WordPress, Nodemailer, PHPMailer, or any SMTP-compatible system.",
  path: "/docs/guides/smtp",
  social: {
    twitterCopy: {
      description:
        "Generate SMTP credentials for AWS SES. Works with WordPress, Nodemailer, PHPMailer, and any SMTP client.",
    },
  },
});

export default function SMTPPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h1>SMTP Credentials Guide</h1>
        <p>
          Generate SMTP credentials for your AWS SES infrastructure. Use with
          WordPress, Nodemailer, PHPMailer, or any SMTP-compatible system.
        </p>
        <h2>When to Use SMTP</h2>
        <h2>Prerequisites</h2>
        <h2>Enable SMTP Credentials</h2>
        <h2>Connection Details</h2>
        <h2>Usage Examples</h2>
        <h2>Rotating Credentials</h2>
        <h2>Next Steps</h2>
      </article>
      <SMTPPageContent />
    </>
  );
}
