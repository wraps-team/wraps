import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { pageMetadata } from "@/lib/page-metadata";
import { ChangelogHeroSection } from "./components/hero-section";
import { ChangelogReleasesSection } from "./components/releases-section";

export const metadata: Metadata = pageMetadata({
  title: "Changelog",
  description:
    "Latest updates, improvements, and releases for Wraps CLI, SDK, and Platform.",
  path: "/changelog",
});

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <ChangelogHeroSection />
        <ChangelogReleasesSection />
      </main>
      <LandingFooter />
    </div>
  );
}
