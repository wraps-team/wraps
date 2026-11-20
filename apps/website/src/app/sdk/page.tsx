import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import SdkPageContent from "./page-content";

export const metadata: Metadata = pageMetadata({
  title: "TypeScript SDK for Amazon SES",
  description:
    "TypeScript SDKs for email, SMS, and workflow automation. Templates as code, automations as code, custom events that trigger workflows.",
  path: "/sdk",
  social: { title: "SDK" },
});

export default function SdkPage() {
  return <SdkPageContent />;
}
