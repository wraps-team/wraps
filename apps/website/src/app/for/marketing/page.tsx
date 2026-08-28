import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { MarketingAudienceSection } from "./components/audience-section";
import { MarketingCampaignsSection } from "./components/campaigns-section";
import { MarketingCtaSection } from "./components/cta-section";
import { MarketingHeroSection } from "./components/hero-section";
import { MarketingHonestSection } from "./components/honest-section";
import { MarketingMeasurementSection } from "./components/measurement-section";

const description =
  "Broadcasts, segments, topics, and a hosted preference center — the lifecycle toolkit, priced on tracked events instead of contacts stored. Unlimited contacts on every plan, starting at $19 a month.";

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps for Marketing",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "19",
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

export const metadata: Metadata = {
  // The root layout applies a "%s | Wraps" template — do not repeat the suffix.
  title: "Email marketing with unlimited contacts on every plan",
  description,
  openGraph: {
    title: "Grow the list. Watch the bill stay put.",
    description,
    url: "https://wraps.dev/for/marketing",
  },
  twitter: {
    title: "Grow the list. Watch the bill stay put.",
    description,
  },
  alternates: {
    canonical: "https://wraps.dev/for/marketing",
  },
};

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
