import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import DashboardPageContent from "./page-content";

export const metadata: Metadata = pageMetadata({
  title: "Email Platform for Amazon SES - Templates, Broadcasts, Workflows",
  description:
    "Templates, broadcasts, contacts, and analytics. The premium layer on top of your AWS infrastructure.",
  path: "/platform",
  image: {
    url: "/wraps-platform-og.webp",
    width: 1424,
    height: 752,
    alt: "Wraps Platform - Templates, broadcasts, contacts, and analytics",
  },
  social: { title: "Wraps Platform" },
});

export default function DashboardPage() {
  return <DashboardPageContent />;
}
