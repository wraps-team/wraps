import { BaseLayout } from "@/components/layouts/base-layout";
import { CustomerInsights } from "./components/customer-insights";
import { MetricsOverview } from "./components/metrics-overview";
import { QuickActions } from "./components/quick-actions";
import { RecentTransactions } from "./components/recent-transactions";
import { RevenueBreakdown } from "./components/revenue-breakdown";
import { SalesChart } from "./components/sales-chart";
import { TopProducts } from "./components/top-products";

export default function Dashboard2() {
  return (
    <BaseLayout>
      <div className="flex-1 space-y-6 px-6 pt-0">
        {/* Enhanced Header */}

        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center md:gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-bold text-2xl tracking-tight">
              Business Dashboard
            </h1>
            <p className="text-muted-foreground">
              Monitor your business performance and key metrics in real-time
            </p>
          </div>
          <QuickActions />
        </div>

        {/* Main Dashboard Grid */}
        <div className="@container/main space-y-6">
          {/* Top Row - Key Metrics */}

          <MetricsOverview />

          {/* Second Row - Charts in 6-6 columns */}
          <div className="grid @5xl:grid-cols-2 grid-cols-1 gap-6">
            <SalesChart />
            <RevenueBreakdown />
          </div>

          {/* Third Row - Two Column Layout */}
          <div className="grid @5xl:grid-cols-2 grid-cols-1 gap-6">
            <RecentTransactions />
            <TopProducts />
          </div>

          {/* Fourth Row - Customer Insights and Team Performance */}
          <CustomerInsights />
        </div>
      </div>
    </BaseLayout>
  );
}
