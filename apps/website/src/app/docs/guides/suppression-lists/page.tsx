import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import SuppressionListsPageContent from "./page-content";

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
      item: "https://wraps.dev/docs/guides/suppression-lists",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Suppression Lists",
      item: "https://wraps.dev/docs/guides/suppression-lists",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Suppression Lists",
  description:
    "Manage the AWS SES account-level suppression list with the Wraps SDK: check, add, remove, and list suppressed addresses, filter campaigns before sending, and know when removing an address is safe.",
  path: "/docs/guides/suppression-lists",
  type: "article",
  social: {
    description:
      "The SES account-level suppression list and your application's own list are two independent things. Here is how to keep them in sync.",
  },
});

export default function SuppressionListsPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h2>Suppression Lists</h2>
        <p>
          The AWS SES account-level suppression list holds addresses SES refuses
          to deliver to. It has two reason codes: BOUNCE and COMPLAINT. It is
          separate from your application's own unsubscribe list.
        </p>
        <h3>Managing the SES list</h3>
        <p>
          Use email.suppression.get, email.suppression.add,
          email.suppression.remove, and email.suppression.list from the
          @wraps.dev/email SDK.
        </p>
        <h3>Filtering before a campaign</h3>
        <h3>When to remove an address</h3>
        <p>
          BOUNCE suppressions can be removed after the user re-confirms the
          address. COMPLAINT suppressions should not be removed.
        </p>
      </article>
      <SuppressionListsPageContent />
    </>
  );
}
