"use client";

import { Alert, AlertDescription } from "@wraps/ui/components/ui/alert";
import { Clock } from "lucide-react";
import Link from "next/link";
import type { EmailListWindow } from "../types";

/**
 * Says why the list stops where it does.
 *
 * The plan's history window used to be applied to the audit log and nowhere
 * else, so a Free org asking for 90 days silently received 30 — an empty
 * stretch that reads as missing data rather than a plan boundary. Enforcing
 * the window without saying so would have made that worse, not better: the
 * limit becomes real and stays invisible.
 *
 * Only shown when the plan is what shortened the window. Asking for 7 days on
 * a 30-day plan is a choice, not a limit, and must not raise an upgrade
 * prompt — a nudge that fires when nothing is being withheld is just noise,
 * and teaches people to ignore the one that matters.
 */
export function HistoryWindowNotice({
  window,
  orgSlug,
}: {
  window: EmailListWindow | null;
  orgSlug: string;
}) {
  if (!window?.clampedByPlan) {
    return null;
  }

  const { retentionDays } = window;
  // 365 reads as "1 year", not "365 days" — the pricing page says the former.
  const windowLabel =
    retentionDays >= 365
      ? "1 year"
      : `${retentionDays} day${retentionDays === 1 ? "" : "s"}`;

  return (
    <Alert>
      <Clock className="h-4 w-4" />
      <AlertDescription>
        Your plan keeps {windowLabel} of email history, so older messages are
        not shown here.
        {window.canExtend ? (
          <>
            {" "}
            <Link
              className="font-medium underline underline-offset-4"
              href={`/${orgSlug}/settings/billing`}
            >
              Upgrade to extend it
            </Link>
            .
          </>
        ) : (
          <>
            {" "}
            <a
              className="font-medium underline underline-offset-4"
              href="mailto:support@wraps.dev?subject=Extended%20email%20history"
            >
              Contact us for Enterprise
            </a>{" "}
            to extend it.
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
