import { BaseLayout } from "@/components/layouts/base-layout";
import { ChartAreaInteractive } from "./components/chart-area-interactive";
import { DataTable } from "./components/data-table";
import { SectionCards } from "./components/section-cards";

import data from "./data/data.json";
import focusDocumentsData from "./data/focus-documents-data.json";
import keyPersonnelData from "./data/key-personnel-data.json";
import pastPerformanceData from "./data/past-performance-data.json";

export default function Page() {
  return (
    <BaseLayout description="Welcome to your admin dashboard" title="Dashboard">
      <div className="@container/main space-y-6 px-4 lg:px-6">
        <SectionCards />
        <ChartAreaInteractive />
      </div>
      <div className="@container/main">
        <DataTable
          data={data}
          focusDocumentsData={focusDocumentsData}
          keyPersonnelData={keyPersonnelData}
          pastPerformanceData={pastPerformanceData}
        />
      </div>
    </BaseLayout>
  );
}
