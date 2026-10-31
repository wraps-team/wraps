import {
  classifyBounce,
  isSuppressionBounceSubType,
} from "@wraps/core/bounce-classification";

/**
 * The hard bounce on a message, if it has one: the addresses that bounced and
 * when. The detail page uses it to check those addresses against the SES
 * suppression list and show the result as the next step in the lifecycle.
 */
export type HardBounce = {
  addresses: string[];
  bouncedAt: number;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

type TimelineEvent = {
  type: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

/**
 * A real hard bounce: Permanent, and not one SES raised because it refused the
 * send to an already-suppressed address. Those never lead to a "suppressed
 * after this bounce" step.
 */
function isNewHardBounce(metadata: Record<string, unknown>): boolean {
  const bounceType = asString(metadata.bounceType);
  const bounceSubType = asString(metadata.bounceSubType);
  return (
    classifyBounce(bounceType, bounceSubType) === "hard" &&
    !isSuppressionBounceSubType(bounceSubType)
  );
}

/** The bounced recipients' addresses, lowercased and deduplicated. */
function bouncedAddresses(metadata: Record<string, unknown>): string[] {
  const recipients = Array.isArray(metadata.bouncedRecipients)
    ? metadata.bouncedRecipients
    : [];
  const addresses = new Set<string>();
  for (const recipient of recipients) {
    const address =
      recipient && typeof recipient === "object"
        ? asString((recipient as Record<string, unknown>).emailAddress)
        : undefined;
    if (address) {
      addresses.add(address.trim().toLowerCase());
    }
  }
  return [...addresses];
}

export function findHardBounce(events: TimelineEvent[]): HardBounce | null {
  for (const event of events) {
    if (event.type !== "bounce" || !event.metadata) {
      continue;
    }
    if (!isNewHardBounce(event.metadata)) {
      continue;
    }
    const addresses = bouncedAddresses(event.metadata);
    if (addresses.length > 0) {
      return { addresses, bouncedAt: event.timestamp };
    }
  }
  return null;
}
