import { Skeleton } from "@wraps/ui/components/ui/skeleton";

/**
 * Segment loading state for everything under `/emails`.
 *
 * A `loading.tsx` wraps its own `page.tsx` *and every child segment below it*,
 * so this file is what fourteen routes show while they render — the setup
 * wizard, brand kits, the template editor, agents, broadcasts, inbound, and
 * analytics, not just the message list. It used to render the list's shape (a
 * chart card, a filter bar, five table rows, pagination), which meant opening
 * the Monaco template editor promised a table that was never coming.
 *
 * So this boundary stays generic: a page heading and one content block, the
 * two things every route below actually has. The specific shapes live at the
 * specific boundaries that own them — the list's table skeleton hangs off the
 * `<Suspense>` in `emails/page.tsx`, and the message detail has its own
 * `[emailId]/loading.tsx`.
 */
export default function EmailsSegmentLoading() {
  return (
    <div className="space-y-6 px-4 lg:px-6">
      {/* Page heading: an h1 plus, on most routes, a line of description. */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>

      {/* One neutral content block. Deliberately shapeless — it must not
          promise a chart, a table, a toolbar or pagination to the routes that
          have none of them. */}
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
