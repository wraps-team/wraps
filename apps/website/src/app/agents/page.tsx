import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import { AgentsPromptSection } from "./components/agent-prompt-section";
import { AgentsCtaSection } from "./components/cta-section";
import { AgentsHeroSection } from "./components/hero-section";
import { AgentsLeashSection } from "./components/leash-section";
import { AgentsRecipeSection } from "./components/recipe-section";
import { AgentsTrustSection } from "./components/trust-section";
import { AgentsWhyOwnSection } from "./components/why-own-section";

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps for Agents",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Linux, Windows",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "Agent mailboxes: give every AI agent its own email address, with send caps, a recipient allowlist, an approval queue, and a kill switch enforced in your own AWS account. No stored credentials, no Wraps lock-in.",
  url: "https://wraps.dev/agents",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
  license: "https://opensource.org/licenses/AGPL-3.0",
  programmingLanguage: "TypeScript",
};

export const metadata: Metadata = pageMetadata({
  title: "Give your agent an email address, with a leash",
  description:
    "An agent with a raw API key can email anyone, at any volume. A Wraps agent gets its own address, send caps, an allowlist, an approval queue, and a kill switch, enforced in your AWS account.",
  path: "/agents",
  image: {
    url: "/agents-og.png",
    width: 1200,
    height: 630,
    type: "image/png",
    alt: "Wraps agent mailboxes — an email address for your agent, with a leash",
  },
  social: {
    title: "Give your agent an email address. Keep the leash.",
    titleSuffix: null,
  },
});

export default function AgentsPage() {
  return (
    <>
      <JsonLd data={softwareSchema} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />
        <main>
          <AgentsHeroSection />
          <AgentsLeashSection />
          <AgentsPromptSection />
          <AgentsWhyOwnSection />
          <AgentsRecipeSection />
          <AgentsTrustSection />
          <AgentsCtaSection />
        </main>
        <LandingFooter />
      </div>
    </>
  );
}
