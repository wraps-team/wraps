// Offer Retry only for failed executions that haven't exhausted the ceiling —
// past it the API rejects the retry, so showing the button would just dead-end.
// Also requires the failed step to exist in the execution's definition snapshot
// (the reaper used to record "unknown"); an empty snapshot is a pre-snapshot
// execution, which the processor resolves against the live definition.
// Mirrors isRetryableStep in apps/api (web cannot import from apps/api).
export function canOfferRetry(
  status: string,
  retryCount: number | null,
  errorStepId: string | null,
  snapshotSteps: { id: string }[],
  maxRetries: number
): boolean {
  if (status !== "failed" || (retryCount ?? 0) >= maxRetries) {
    return false;
  }
  if (snapshotSteps.length === 0) {
    return true;
  }
  return errorStepId != null && snapshotSteps.some((s) => s.id === errorStepId);
}
