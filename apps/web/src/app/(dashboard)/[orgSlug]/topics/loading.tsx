import { Skeleton } from "@wraps/ui/components/ui/skeleton";

/**
 * Segment loading state for /topics (audit finding F19).
 *
 * Without one, navigating here blanked the entire dashboard shell to a
 * centred spinner - the sidebar and org switcher disappeared along with the
 * content, observed live. This keeps the shell up and mirrors the page's
 * frame - heading row with its action, the underline tabs, one content block -
 * without promising the active tab's exact shape.
 */
export default function TopicsSegmentLoading() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 lg:px-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-5 w-72 max-w-full" />
          </div>
          <Skeleton className="h-10 w-36 md:h-9" />
        </div>
        <div className="px-4 lg:px-6">
          <div className="flex gap-6 border-b pb-2.5">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
      </div>
      <div className="px-4 lg:px-6">
        <Skeleton className="h-64 w-full" />
      </div>
    </>
  );
}
