import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { SmsPageContent } from "./page-content";

export const metadata: Metadata = pageMetadata({
  title: "SMS Infrastructure",
  description:
    "Deploy SMS infrastructure into your own AWS account. Toll-free numbers, opt-out handling and delivery reporting, with a TypeScript SDK. AWS bills you directly.",
  path: "/sms",
});

export default function SmsPage() {
  return <SmsPageContent />;
}
