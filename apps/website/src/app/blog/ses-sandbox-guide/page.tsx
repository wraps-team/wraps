import type { Metadata } from "next";
import Script from "next/script";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Badge } from "@/components/ui/badge";
import SandboxGuideContent from "./page-content";

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Do I need a live app before requesting AWS SES production access?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Not necessarily, but your website needs to clearly show what your business does. A landing page with your value proposition, contact info, and privacy policy is sufficient. What matters is that reviewers can verify you're a real business.",
      },
    },
    {
      "@type": "Question",
      name: "Will a brand new domain cause my SES production request to be denied?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "New domains face more scrutiny but aren't automatically denied. Make your request extra detailed, ensure all DNS records are properly configured, and consider waiting a few weeks for the domain to age before requesting.",
      },
    },
    {
      "@type": "Question",
      name: "Can I request AWS SES production access for multiple accounts?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, but each account needs its own request. If you're using AWS Organizations, submit from the account that will actually send emails. Requests from accounts with no other AWS usage face more scrutiny.",
      },
    },
    {
      "@type": "Question",
      name: "How long until my AWS SES sending limits automatically increase?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AWS monitors your sending reputation and automatically increases quotas over time. This typically happens within a few weeks of consistent, high-quality sending. Maintain bounce rates below 2% and complaint rates below 0.1%.",
      },
    },
    {
      "@type": "Question",
      name: "Should I use AWS SES or a third-party email provider?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "SES is significantly cheaper at scale ($0.10/1000 emails) but requires more setup and management. If you want hands-off deliverability with dedicated IPs and better support, consider SendGrid, Postmark, or Mailgun. If you're comfortable with AWS and want to minimize costs, SES is excellent.",
      },
    },
  ],
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "How to Get Out of AWS SES Sandbox",
  description:
    "The complete guide to SES production access approval. Interactive checklists, request templates, and everything you need to escape the sandbox on your first try.",
  image: "https://wraps.dev/blog/get-out-of-sandbox.webp",
  datePublished: "2026-01-10T00:00:00.000Z",
  dateModified: "2026-01-10T00:00:00.000Z",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
    description:
      "Email infrastructure experts building tools to deploy production-ready email systems to AWS. Specialists in email deliverability, authentication (SPF, DKIM, DMARC), and AWS SES.",
    sameAs: ["https://github.com/wraps-team", "https://twitter.com/wrapsdev"],
  },
  publisher: {
    "@type": "Organization",
    name: "Wraps",
    logo: {
      "@type": "ImageObject",
      url: "https://wraps.dev/logo.png",
    },
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://wraps.dev/blog/ses-sandbox-guide",
  },
};

export const metadata: Metadata = {
  title: "How to Get Out of AWS SES Sandbox",
  description:
    "The complete guide to SES production access approval. Interactive checklists, request templates, and everything you need to escape the sandbox on your first try.",
  openGraph: {
    title: "How to Get Out of AWS SES Sandbox | Wraps",
    description:
      "The complete guide to SES production access approval. Interactive checklists, request templates, and everything you need to escape the sandbox on your first try.",
    type: "article",
    url: "https://wraps.dev/blog/ses-sandbox-guide",
    images: [
      {
        url: "https://wraps.dev/blog/get-out-of-sandbox.webp",
        width: 800,
        height: 421,
        alt: "How to Get Out of AWS SES Sandbox",
      },
    ],
    publishedTime: "2026-01-10T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "How to Get Out of AWS SES Sandbox | Wraps",
    description:
      "The complete guide to SES production access approval. Checklists, templates, and everything you need.",
    images: ["https://wraps.dev/blog/get-out-of-sandbox.webp"],
  },
  alternates: {
    canonical: "https://wraps.dev/blog/ses-sandbox-guide",
  },
};

export default function Page() {
  return (
    <>
      <Script id="article-schema" type="application/ld+json">
        {JSON.stringify(articleSchema)}
      </Script>
      <Script id="faq-schema" type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </Script>
      <div className="min-h-screen bg-background">
        <LandingNavbar />

        {/* Hero Section - Server Rendered */}
        <header className="relative overflow-hidden border-b pb-16 pt-24">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="container relative mx-auto px-4">
            <Badge className="mb-4" variant="outline">
              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
              Updated January 2026
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              How to Get Out of{" "}
              <span className="text-primary">AWS SES Sandbox</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              The complete guide to production access approval. Interactive
              checklists, request templates, and everything you need to escape
              the sandbox on your first try.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span>10 min read</span>
              <span>&bull;</span>
              <span>Wraps Team</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-8">
              <div>
                <div className="font-mono text-2xl text-primary">Common</div>
                <div className="text-muted-foreground text-sm">
                  First-time denials
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl text-primary">24h</div>
                <div className="text-muted-foreground text-sm">
                  Typical response time
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl text-primary">~1000</div>
                <div className="text-muted-foreground text-sm">
                  Words recommended
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Interactive Content - Client Rendered */}
        <SandboxGuideContent />

        <LandingFooter />
      </div>
    </>
  );
}
