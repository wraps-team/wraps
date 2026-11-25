import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { getTier } from "@/config/pricing";
import {
  DEFAULT_OG_IMAGE,
  pageMetadata,
  SITE_DESCRIPTION,
  SITE_TITLE,
} from "@/lib/page-metadata";
import { CTASection } from "./landing/components/cta-section";
import { DevelopersBand } from "./landing/components/developers-band";
import { EconomicsSection } from "./landing/components/economics-section";
import { faqItems } from "./landing/components/faq-items";
import { FaqSection } from "./landing/components/faq-section";
import { LandingFooter } from "./landing/components/footer";
import { GettingStartedSection } from "./landing/components/getting-started-section";
import { HeroSection } from "./landing/components/hero-section";
import { HomeStatsRow } from "./landing/components/home-stats-row";
import { LandingNavbar } from "./landing/components/navbar";
import { OwnershipSection } from "./landing/components/ownership-section";
import { PricingSection } from "./landing/components/pricing-section";
import { ProductSection } from "./landing/components/product-section";
import { TeamSection } from "./landing/components/team-section";
import { WhyOwnSection } from "./landing/components/why-own-section";

export const metadata: Metadata = pageMetadata({
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  absoluteTitle: true,
  image: DEFAULT_OG_IMAGE,
  path: "/",
});

// What an agent needs to answer "can I start with this on my own, today?" —
// a free tier, a real package it can install, and no sales call in the path.
const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Email marketing platform",
  operatingSystem: "macOS, Linux, Windows",
  url: "https://wraps.dev",
  downloadUrl: "https://www.npmjs.com/package/@wraps.dev/cli",
  installUrl: "https://wraps.dev/docs/quickstart/email",
  softwareHelp: "https://wraps.dev/docs",
  license: "https://opensource.org/licenses/AGPL-3.0",
  isAccessibleForFree: true,
  provider: { "@id": "https://wraps.dev/#organization" },
  description:
    "Email marketing without the per-contact tax: newsletters, automations, contacts and app emails in one platform for your whole team. Sending runs in your own AWS account, so every email goes through your Amazon SES account at Amazon's own rates and you pay AWS directly. Unlimited contacts on every plan. CLI, TypeScript SDKs and an MCP server for developers and AI agents.",
  featureList: [
    "Newsletters and broadcasts, with segments and scheduling on Pro",
    "Automations: welcome series and other journeys that run on their own",
    "Unlimited contacts, sends, domains and team members on every plan; Amazon bills the sending",
    "Sending runs in your AWS account; Amazon bills you directly",
    "Connect your AWS account in the browser, or hand setup to your AI agent",
    "One-command deploy of the sending infrastructure (npx @wraps.dev/cli email init); connecting it to the dashboard is a separate step",
    "30-day history on the Free plan",
    "Self-serve, with no sales call on any plan",
  ],
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      url: "https://wraps.dev/#pricing",
      availability: "https://schema.org/InStock",
      description:
        "The Free plan includes unlimited sends (Amazon bills the sending), one AWS account and 30-day history. The CLI and SDKs are free and open source with no account at all.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: String(getTier("pro").price),
      priceCurrency: "USD",
      url: "https://wraps.dev/#pricing",
      availability: "https://schema.org/InStock",
    },
  ],
};

// FAQ structured data for rich results, generated from the same `faqItems` the
// accordion renders, so there is one copy of every answer.
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

export default function LandingPage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      <JsonLd data={softwareSchema} />
      <div className="min-h-screen bg-background">
        {/* Navigation */}
        <LandingNavbar />

        {/* Main Content */}
        <main>
          {/*
            Order follows the design mock's #home view. Sections carry the
            anchors the nav and the hero link to: #how, #setup, #pricing.
          */}
          <HeroSection />
          <HomeStatsRow />
          <ProductSection />
          <EconomicsSection />
          <OwnershipSection />
          <GettingStartedSection />
          <TeamSection />
          <DevelopersBand />
          <WhyOwnSection />
          {/*
            TODO(customer-proof): customer stories go here once real customers
            agree to be named. Render nothing until then, and never invent
            quotes or logos.
          */}
          <PricingSection />
          <FaqSection />
          <CTASection />
        </main>

        {/* Footer */}
        <LandingFooter />
      </div>
    </>
  );
}
