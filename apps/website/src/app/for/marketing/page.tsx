import type { Metadata } from "next";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { TrackedCtaPair } from "@/components/tracked-cta-pair";
import { getTier } from "@/config/pricing";
import { pageMetadata } from "@/lib/page-metadata";
import { MarketingBeforeYouSwitchSection } from "./components/before-you-switch-section";
import { MarketingHeroSection } from "./components/hero-section";
import { MarketingNewslettersSection } from "./components/newsletters-section";
import { MarketingReportingSection } from "./components/reporting-section";
import { MarketingSegmentsTopicsSection } from "./components/segments-topics-section";

const description =
  "Newsletters, segments and topics with unlimited contacts on every plan. Your Wraps fee never grows with your list. Amazon bills sending separately.";

const schemaDescription = `Newsletters, segments, topics and a hosted preference center for marketing teams. Unlimited contacts on every plan, so your Wraps fee never grows with your list. Pro is $${getTier("pro").price} a month; Amazon bills sending separately.`;

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps for Marketing",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: String(getTier("pro").price),
    priceCurrency: "USD",
  },
  description: schemaDescription,
  url: "https://wraps.dev/for/marketing",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
};

export const metadata: Metadata = pageMetadata({
  title: "Email marketing with unlimited contacts",
  description,
  path: "/for/marketing",
  social: {
    title: "Grow your list without paying per contact.",
    titleSuffix: null,
  },
});

export default function ForMarketingPage() {
  return (
    <>
      <JsonLd data={softwareSchema} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />
        <main>
          <MarketingHeroSection />
          <MarketingNewslettersSection />
          <MarketingSegmentsTopicsSection />
          <MarketingReportingSection />
          <MarketingBeforeYouSwitchSection />
          <ClosingPanel
            actions={
              <TrackedCtaPair
                location="for_marketing_cta"
                secondary={{
                  label: "Estimate your sending cost",
                  href: "/tools/ses-calculator",
                }}
              />
            }
            body={`Newsletters to all contacts are included on every plan. Segments, topics and scheduling start at $${getTier("pro").price} a month. AWS bills each email you send, at its own rates.`}
            title="Unlimited contacts. Even on the free plan."
          />
        </main>
        <LandingFooter />
      </div>
    </>
  );
}
