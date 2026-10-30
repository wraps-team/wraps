/**
 * Classifies an SES bounce for the purpose of updating the contact.
 *
 * SES bounceType is `Permanent` | `Transient` | `Undetermined`:
 * - hard: the address is dead (Permanent).
 * - soft: the address may be failing temporarily (Transient General/MailboxFull,
 *   or Undetermined). SES already retried before reporting it.
 * - content: a problem with the message, not the address (Transient
 *   MessageTooLarge/ContentRejected/AttachmentRejected). No contact change.
 * - unknown: missing or unrecognised type. No contact change.
 */
export type BounceKind = "hard" | "soft" | "content" | "unknown";

/** Counted soft bounces after which a contact is treated as bounced. */
export const SOFT_BOUNCE_ESCALATION_THRESHOLD = 3;
/** A contact's soft-bounce count rises at most once per this many hours. */
export const SOFT_BOUNCE_MIN_GAP_HOURS = 24;

export const CONTENT_BOUNCE_SUBTYPES = [
  "MessageTooLarge",
  "ContentRejected",
  "AttachmentRejected",
] as const;
const CONTENT_SUBTYPES = new Set<string>(CONTENT_BOUNCE_SUBTYPES);

export function classifyBounce(
  bounceType?: string | null,
  bounceSubType?: string | null
): BounceKind {
  if (bounceType === "Permanent") {
    return "hard";
  }
  if (bounceType === "Undetermined") {
    return "soft";
  }
  if (bounceType === "Transient") {
    return bounceSubType && CONTENT_SUBTYPES.has(bounceSubType)
      ? "content"
      : "soft";
  }
  return "unknown";
}
