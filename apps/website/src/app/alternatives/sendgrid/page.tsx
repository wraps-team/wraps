import type { Metadata } from "next";
import { AlternativesPageLayout } from "@/app/alternatives/components/alternatives-page";
import { alternativesPageBySlug } from "@/config/alternatives";
import { pageMetadata } from "@/lib/page-metadata";

const page = alternativesPageBySlug("sendgrid");

const title = `${page.ranked.length} ${page.incumbent} Alternatives, Ranked`;

export const metadata: Metadata = pageMetadata({
  title,
  description: page.description,
  path: "/alternatives/sendgrid",
});

export default function SendGridAlternativesPage() {
  return <AlternativesPageLayout page={page} />;
}
