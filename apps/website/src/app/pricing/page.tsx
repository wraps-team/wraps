import { BaseLayout } from "@/components/layouts/base-layout";
import { PricingPlans } from "@/components/pricing-plans";
import { FAQSection } from "./components/faq-section";
import { FeaturesGrid } from "./components/features-grid";
import faqsData from "./data/faqs.json";
// Import data
import featuresData from "./data/features.json";

export default function PricingPage() {
  return (
    <BaseLayout
      description="Choose the perfect plan for your team"
      title="Pricing Plans"
    >
      <div className="px-4 lg:px-6">
        {/* Pricing Cards */}
        <section className="pb-12" id="pricing">
          <PricingPlans mode="pricing" />
        </section>

        {/* Features Section */}
        <FeaturesGrid features={featuresData} />

        {/* FAQ Section */}
        <FAQSection faqs={faqsData} />
      </div>
    </BaseLayout>
  );
}
