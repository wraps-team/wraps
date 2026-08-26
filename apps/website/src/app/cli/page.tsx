import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { CliCommandsSection } from "./components/commands-section";
import { CliConsoleSection } from "./components/console-section";
import { CliCtaSection } from "./components/cta-section";
import { CliHeroSection } from "./components/hero-section";
import { CliServicesSection } from "./components/services-section";

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps CLI",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Linux, Windows",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "Free, open-source CLI to deploy email infrastructure to your AWS account. One command deploys everything.",
  url: "https://wraps.dev/cli",
  downloadUrl: "https://www.npmjs.com/package/@wraps.dev/cli",
  // No softwareVersion: it is pinned here and released from npm, so it can
  // only ever be stale. npm carries the authoritative version.
  installUrl: "https://wraps.dev/docs/quickstart/email",
  softwareHelp: "https://wraps.dev/docs/cli-reference",
  isAccessibleForFree: true,
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
  license: "https://opensource.org/licenses/AGPL-3.0",
  programmingLanguage: "TypeScript",
};

export const metadata: Metadata = {
  title: "Wraps CLI - Deploy AWS SES Infrastructure in 2 Minutes",
  description:
    "Free, open-source CLI and SDK to deploy email infrastructure to your AWS account. One command deploys everything.",
  openGraph: {
    title: "CLI & SDK | Wraps",
    description:
      "Free, open-source CLI and SDK to deploy email infrastructure to your AWS account. One command deploys everything.",
    images: [
      {
        url: "/wraps-cli-og.webp",
        width: 1424,
        height: 752,
        alt: "Wraps CLI - Deploy email infrastructure with one command",
      },
    ],
  },
  twitter: {
    title: "CLI & SDK | Wraps",
    description:
      "Free, open-source CLI and SDK to deploy email infrastructure to your AWS account. One command deploys everything.",
    images: ["/wraps-cli-og.webp"],
  },
  alternates: {
    canonical: "https://wraps.dev/cli",
  },
};

export default function CliPage() {
  return (
    <>
      <JsonLd data={softwareSchema} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />
        <main>
          <CliHeroSection />
          <CliServicesSection />
          <CliCommandsSection />
          <CliConsoleSection />
          <CliCtaSection />
        </main>
        <LandingFooter />
      </div>
    </>
  );
}
