import { toast } from "sonner";

/**
 * Surfaces a failed AWS-backed server action.
 *
 * `PERMISSION_DENIED` means the customer's IAM role is unusable — a broken
 * trust policy or a mismatched External ID. The repair is one CloudFormation
 * re-run, offered on the AWS account page, so the toast sends them there
 * rather than naming `wraps platform update-role`: a dashboard user may have
 * no CLI installed, and that command resolves the External ID from local or
 * S3 deployment metadata it cannot always find. Everything else gets the
 * caller's generic message.
 */
export function toastAwsActionError(
  errorCode: "PERMISSION_DENIED" | "UNKNOWN" | undefined,
  fallbackMessage: string,
  orgSlug?: string
): void {
  if (errorCode === "PERMISSION_DENIED") {
    toast.error("Wraps can't reach your AWS account", {
      description:
        "Its IAM role needs its trust policy and permissions repaired before this will work.",
      duration: Number.POSITIVE_INFINITY,
      action: orgSlug
        ? {
            label: "Fix it",
            onClick: () => {
              window.location.href = `/${orgSlug}/settings/aws-accounts`;
            },
          }
        : undefined,
    });
    return;
  }
  toast.error(fallbackMessage);
}
