import type { Metadata } from "next";
import ByocPageContent from "./page-content";

export const metadata: Metadata = {
  title: "BYOC Email Infrastructure - Amazon SES in Your Own Cloud",
  description:
    "Bring your own cloud email sending. Wraps deploys SES, EventBridge, and DynamoDB into your AWS with one CLI command. Self-serve. No Kubernetes.",
  openGraph: {
    title: "BYOC Email Infrastructure | Wraps",
    description:
      "Bring your own cloud email sending. Wraps deploys SES, EventBridge, and DynamoDB into your AWS with one CLI command. Self-serve. No Kubernetes.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "BYOC Email Infrastructure - Wraps",
      },
    ],
  },
  twitter: {
    title: "BYOC Email Infrastructure | Wraps",
    description:
      "Bring your own cloud email sending. Wraps deploys SES, EventBridge, and DynamoDB into your AWS with one CLI command. Self-serve. No Kubernetes.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://wraps.dev/byoc",
  },
};

export default function ByocPage() {
  return <ByocPageContent />;
}
