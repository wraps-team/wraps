import type { Metadata } from "next";
import Script from "next/script";
import { CliTabbedSection } from "./landing/components/cli-tabbed-section";
import { CTASection } from "./landing/components/cta-section";
import { DualPathSection } from "./landing/components/dual-path-section";
import { FaqSection } from "./landing/components/faq-section";
import { LandingFooter } from "./landing/components/footer";
import { HeroSection } from "./landing/components/hero-section";
import { InfrastructureSection } from "./landing/components/infrastructure-section";
import { LandingNavbar } from "./landing/components/navbar";
import { PricingSection } from "./landing/components/pricing-section";
import { PrinciplesSection } from "./landing/components/principles-section";

export const metadata: Metadata = {
  alternates: {
    canonical: "https://wraps.dev",
  },
};

// FAQ structured data for rich results
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Why is email SaaS so expensive?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Email providers like Postmark, Mailgun, and others charge $2-4+ per 1,000 emails because they're running infrastructure for you. AWS SES charges $0.10/1K because you're running it yourself. Wraps bridges this gap—you get AWS pricing with modern DX.",
      },
    },
    {
      "@type": "Question",
      name: "Why is AWS SES so hard to set up?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "SES requires configuring IAM roles, EventBridge rules, DynamoDB tables, Lambda functions, and SQS queues for proper email tracking. That's 2+ hours of clicking through the AWS Console. Wraps does this in one command.",
      },
    },
    {
      "@type": "Question",
      name: "How is this different from using AWS SES directly?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Wraps deploys all the infrastructure AWS SES needs (IAM roles, EventBridge, DynamoDB, Lambda, SQS) in one command instead of 2+ hours of manual setup. You get event tracking, analytics, and a dashboard out of the box. The TypeScript SDK is just wraps.emails.send() - no boilerplate.",
      },
    },
    {
      "@type": "Question",
      name: "What are the costs for running Wraps?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "With Wraps, you pay AWS directly at $0.10 per 1,000 emails with no markup. For example, 50,000 emails/month costs ~$5 to AWS. There's a free tier with 5,000 tracked events/month included. Paid plans start at $19/month.",
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
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        id="faq-schema"
        type="application/ld+json"
      />
      <div className="min-h-screen bg-background">
        {/* Navigation */}
        <LandingNavbar />

        {/* Main Content */}
        <main>
          {/* 1. Hero & Feature Cards */}
          <HeroSection />
          <PrinciplesSection />

          {/* 2. Two paths — code & AI side by side */}
          <DualPathSection />

          {/* 4. CLI deploy demo */}
          <CliTabbedSection />

          {/* 5. AWS ownership */}
          <InfrastructureSection />

          {/* 6. Pricing */}
          <PricingSection />

          {/* 7. FAQ & CTA */}
          <FaqSection />
          <CTASection />
        </main>

        {/* Footer */}
        <LandingFooter />
      </div>
    </>
  );
}
