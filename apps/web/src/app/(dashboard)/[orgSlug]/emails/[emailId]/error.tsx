"use client";

import * as Sentry from "@sentry/nextjs";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
 * Segment error boundary for the email detail page. Keeps the dashboard shell
 * and offers a retry instead of bouncing the user back to the list with no
 * explanation. Expected failures (a missing message, an unreadable history
 * table) are handled by the page itself — this catches the unexpected ones.
 */
export default function EmailDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [orgSlug] = pathname.split("/").filter(Boolean);
  const emailsHref = orgSlug
    ? `/${orgSlug}/emails${search ? `?${search}` : ""}`
    : "/";

  useEffect(() => {
    Sentry.captureException(error);
    posthog.captureException(error, {
      $exception_source: "email_detail_error_boundary",
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
          <EmptyTitle>We couldn't load this message</EmptyTitle>
          <EmptyDescription>
            Something went wrong while rendering the message details. The error
            has been logged — retrying often works.
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
            <Button asChild size="sm" variant="ghost">
              <Link href={emailsHref}>Back to emails</Link>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
