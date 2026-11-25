import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { getTier } from "@/config/pricing";
import { pageMetadata } from "@/lib/page-metadata";
import { InboundPageContent } from "./page-content";

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps Inbound Email",
  applicationCategory: "BusinessApplication",
  operatingSystem: "AWS",
  offers: {
    "@type": "Offer",
    price: String(getTier("free").price),
    priceCurrency: "USD",
  },
  description:
    "Receive email for your domain in your own AWS account. Wraps parses the sender, body and attachments and hands each message to your app or ticketing tool. AWS bills you directly.",
  url: "https://wraps.dev/inbound",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
  programmingLanguage: "TypeScript",
};

export const metadata: Metadata = pageMetadata({
  title: "Inbound Email for Amazon SES: Receive Email in Your AWS Account",
  description:
    "Receive email for your domain in your own AWS account. Parse the sender, body and attachments, and send each message to your app or ticketing tool.",
  path: "/inbound",
  image: {
    url: "/blog/wraps-inbound-og.webp",
    width: 1200,
    height: 630,
    alt: "Wraps Inbound Email - Receive and process emails in your AWS",
  },
  social: {
    title: "Inbound Email",
    description:
      "Turn the email you receive into work: tickets, orders and leads, from your own AWS account.",
  },
});

export default function InboundPage() {
  return (
    <>
      <JsonLd data={softwareSchema} />
      <InboundPageContent />
    </>
  );
}
