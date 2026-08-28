import type { Metadata } from "next";
import SdkPageContent from "./page-content";

export const metadata: Metadata = {
  title: "TypeScript SDK for Amazon SES",
  description:
    "TypeScript SDKs for email, SMS, and workflow automation. Templates as code, automations as code, custom events that trigger workflows.",
  openGraph: {
    title: "SDK | Wraps",
    description:
      "TypeScript SDKs for email, SMS, and workflow automation. Templates as code, automations as code, custom events that trigger workflows.",
  },
  twitter: {
    title: "SDK | Wraps",
    description:
      "TypeScript SDKs for email, SMS, and workflow automation. Templates as code, automations as code, custom events that trigger workflows.",
  },
  alternates: {
    canonical: "https://wraps.dev/sdk",
  },
};

export default function SdkPage() {
  return <SdkPageContent />;
}
