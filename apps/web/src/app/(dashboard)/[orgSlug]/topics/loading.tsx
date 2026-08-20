import { Skeleton } from "@wraps/ui/components/ui/skeleton";

/**
 * Segment loading state for /topics (audit finding F19).
 *
 * Without one, navigating here blanked the entire dashboard shell to a
 * centred spinner - the sidebar and org switcher disappeared along with the
 * content, observed live. This keeps the shell up and shows a page heading
 * plus one neutral content block while the topics tabs stream in, rather
 * than promising their exact shape.
 */
export default function TopicsSegmentLoading() {
  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
