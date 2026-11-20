import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import ByocPageContent from "./page-content";

export const metadata: Metadata = pageMetadata({
  title: "BYOC Email Infrastructure - Amazon SES in Your Own Cloud",
  description:
    "Bring your own cloud email sending. Wraps deploys SES, EventBridge, and DynamoDB into your AWS with one CLI command. Self-serve. No Kubernetes.",
  path: "/byoc",
  social: { title: "BYOC Email Infrastructure" },
});

export default function ByocPage() {
  return <ByocPageContent />;
}
