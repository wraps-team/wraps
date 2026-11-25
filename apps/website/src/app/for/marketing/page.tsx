import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { getTier } from "@/config/pricing";
import { pageMetadata } from "@/lib/page-metadata";
import { MarketingAudienceSection } from "./components/audience-section";
import { MarketingCampaignsSection } from "./components/campaigns-section";
import { MarketingCtaSection } from "./components/cta-section";
import { MarketingHeroSection } from "./components/hero-section";
import { MarketingHonestSection } from "./components/honest-section";
import { MarketingMeasurementSection } from "./components/measurement-section";

const description =
  "Broadcasts, segments, topics, and a hosted preference center — the lifecycle toolkit, priced flat by plan, not by contacts stored. Unlimited contacts on every plan, starting at $29 a month.";

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
  description,
  url: "https://wraps.dev/for/marketing",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
  license: "https://opensource.org/licenses/AGPL-3.0",
};

export const metadata: Metadata = pageMetadata({
  title: "Email marketing with unlimited contacts on every plan",
  description,
  path: "/for/marketing",
  social: {
    title: "Grow the list. Pay nothing per contact.",
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
          <MarketingCampaignsSection />
          <MarketingAudienceSection />
          <MarketingMeasurementSection />
          <MarketingHonestSection />
          <MarketingCtaSection />
        </main>
        <LandingFooter />
      </div>
    </>
  );
}
