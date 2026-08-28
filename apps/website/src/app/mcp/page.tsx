import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { McpCtaSection } from "./components/cta-section";
import { McpGuardrailsSection } from "./components/guardrails-section";
import { McpHeroSection } from "./components/hero-section";
import { McpSetupSection } from "./components/setup-section";
import { McpToolsSection } from "./components/tools-section";

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps MCP Server",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Linux, Windows",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "MCP server for AWS SES email infrastructure. Query send history, delivery events, domain status, and suppressions — and send email with guardrails — from Claude Code, Claude Desktop, Cursor, or any MCP client. Runs locally; your AWS credentials never leave your machine.",
  url: "https://wraps.dev/mcp",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
  license: "https://opensource.org/licenses/MIT",
  programmingLanguage: "TypeScript",
};

export const metadata: Metadata = {
  title: "MCP server for Amazon SES email | Wraps",
  description:
    "Give your AI agent read access to your email infrastructure — send history, delivery events, domain status, suppressions — and guarded sending. npx -y @wraps.dev/mcp.",
  openGraph: {
    title: "MCP server for Amazon SES email | Wraps",
    description:
      "Give your AI agent read access to your email infrastructure — send history, delivery events, domain status, suppressions — and guarded sending. Runs locally against your AWS account.",
    type: "website",
    url: "https://wraps.dev/mcp",
  },
  twitter: {
    title: "MCP server for Amazon SES email | Wraps",
    description:
      "Six MCP tools over the AWS SES stack in your account — seven in enforced mode. Read by default, sending behind explicit guardrails.",
  },
  alternates: {
    canonical: "https://wraps.dev/mcp",
  },
};

export default function McpPage() {
  return (
    <>
      <JsonLd data={softwareSchema} />
      <div className="min-h-screen bg-background">
        <LandingNavbar />
        <main>
          <McpHeroSection />
          <McpToolsSection />
          <McpSetupSection />
          <McpGuardrailsSection />
          <McpCtaSection />
        </main>
        <LandingFooter />
      </div>
    </>
  );
}
