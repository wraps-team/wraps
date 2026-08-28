import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { OperatorsConsentSection } from "./components/consent-section";
import { OperatorsCtaSection } from "./components/cta-section";
import { OperatorsExclusionSection } from "./components/exclusion-section";
import { OperatorsHeroSection } from "./components/hero-section";
import { OperatorsOwnershipSection } from "./components/ownership-section";
import { OperatorsPaperTrailSection } from "./components/paper-trail-section";
import { OperatorsPreflightSection } from "./components/preflight-section";

const description =
  "For the person accountable for the send. Preflight every broadcast, hold consent as a record with double opt-in and a hosted preference center, and trace any single message end to end — sending through your own Amazon SES.";

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
  license: "https://opensource.org/licenses/AGPL-3.0",
};

export const metadata: Metadata = {
  // The root layout applies a "%s | Wraps" template — do not repeat the suffix.
  title: "Email operations: consent, deliverability, and a paper trail",
  description,
  openGraph: {
    title: "Your name is on the send. So is the paper trail.",
    description,
    url: "https://wraps.dev/for/operators",
  },
  twitter: {
    title: "Your name is on the send. So is the paper trail.",
    description,
  },
  alternates: {
    canonical: "https://wraps.dev/for/operators",
  },
};

export default function ForOperatorsPage() {
  return (
    <>
      <JsonLd data={softwareSchema} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />
        <main>
          <OperatorsHeroSection />
          <OperatorsPreflightSection />
          <OperatorsConsentSection />
          <OperatorsExclusionSection />
          <OperatorsPaperTrailSection />
          <OperatorsOwnershipSection />
          <OperatorsCtaSection />
        </main>
        <LandingFooter />
      </div>
    </>
  );
}
