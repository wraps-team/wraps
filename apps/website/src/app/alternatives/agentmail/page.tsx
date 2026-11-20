import type { Metadata } from "next";
import { AlternativesPageLayout } from "@/app/alternatives/components/alternatives-page";
import { alternativesPageBySlug } from "@/config/alternatives";
import { pageMetadata } from "@/lib/page-metadata";

const page = alternativesPageBySlug("agentmail");

const title = `${page.ranked.length} ${page.incumbent} Alternatives, Ranked`;

export const metadata: Metadata = pageMetadata({
  title,
  description: page.description,
  path: "/alternatives/agentmail",
});

export default function AgentMailAlternativesPage() {
  return <AlternativesPageLayout page={page} />;
}
