import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { EmailsTableSkeleton } from "./components/emails-table-skeleton";

/**
 * Segment loading state for the emails list (audit finding F16).
 *
 * There was no `loading.tsx` and no Suspense boundary anywhere between the
 * dashboard layout and this page, so clicking "Emails" in the nav left the
 * previous screen sitting there, unchanged and unexplained, for roughly two
 * seconds of server render before anything moved. Shared layouts stay
 * interactive while a segment loads, but only if the segment has a boundary.
 */
export default function EmailsLoading() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="rounded-xl border bg-card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-8 w-56" />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 @[540px]/card:grid-cols-[1fr_200px]">
            <Skeleton className="h-[280px] w-full" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="@container/main px-4 lg:px-6">
        <EmailsTableSkeleton />
      </div>
    </>
  );
}
