"use client";

import { useEffect } from "react";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { TrackedCtaPair } from "@/components/tracked-cta-pair";
import { PlatformAutomationsSection } from "./components/automations-section";
import { PlatformEverythingElseSection } from "./components/everything-else-section";
import { PlatformHeroSection } from "./components/hero-section";
import { PlatformNewslettersSection } from "./components/newsletters-section";
import { PlatformTemplatesSection } from "./components/templates-section";

export default function DashboardPageContent() {
  // Handle hash scrolling after page layout settles
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const element = document.querySelector(hash);
      if (!element) {
        return;
      }

      // Jump to approximate position immediately to avoid blank viewport
      element.scrollIntoView({ behavior: "instant" as ScrollBehavior });

      // Once images above the anchor load and layout is stable, smooth-scroll
      // to the final position (it may have shifted)
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const timeoutId = setTimeout(() => {
        element.scrollIntoView({
          behavior: reduceMotion ? "instant" : "smooth",
        } as ScrollIntoViewOptions);
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <PlatformHeroSection />
        <PlatformTemplatesSection />
        <PlatformNewslettersSection />
        <PlatformAutomationsSection />
        <PlatformEverythingElseSection />
        <ClosingPanel
          actions={
            <TrackedCtaPair
              location="platform_closing"
              secondary={{ label: "See plans", href: "/#pricing" }}
            />
          }
          body="Amazon handles the sending. Wraps gives your team the tools. Unlimited contacts on every plan."
          title="Create. Reach. Automate."
        />
      </main>
      <LandingFooter />
    </div>
  );
}
