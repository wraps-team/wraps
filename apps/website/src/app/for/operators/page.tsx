import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import { OperatorsPageContent } from "./page-content";

const description =
  "For the person accountable for the send. Preflight every broadcast, hold consent as a record with double opt-in and a hosted preference center, and trace a single message end to end, sending through your own Amazon SES.";

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps for Email Operations",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description,
  url: "https://wraps.dev/for/operators",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
};

export const metadata: Metadata = pageMetadata({
  title: "Email operations: consent, deliverability, and a paper trail",
  description,
  path: "/for/operators",
  social: {
    title: "Your name is on the send. So is the paper trail.",
    titleSuffix: null,
  },
});

export default function ForOperatorsPage() {
  return (
    <>
      <JsonLd data={softwareSchema} />
      <OperatorsPageContent />
    </>
  );
}
