import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { getTier } from "@/config/pricing";
import { pageMetadata } from "@/lib/page-metadata";
import { FoundersPageContent } from "./page-content";

const description =
  "An email platform for founders on your own AWS account. Newsletters, automations and app emails in one tool, with a flat Wraps fee and unlimited contacts on every plan. Amazon bills sending to you directly.";

const free = getTier("free");
const pro = getTier("pro");
const business = getTier("business");

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps for Founders",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: [free, pro, business].map((tier) => ({
    "@type": "Offer",
    name: tier.name,
    price: String(tier.price),
    priceCurrency: "USD",
  })),
  description,
  url: "https://wraps.dev/for/founders",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
};

export const metadata: Metadata = pageMetadata({
  title: "Email platform for founders: a flat fee, no per-contact bill",
  description,
  path: "/for/founders",
});

export default function ForFoundersPage() {
  return (
    <>
      <JsonLd data={softwareSchema} />
      <FoundersPageContent />
    </>
  );
}
