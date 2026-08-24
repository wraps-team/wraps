"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@wraps/ui/components/ui/alert";
import { RadioTower } from "lucide-react";
import { EventFeedStaleBanner } from "../../settings/aws-accounts/[accountId]/components/event-feed-stale-banner";
import type { EmailListFeed } from "../types";

/**
 * The list's honest partiality (memo section 3).
 *
 * Under the Postgres-only contract the list is never partial in the datasource
 * sense - every message Wraps sent is in it. What can be missing is the
 * outcome: if SES events never reach us, every row sits at "Sent" forever and
 * nothing on the page says why. These two banners are the difference between
 * "all your mail delivered" and "nobody ever told us what happened to it".
 */
export function EmailFeedBanners({ feed }: { feed: EmailListFeed | null }) {
  if (!feed) {
    return null;
  }

  const stale = feed.accounts.filter((account) => account.eventFeedStaleSince);

  // A feed that has never produced an event is a different problem from one
  // that went quiet, and only worth saying when there is mail to explain.
  const silent = feed.hasEverSent
    ? feed.accounts.filter(
        (account) =>
          !(account.hasEverReceivedEvents || account.eventFeedStaleSince)
      )
    : [];

  if (stale.length === 0 && silent.length === 0) {
    return null;
  }

  const nameAccounts = feed.accounts.length > 1;

  return (
    <div className="space-y-3">
      {stale.map((account) => (
        <div className="space-y-1" key={`stale-${account.maskedAccountId}`}>
          {nameAccounts ? (
            <p className="text-muted-foreground text-xs">
              AWS account {account.maskedAccountId}
            </p>
          ) : null}
          <EventFeedStaleBanner
            account={{
              eventFeedStaleSince: account.eventFeedStaleSince
                ? new Date(account.eventFeedStaleSince)
                : null,
              lastEventReceivedAt: account.lastEventReceivedAt
                ? new Date(account.lastEventReceivedAt)
                : null,
            }}
          />
        </div>
      ))}

      {silent.map((account) => (
        <Alert key={`silent-${account.maskedAccountId}`}>
          <RadioTower />
          <AlertTitle>
            No delivery events for AWS account {account.maskedAccountId}
          </AlertTitle>
          <AlertDescription>
            <p>
              No delivery events have ever arrived for this account. Every
              message below shows as Sent because no outcome has been reported,
              not because they all delivered. Run{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                wraps email doctor
              </code>{" "}
              to connect your event pipeline.
            </p>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
