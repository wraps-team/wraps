import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { getTier } from "@/config/pricing";
import { pageMetadata } from "@/lib/page-metadata";
import DashboardPageContent from "./page-content";

const description =
  "Templates written with AI, newsletters, automations and delivery reports in one dashboard. Sending runs in your own AWS account.";

const schemaDescription =
  "Templates written with AI, newsletters, automations, contacts and delivery reports in one dashboard. Sending runs through Amazon in your own AWS account, and Amazon bills you directly.";

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps Platform",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: String(getTier("pro").price),
    priceCurrency: "USD",
  },
  description: schemaDescription,
  url: "https://wraps.dev/platform",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
};

export const metadata: Metadata = pageMetadata({
  title: "Email platform on your own AWS",
  description,
  path: "/platform",
  image: {
    url: "/wraps-platform-og.webp",
    width: 1424,
    height: 752,
    alt: "Wraps Platform - templates, newsletters, automations and reports",
  },
  social: { title: "Everything your team needs to send email" },
});

export default function DashboardPage() {
  return (
    <>
      <JsonLd data={softwareSchema} />
      <DashboardPageContent />
    </>
  );
}
