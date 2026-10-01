import { log } from "./logger";

const LOG_INTERVAL_MS = 60 * 60 * 1000;
const MAX_TRACKED = 1000;

const lastLoggedAt = new Map<string, number>();

/**
 * Log an SES event whose EventBridge envelope region differs from the
 * account's stored region: the only signal of real multi-region use until
 * regions are modelled (plan 386). At most once per account+region per hour
 * per Lambda instance. Returns whether it logged.
 */
export function logNonHomeRegionEvent(params: {
  accountId: string;
  awsAccountNumber: string;
  eventRegion: string | undefined;
  storedRegion: string;
  now?: number;
}): boolean {
  const { accountId, awsAccountNumber, eventRegion, storedRegion } = params;
  if (!eventRegion || eventRegion === storedRegion) {
    return false;
  }

  const now = params.now ?? Date.now();
  const key = `${accountId}:${eventRegion}`;
  const last = lastLoggedAt.get(key);
  if (last !== undefined && now - last < LOG_INTERVAL_MS) {
    return false;
  }

  if (lastLoggedAt.size >= MAX_TRACKED) {
    lastLoggedAt.clear();
  }
  lastLoggedAt.set(key, now);
  log.info("Webhook: event from non-home region", {
    awsAccountNumber,
    eventRegion,
    storedRegion,
  });
  return true;
}

export function resetNonHomeRegionLog(): void {
  lastLoggedAt.clear();
}
