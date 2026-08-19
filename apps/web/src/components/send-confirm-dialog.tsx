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
  variant: "send" | "schedule";
  scheduledDate?: Date;
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
  variant,
  scheduledDate,
  loading,
  estimatedDays,
  inFlightBatches,
  inFlightRecipients,
}: SendConfirmDialogProps) {
  const countUnknown = recipientCount === null;
  const formattedCount = recipientCount?.toLocaleString() ?? "";

  const scheduleDescription = scheduledDate
    ? `This will schedule emails to ${formattedCount} contacts for ${scheduledDate.toLocaleDateString(undefined, { dateStyle: "medium" })} at ${scheduledDate.toLocaleTimeString(undefined, { timeStyle: "short" })}.`
    : `This will schedule emails to ${formattedCount} contacts.`;

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
                  : `This will immediately send emails to ${formattedCount} contacts. This action cannot be undone.`) +
                durationNote +
                contentionNote}
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
