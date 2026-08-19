import { Card, CardContent, CardHeader } from "@wraps/ui/components/ui/card";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";

/**
 * Segment loading state for a single message.
 *
 * `emails/loading.tsx` wraps this page and every other segment below it in a
 * Suspense boundary, so without a boundary of its own, opening a message
 * flashed the emails *list* skeleton — a chart card and table rows — before
 * the message appeared. It read as "the list is reloading" rather than "your
 * message is opening", which is the wrong promise: the row click had already
 * been registering as a dead click at roughly two seconds while this page's
 * lookup ran.
 *
 * The shape below mirrors `page.tsx` exactly — back link, envelope hero
 * (subject, sent-at, message id, status badge, To/From pair), then the event
 * timeline card — so nothing shifts when the real content swaps in.
 */

/** Placeholder rows in the timeline card. A typical message has send +
 * delivery + an open or two, so four keeps the card the right height without
 * promising more history than most messages have. */
const TIMELINE_ROW_COUNT = 4;

function TimelineRowSkeleton({ isLast }: { isLast: boolean }) {
  return (
    <div className="flex gap-4">
      {/* Status dot + connector, matching EventItem's indicator column */}
      <div className="flex flex-col items-center">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        {!isLast && <Skeleton className="my-1 w-0.5 flex-1" />}
      </div>
      <div className="flex flex-1 items-start justify-between gap-2 pb-4">
        <div className="space-y-1">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-44" />
        </div>
        <Skeleton className="h-5 w-16 shrink-0" />
      </div>
    </div>
  );
}

export default function EmailDetailLoading() {
  return (
    <>
      {/* "Back to emails" */}
      <div className="px-4 lg:px-6">
        <Skeleton className="h-8 w-36" />
      </div>

      <div className="space-y-6 px-4 lg:px-6">
        {/* Envelope hero */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* Subject (text-2xl) */}
                  <Skeleton className="mb-2 h-8 w-full max-w-md" />
                  {/* Sent-at • message id */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-4 w-56 max-w-full" />
                  </div>
                </div>
                {/* Status badge */}
                <Skeleton className="h-6 w-24 shrink-0 rounded-md" />
              </div>

              {/* To / From */}
              <div className="grid gap-3 md:grid-cols-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Event timeline */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full max-w-xs" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array.from({ length: TIMELINE_ROW_COUNT }).map((_, index) => (
                <TimelineRowSkeleton
                  isLast={index === TIMELINE_ROW_COUNT - 1}
                  key={`timeline-skeleton-${index}`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
