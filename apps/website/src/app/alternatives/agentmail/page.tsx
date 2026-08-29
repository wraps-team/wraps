import type { Metadata } from "next";
import { AlternativesPageLayout } from "@/app/alternatives/components/alternatives-page";
import { alternativesPageBySlug } from "@/config/alternatives";

const page = alternativesPageBySlug("agentmail");

const url = "https://wraps.dev/alternatives/agentmail";
const title = `${page.ranked.length} ${page.incumbent} Alternatives, Ranked`;

export const metadata: Metadata = {
  title,
  description: page.description,
  openGraph: {
    title: `${title} | Wraps`,
    description: page.description,
    url,
  },
  twitter: {
    title: `${title} | Wraps`,
    description: page.description,
  },
  alternates: { canonical: url },
};

export default function AgentMailAlternativesPage() {
  return <AlternativesPageLayout page={page} />;
}
