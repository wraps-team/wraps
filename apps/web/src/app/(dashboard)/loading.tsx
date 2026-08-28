import { Skeleton } from "@wraps/ui/components/ui/skeleton";

/**
 * Fallback for every dashboard route without a closer `loading.tsx`.
 *
 * Without this, those routes inherit `src/app/loading.tsx` — a full-screen
 * loader — which tears down the sidebar and org switcher on every navigation
 * and rebuilds them, so an app that is not slow reads as one that reloads.
 * Deliberately generic: this stands in for ~40 different pages, and a skeleton
 * that promises a shape the page does not have is worse than a neutral block.
 */
export default function DashboardSegmentLoading() {
  return (
    <div
      className="space-y-6 px-4 py-6 lg:px-6"
      data-testid="dashboard-loading"
    >
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
