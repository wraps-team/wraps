"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { recheckConsolePolicyAction } from "@/actions/console-policy";
import { Button } from "@/components/ui/button";

type ConsolePolicyRecheckProps = {
  awsAccountId: string;
  organizationId: string;
};

const IDLE_COPY =
  "Wraps re-checks on its own schedule, so a repair can take a while to show up here. This asks AWS right now.";

/**
 * Asks AWS, now, which version of the console policy this account's role
 * carries.
 *
 * The stale-policy banner above renders off a stored column that only the
 * hourly account-health sweep writes, so without this the only feedback on a
 * successful repair is the banner eventually disappearing — which, before the
 * sweep learned to re-probe accounts it knows are behind, could take a day.
 */
export function ConsolePolicyRecheck({
  awsAccountId,
  organizationId,
}: ConsolePolicyRecheckProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const recheck = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await recheckConsolePolicyAction(
        awsAccountId,
        organizationId
      );

      if (!result.success) {
        setMessage(result.error);
        return;
      }
      if (result.upToDate) {
        setMessage("This role is up to date.");
        return;
      }
      // `rechecked: false` means the reading is the stored one — a call inside
      // the cooldown, or a probe SES throttled. Reporting "still behind" there
      // would state a fact this call did not observe.
      setMessage(
        result.rechecked
          ? `Still behind — this role is at version ${result.version} of ${result.currentVersion}. Repair it below, then check again.`
          : "Checked a moment ago. Try again shortly."
      );
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <h4 className="mb-1 font-medium text-sm">
          Already repaired this role?
        </h4>
        <p className="text-muted-foreground text-sm">{message ?? IDLE_COPY}</p>
      </div>
      <Button
        disabled={pending}
        onClick={recheck}
        size="sm"
        type="button"
        variant="outline"
      >
        <RefreshCw className={`h-4 w-4${pending ? " animate-spin" : ""}`} />
        {pending ? "Checking..." : "Check again"}
      </Button>
    </div>
  );
}
