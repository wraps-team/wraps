"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wraps/ui/components/ui/alert-dialog";

type SendConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** The audience size, or null when it could not be loaded. Null must never
   *  be rendered as 0 — this dialog is the blast-radius guarantee. */
  recipientCount: number | null;
  /** Which audience the count describes, e.g. "Segment: Trial expiring".
   *  A count alone does not catch a right-size, wrong-segment send. */
  audienceLabel?: string;
  /** True when the number shown is a preflight count that the send worker
   *  will recount at chunk 0 — the approved figure is not necessarily the
   *  figure that sends. */
  countIsProvisional?: boolean;
  variant: "send" | "schedule";
  scheduledDate?: Date;
  /** IANA zone the scheduled time is expressed in, e.g. "America/Denver". */
  timeZoneLabel?: string;
  loading?: boolean;
  /** When the audience exceeds one day's SES capacity, the estimated calendar
   *  days to drain. Null, undefined, or 1 renders nothing extra. */
  estimatedDays?: number | null;
  /** Other queued/processing email broadcasts on this AWS account. Omitted
   *  or 0 renders nothing extra. */
  inFlightBatches?: number;
  /** Their combined unsent remainder — the quota this send has to share. */
  inFlightRecipients?: number;
};

export function SendConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  recipientCount,
  audienceLabel,
  countIsProvisional,
  variant,
  scheduledDate,
  timeZoneLabel,
  loading,
  estimatedDays,
  inFlightBatches,
  inFlightRecipients,
}: SendConfirmDialogProps) {
  const countUnknown = recipientCount === null;
  const formattedCount = recipientCount?.toLocaleString() ?? "";
  const audience = audienceLabel ? ` in ${audienceLabel}` : "";
  const zone = timeZoneLabel ? ` ${timeZoneLabel}` : "";

  const scheduleDescription = scheduledDate
    ? `This will schedule emails to ${formattedCount} contacts${audience} for ${scheduledDate.toLocaleDateString(undefined, { dateStyle: "medium" })} at ${scheduledDate.toLocaleTimeString(undefined, { timeStyle: "short" })}${zone}.`
    : `This will schedule emails to ${formattedCount} contacts${audience}.`;

  // The count was taken before the send starts; the worker recounts the
  // audience at chunk 0 and that number is what actually sends. Saying so is
  // the difference between an approximate figure and a promise we break.
  const provisionalNote = countIsProvisional
    ? " This count was taken just now — the audience is re-resolved when sending starts, so the final number can differ if contacts change in between."
    : "";

  const durationNote =
    estimatedDays && estimatedDays > 1
      ? ` This account's SES daily quota means sending will take about ${estimatedDays} days: it pauses and resumes automatically as quota frees up, and you can cancel any time from the broadcast page.`
      : "";

  const contentionNote =
    inFlightBatches && inFlightBatches > 0
      ? ` ${inFlightBatches} other broadcast${inFlightBatches === 1 ? "" : "s"} on this AWS account ${inFlightBatches === 1 ? "still has" : "still have"} ${(inFlightRecipients ?? 0).toLocaleString()} recipients to send; this broadcast shares the same daily quota with ${inFlightBatches === 1 ? "it" : "them"}.`
      : "";

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {variant === "schedule" ? "Confirm schedule" : "Confirm send"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {countUnknown
              ? "The number of recipients could not be loaded, so this send can't be confirmed. Close this dialog and try again."
              : (variant === "schedule"
                  ? scheduleDescription
                  : `This will immediately send emails to ${formattedCount} contacts${audience}. This action cannot be undone.`) +
                durationNote +
                contentionNote +
                provisionalNote}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading || countUnknown}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {loading
              ? variant === "schedule"
                ? "Scheduling..."
                : "Sending..."
              : variant === "schedule"
                ? "Schedule"
                : "Send now"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
