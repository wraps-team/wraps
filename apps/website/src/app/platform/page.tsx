import type { Metadata } from "next";
import DashboardPageContent from "./page-content";

export const metadata: Metadata = {
  title: "Email Platform for Amazon SES - Templates, Broadcasts, Workflows",
  description:
    "Templates, broadcasts, contacts, and analytics. The premium layer on top of your AWS infrastructure.",
  openGraph: {
    title: "Wraps Platform | Wraps",
    description:
      "Templates, broadcasts, contacts, and analytics. The premium layer on top of your AWS infrastructure.",
    images: [
      {
        url: "/wraps-platform-og.webp",
        width: 1424,
        height: 752,
        alt: "Wraps Platform - Templates, broadcasts, contacts, and analytics",
      },
    ],
  },
  twitter: {
    title: "Wraps Platform | Wraps",
    description:
      "Templates, broadcasts, contacts, and analytics. The premium layer on top of your AWS infrastructure.",
    images: ["/wraps-platform-og.webp"],
  },
  alternates: {
    canonical: "https://wraps.dev/platform",
  },
};

export default function DashboardPage() {
  return <DashboardPageContent />;
}
