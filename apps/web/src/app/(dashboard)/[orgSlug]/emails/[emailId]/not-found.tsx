"use client";

import { MailQuestionMark } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
 * Rendered when the detail page calls `notFound()` — i.e. no Postgres record
 * and no DynamoDB events for this id. `not-found.tsx` receives no props, so
 * the org slug is read back off the path (/[orgSlug]/emails/[emailId]).
 */
export default function EmailNotFound() {
  const pathname = usePathname();
  // The list's filters ride on this URL, so Back returns to the view the
  // message was opened from rather than the default one (audit F8).
  const search = useSearchParams().toString();
  const [orgSlug] = pathname.split("/").filter(Boolean);
  const emailsHref = orgSlug
    ? `/${orgSlug}/emails${search ? `?${search}` : ""}`
    : "/";

  return (
    <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
      <Empty className="max-w-2xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailQuestionMark className="size-6" />
          </EmptyMedia>
          <EmptyTitle>We couldn't find that message</EmptyTitle>
          <EmptyDescription>
            Wraps keeps per-message event history for 90 days in your AWS
            account. If this message is older than that — or was sent from an
            AWS account that is no longer connected — the send happened but the
            record is gone. Double-check the message ID from the emails list.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild size="sm">
            <Link href={emailsHref}>Back to emails</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
