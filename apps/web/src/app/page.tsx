import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Metadata for the landing page
export const metadata: Metadata = {
  title: "Wraps - Email Infrastructure Made Simple",
  description:
    "Deploy production-ready email infrastructure to your AWS account in minutes. Zero stored credentials, beautiful DX, and transparent AWS pricing.",
  keywords: [
    "email infrastructure",
    "aws ses",
    "email api",
    "developer tools",
    "email service",
  ],
  openGraph: {
    title: "Wraps - Email Infrastructure Made Simple",
    description:
      "Deploy production-ready email infrastructure to your AWS account in minutes.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wraps - Email Infrastructure Made Simple",
    description:
      "Deploy production-ready email infrastructure to your AWS account in minutes.",
  },
};

export default function HomePage() {
  // Redirect to dashboard for now
  // TODO: Create a proper landing page
  redirect("/dashboard");
}
