"use client";

import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { ByocCtaSection } from "./components/cta-section";
import { EventControlsPreviewSection } from "./components/event-controls-preview-section";
import { ByocHeroSection } from "./components/hero-section";
import { LeavingSection } from "./components/leaving-section";
import { LivesWhereSection } from "./components/lives-where-section";
import { NoEnterpriseSection } from "./components/no-enterprise-section";
import { SyncsSection } from "./components/syncs-section";
import { VsManagedApiSection } from "./components/vs-managed-api-section";
import { WhatByocMeansSection } from "./components/what-byoc-means-section";
import { WhyByocSection } from "./components/why-byoc-section";

export default function ByocPageContent() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <ByocHeroSection />
        <WhatByocMeansSection />
        <VsManagedApiSection />
        <LivesWhereSection />
        <WhyByocSection />
        <NoEnterpriseSection />
        <SyncsSection />
        <EventControlsPreviewSection />
        <LeavingSection />
        <ByocCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
