import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { ArchitectureByocSection } from "./landing/components/architecture-byoc-section";
import { CodeSampleSection } from "./landing/components/code-sample-section";
import { CompareSection } from "./landing/components/compare-section";
import { CTASection } from "./landing/components/cta-section";
import { FaqSection } from "./landing/components/faq-section";
import { FeatureBlockSection } from "./landing/components/feature-block-section";
import { LandingFooter } from "./landing/components/footer";
import { HeroSection } from "./landing/components/hero-section";
import { LandingNavbar } from "./landing/components/navbar";
import { PricingSection } from "./landing/components/pricing-section";
import { PrinciplesSection } from "./landing/components/principles-section";
import { ProductShowcaseSection } from "./landing/components/product-showcase-section";

export const metadata: Metadata = {
  alternates: {
    canonical: "https://wraps.dev",
  },
};

// What an agent needs to answer "can I start with this on my own, today?" —
// a free tier, a real package it can install, and no sales call in the path.
const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wraps",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Email infrastructure",
  operatingSystem: "macOS, Linux, Windows",
  url: "https://wraps.dev",
  downloadUrl: "https://www.npmjs.com/package/@wraps.dev/cli",
  installUrl: "https://wraps.dev/docs/quickstart/email",
  softwareHelp: "https://wraps.dev/docs",
  license: "https://opensource.org/licenses/AGPL-3.0",
  isAccessibleForFree: true,
  provider: { "@id": "https://wraps.dev/#organization" },
  description:
    "Deploy email (AWS SES), SMS, and CDN infrastructure into your own AWS account with one command. CLI, TypeScript SDKs, MCP server, and a dashboard. You pay AWS directly.",
  featureList: [
    "One-command AWS SES deployment (npx @wraps.dev/cli email init)",
    "TypeScript SDKs for email and SMS",
    "MCP server for AI agents",
    "Free tier with unlimited sends and a 30-day history",
    "Self-serve API keys — no sales call",
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
        "Free forever: unlimited sends, one AWS account, 30-day history. The CLI and SDKs are free and open source with no account at all.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "29",
      priceCurrency: "USD",
      url: "https://wraps.dev/#pricing",
      availability: "https://schema.org/InStock",
    },
  ],
};

// FAQ structured data for rich results
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How is this different from using AWS SES directly?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Wraps deploys all the infrastructure AWS SES needs (IAM roles, EventBridge, DynamoDB, Lambda, SQS) in one command instead of 2+ hours of manual setup. You get event tracking, analytics, and a dashboard out of the box. The TypeScript SDK is just email.send() - no boilerplate.",
      },
    },
    {
      "@type": "Question",
      name: "What are the costs for running Wraps?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "With Wraps, you pay AWS directly with no markup: à la carte SES is $0.10 per 1,000 emails, though AWS now defaults new accounts to the Essentials plan at $0.16 (Wraps tells you which plan you're on and how to move back). For example, 50,000 emails/month costs ~$5-8 to AWS. There's a free tier with unlimited sends and no credit card required. Paid plans start at $29/month.",
      },
    },
    {
      "@type": "Question",
      name: "Do you store my AWS credentials?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No! We use OIDC (OpenID Connect) for Vercel deployments or IAM roles for AWS-native deployments. The CLI uses your local AWS credentials for the initial deployment, then creates IAM roles that your app can assume. We never see or store your AWS access keys.",
      },
    },
    {
      "@type": "Question",
      name: "What happens if I stop paying for Wraps?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your infrastructure keeps running! All resources are in your AWS account. You lose access to the Wraps Platform but can still use the free local console. Your SDK code keeps working, emails keep sending, and you keep paying AWS directly. Zero vendor lock-in.",
      },
    },
    {
      "@type": "Question",
      name: "Can I customize the infrastructure deployment?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! The CLI offers infrastructure presets for different needs—from minimal tracking to full analytics with dedicated IPs. You can also use 'npx @wraps.dev/cli email upgrade' to add features incrementally. For full customization, all infrastructure is deployed as open-source Pulumi code you can fork and modify.",
      },
    },
    {
      "@type": "Question",
      name: "Does this work with my existing SES setup?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! Use 'npx @wraps.dev/cli email connect' to scan your existing SES resources and add Wraps features non-destructively. We never modify existing resources—all our infrastructure uses the 'wraps-email-' prefix.",
      },
    },
    {
      "@type": "Question",
      name: "Can I receive emails too?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! Wraps supports inbound email receiving. Run 'npx @wraps.dev/cli email inbound init' to deploy the infrastructure, then use the SDK to list, read, reply, and forward emails. EventBridge triggers let you build webhooks for real-time processing.",
      },
    },
  ],
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
          <HeroSection />
          <PrinciplesSection />
          <ArchitectureByocSection />
          <FeatureBlockSection />
          <CodeSampleSection />
          <CompareSection />
          <ProductShowcaseSection />
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
