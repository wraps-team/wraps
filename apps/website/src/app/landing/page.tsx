import { CTASection } from "./components/cta-section";
import { FaqSection } from "./components/faq-section";
import { FeaturesSection } from "./components/features-section";
import { LandingFooter } from "./components/footer";
import { HeroSection } from "./components/hero-section";
import { LandingNavbar } from "./components/navbar";
import { PricingSection } from "./components/pricing-section";
import { QuickStartSection } from "./components/quick-start-section";
import { StatsSection } from "./components/stats-section";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <LandingNavbar />

      {/* Main Content */}
      <main>
        <HeroSection />
        <QuickStartSection />
        <StatsSection />
        <FeaturesSection />
        <PricingSection />
        <FaqSection />
        <CTASection />
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}
