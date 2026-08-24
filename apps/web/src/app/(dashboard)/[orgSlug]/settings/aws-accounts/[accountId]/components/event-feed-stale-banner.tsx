import type { awsAccount } from "@wraps/db";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@wraps/ui/components/ui/alert";
import type { InferSelectModel } from "drizzle-orm";
import { AlertTriangle } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

type EventFeedStaleBannerProps = {
  account: Pick<
    InferSelectModel<typeof awsAccount>,
    "eventFeedStaleSince" | "lastEventReceivedAt"
  >;
};

/**
 * Warns when this account's SES event feed has gone silent while sends are
 * still happening (see apps/api/src/workers/event-feed-staleness.ts).
 * Server component — reads the already org-scoped `account` row fetched by
 * the parent page, no extra query needed.
 */
export function EventFeedStaleBanner({ account }: EventFeedStaleBannerProps) {
  if (!account.eventFeedStaleSince) {
    return null;
  }
  // After plan 194's sweep gate, the sweep never sets eventFeedStaleSince on
  // an account whose lastEventReceivedAt is null — this combination should
  // not exist. A banner is not the place to improvise a sentence about a
  // state that shouldn't be reachable, so bail rather than render one.
  if (!account.lastEventReceivedAt) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>Event streaming appears disconnected</AlertTitle>
      <AlertDescription>
        <p>
          The last delivery event we received was{" "}
          {formatRelativeTime(new Date(account.lastEventReceivedAt))}, though
          emails are being sent. The email timeline and analytics for this
          account are frozen, and bounce/complaint handling is blind until the
          feed recovers. Run{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            wraps email doctor
          </code>{" "}
          to diagnose.
        </p>
      </AlertDescription>
    </Alert>
  );
}
