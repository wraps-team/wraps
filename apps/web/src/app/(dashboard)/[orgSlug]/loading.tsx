import { Skeleton } from "@wraps/ui/components/ui/skeleton";

/**
 * Loading state for the org home (/[orgSlug]).
 *
 * Mirrors the frame of `overview-dashboard.tsx` — a right-aligned control
 * row, a wide health/insights block, then a two-thirds/one-third split — so
 * the page doesn't visibly reflow once the real content lands.
 */
export default function OrgHomeLoading() {
  return (
    <div className="space-y-6 px-4 py-6 lg:px-6" data-testid="org-home-loading">
      <div className="flex items-center justify-end gap-3">
        <Skeleton className="h-9 w-64" />
      </div>
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-80 w-full" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
