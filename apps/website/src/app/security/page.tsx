import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import { SecurityPageContent } from "./page-content";

const TITLE = "Security at Wraps — the trust boundary, in detail";
const DESCRIPTION =
  "How Wraps accesses your AWS account: a cross-account IAM role with an external ID, short-lived STS credentials, no stored AWS keys, resources namespaced wraps-*. What we store, what stays in your account, and what certifications we do and do not have.";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/security",
});

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://wraps.dev",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Security",
      item: "https://wraps.dev/security",
    },
  ],
};

export default function SecurityPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <SecurityPageContent />
    </>
  );
}
