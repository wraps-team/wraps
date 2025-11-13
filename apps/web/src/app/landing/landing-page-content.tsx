"use client";

import React from "react";
import { AboutSection } from "./components/about-section";
import { BlogSection } from "./components/blog-section";
import { ContactSection } from "./components/contact-section";
import { CTASection } from "./components/cta-section";
import { FaqSection } from "./components/faq-section";
import { FeaturesSection } from "./components/features-section";
import { LandingFooter } from "./components/footer";
import { HeroSection } from "./components/hero-section";
import {
  LandingThemeCustomizer,
  LandingThemeCustomizerTrigger,
} from "./components/landing-theme-customizer";
import { LogoCarousel } from "./components/logo-carousel";
import { LandingNavbar } from "./components/navbar";
import { PricingSection } from "./components/pricing-section";
import { StatsSection } from "./components/stats-section";
import { TeamSection } from "./components/team-section";
import { TestimonialsSection } from "./components/testimonials-section";

export function LandingPageContent() {
  const [themeCustomizerOpen, setThemeCustomizerOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <LandingNavbar />

      {/* Main Content */}
      <main>
        <HeroSection />
        <LogoCarousel />
        <StatsSection />
        <AboutSection />
        <FeaturesSection />
        <TeamSection />
        <PricingSection />
        <TestimonialsSection />
        <BlogSection />
        <FaqSection />
        <CTASection />
        <ContactSection />
      </main>

      {/* Footer */}
      <LandingFooter />

      {/* Theme Customizer */}
      <LandingThemeCustomizerTrigger
        onClick={() => setThemeCustomizerOpen(true)}
      />
      <LandingThemeCustomizer
        onOpenChange={setThemeCustomizerOpen}
        open={themeCustomizerOpen}
      />
    </div>
  );
}
