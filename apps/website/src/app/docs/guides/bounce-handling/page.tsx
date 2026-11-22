import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import BounceHandlingPageContent from "./page-content";

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
      item: "https://wraps.dev/docs/guides/bounce-handling",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Bounce Handling",
      item: "https://wraps.dev/docs/guides/bounce-handling",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Bounce & Complaint Handling",
  description:
    "Handle AWS SES bounces and complaints correctly: what bounceType and bounceSubType mean, why transient bounces should not suppress, the AWS rate thresholds that pause sending, and how to test with the SES mailbox simulator.",
  path: "/docs/guides/bounce-handling",
  type: "article",
  social: {
    description:
      "What SES bounce and complaint events mean, what to do with each one, and how to test bounce handling before it matters.",
  },
});

export default function BounceHandlingPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h2>Bounce and Complaint Handling</h2>
        <p>
          AWS SES recommends keeping your bounce rate under 5% and your
          complaint rate under 0.1%. Sending may be paused above 10% bounce or
          0.5% complaint.
        </p>
        <h3>Reading a bounce</h3>
        <p>
          Permanent bounces are hard bounces and should stop sending to that
          address. Transient bounces are soft bounces and should not suppress on
          the first occurrence. Undetermined bounces should be treated as
          transient.
        </p>
        <h3>Handling events in your app</h3>
        <h3>Testing with the SES mailbox simulator</h3>
        <p>
          success@simulator.amazonses.com, bounce@simulator.amazonses.com,
          complaint@simulator.amazonses.com,
          suppressionlist@simulator.amazonses.com, and
          ooto@simulator.amazonses.com produce real events without affecting
          reputation metrics.
        </p>
      </article>
      <BounceHandlingPageContent />
    </>
  );
}
