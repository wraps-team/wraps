import { Skeleton } from "@wraps/ui/components/ui/skeleton";

/**
 * Loading state for settings pages.
 *
 * Settings pages are consistently a heading plus a stack of cards, so this
 * promises that shape rather than falling back to the generic block.
 */
export default function SettingsLoading() {
  return (
    <div className="space-y-6 px-4 py-6 lg:px-6" data-testid="settings-loading">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
