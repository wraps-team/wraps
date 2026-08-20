"use client";

import * as Sentry from "@sentry/nextjs";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * Segment error boundary for /topics (audit findings F6 and F19).
 *
 * `page.tsx` already turns a failed `listTopics` into an in-place error
 * state without ever reaching this boundary - see `TopicsLoadError` there.
 * This file exists for what that can't catch: an unguarded query throwing
 * before the page finishes rendering. This is the exact failure mode that
 * broke this route in production on 2026-07-30 (`column
 * "preference_center_theme" does not exist`) - without a boundary here it
 * unwound to the nearest one above it and took the whole dashboard shell -
 * sidebar, org switcher, nav - down with it.
 */
export default function TopicsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const [orgSlug] = pathname.split("/").filter(Boolean);

  useEffect(() => {
    Sentry.captureException(error);
    posthog.captureException(error, {
      $exception_source: "topics_list_error_boundary",
      error_digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
      <Empty className="max-w-2xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert className="size-6" />
          </EmptyMedia>
          <EmptyTitle>We couldn't load your topics</EmptyTitle>
          <EmptyDescription>
            Something went wrong while building this page. Your topics and
            subscribers are unaffected. The error has been logged, and retrying
            often works.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {error.digest ? (
            <p className="font-mono text-muted-foreground text-xs">
              Error ID: {error.digest}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={reset} size="sm">
              Try again
            </Button>
            {orgSlug ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/${orgSlug}`}>Back to dashboard</Link>
              </Button>
            ) : null}
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
