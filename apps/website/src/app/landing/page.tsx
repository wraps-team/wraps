import { ArchitectureSection } from "./components/architecture-section";
import { BroadcastsSection } from "./components/broadcasts-section";
import { CTASection } from "./components/cta-section";
import { ExistingSesSection } from "./components/existing-ses-section";
import { FaqSection } from "./components/faq-section";
import { FeaturesSection } from "./components/features-section";
import { LandingFooter } from "./components/footer";
import { HeroSection } from "./components/hero-section";
import { LandingNavbar } from "./components/navbar";
import { PricingSection } from "./components/pricing-section";
import { QuickStartSection } from "./components/quick-start-section";
import { SmsTeaserSection } from "./components/sms-teaser-section";
import { StatsSection } from "./components/stats-section";
import { TemplateEditorSection } from "./components/template-editor-section";
import { TrustedBySection } from "./components/trusted-by-section";
import { premiumBgClass, UpgradeSection } from "./components/upgrade-section";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <LandingNavbar />

      {/* Main Content */}
      <main>
        {/* Hero & Social Proof */}
        <HeroSection />
        <TrustedBySection />
        <StatsSection />

        {/* SMS Coming Soon Teaser */}
        <SmsTeaserSection />

        {/* Free Tier - CLI + SDK + Local Console */}
        <QuickStartSection />
        <ArchitectureSection />
        <FeaturesSection />
        <ExistingSesSection />

        {/* Transition to Premium (slant happens midway through this section) */}
        <UpgradeSection />

        {/* Premium Tier - Hosted Dashboard (continues the premium background) */}
        <div className={premiumBgClass}>
          <TemplateEditorSection />
          <BroadcastsSection />
          <PricingSection />
          <FaqSection />
          <CTASection />
        </div>
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}
