import { toast } from "sonner";

/**
 * Surfaces a failed AWS-backed server action.
 *
 * `PERMISSION_DENIED` means the customer's IAM role is unusable — a broken
 * trust policy or a mismatched External ID. `wraps platform update-role`
 * repairs exactly that, so the toast names it and stays up until dismissed.
 * Everything else gets the caller's generic message.
 */
export function toastAwsActionError(
  errorCode: "PERMISSION_DENIED" | "UNKNOWN" | undefined,
  fallbackMessage: string
): void {
  if (errorCode === "PERMISSION_DENIED") {
    toast.error("Permission Update Required", {
      description:
        "Your IAM role needs updated permissions. Run: wraps platform update-role",
      duration: Number.POSITIVE_INFINITY,
    });
    return;
  }
  toast.error(fallbackMessage);
}
