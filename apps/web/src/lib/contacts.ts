// Contacts types and constants - shared between server actions and client components

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL STATUS
// ═══════════════════════════════════════════════════════════════════════════

export const EMAIL_STATUSES = [
  "active",
  "unsubscribed",
  "bounced",
  "complained",
  "suppressed",
] as const;

export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  active: "Active",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  complained: "Complained",
  suppressed: "Suppressed",
};

// Semantic theme tokens only. The raw Tailwind palette these carried rendered
// identically in light and dark, so a near-white badge glared off a dark card.
export const EMAIL_STATUS_COLORS: Record<EmailStatus, string> = {
  active: "bg-success/15 text-success",
  unsubscribed: "bg-muted text-muted-foreground",
  bounced: "bg-destructive/15 text-destructive",
  complained: "bg-destructive/15 text-destructive",
  suppressed: "bg-warning/15 text-warning",
};

// ═══════════════════════════════════════════════════════════════════════════
// SMS STATUS
// ═══════════════════════════════════════════════════════════════════════════

export const SMS_STATUSES = [
  "pending_consent",
  "opted_in",
  "opted_out",
  "invalid",
] as const;

export type SmsStatus = (typeof SMS_STATUSES)[number];

export const SMS_STATUS_LABELS: Record<SmsStatus, string> = {
  pending_consent: "Pending Consent",
  opted_in: "Opted In",
  opted_out: "Opted Out",
  invalid: "Invalid",
};

export const SMS_STATUS_COLORS: Record<SmsStatus, string> = {
  pending_consent: "bg-warning/15 text-warning",
  opted_in: "bg-success/15 text-success",
  opted_out: "bg-muted text-muted-foreground",
  invalid: "bg-destructive/15 text-destructive",
};

// ═══════════════════════════════════════════════════════════════════════════
// PREFERRED CHANNEL
// ═══════════════════════════════════════════════════════════════════════════

export const PREFERRED_CHANNELS = ["email", "sms"] as const;
export type PreferredChannel = (typeof PREFERRED_CHANNELS)[number];
export const PREFERRED_CHANNEL_LABELS: Record<PreferredChannel, string> = {
  email: "Email",
  sms: "SMS",
};

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY STATUS (deprecated, for backwards compatibility)
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use EMAIL_STATUSES instead */
export const CONTACT_STATUSES = [
  "pending_confirmation",
  "active",
  "unsubscribed",
  "bounced",
  "complained",
  "suppressed",
] as const;

/** @deprecated Use EmailStatus instead */
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

/** @deprecated Use EMAIL_STATUS_LABELS instead */
export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  pending_confirmation: "Pending Confirmation",
  active: "Active",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  complained: "Complained",
  suppressed: "Suppressed",
};

/** @deprecated Use EMAIL_STATUS_COLORS instead */
export const CONTACT_STATUS_COLORS: Record<ContactStatus, string> = {
  pending_confirmation: "bg-warning/15 text-warning",
  active: "bg-success/15 text-success",
  unsubscribed: "bg-muted text-muted-foreground",
  bounced: "bg-destructive/15 text-destructive",
  complained: "bg-destructive/15 text-destructive",
  suppressed: "bg-warning/15 text-warning",
};

// ═══════════════════════════════════════════════════════════════════════════
// ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Percentage for an engagement counter pair, or null when the pair can't
 * honestly produce one.
 *
 * A contact's counters are maintained by different writers: `emailsSent` is
 * incremented by the broadcast sender and the workflow email step, while
 * `emailsOpened`/`emailsClicked` are incremented by the SES webhook for *any*
 * message with a contact — transactional sends included, which never touch
 * `emailsSent`. `smsClicked` has no production writer at all. So the numerator
 * can outrun the denominator, and the contacts table rendered the result
 * verbatim: "400% click" was on screen in a real org.
 *
 * A rate above 100% is not a rate, it's a sign the two counters disagree. Show
 * the raw counts instead of a number that cannot be true.
 */
export function engagementRate(
  numerator: number,
  denominator: number
): number | null {
  if (
    !(Number.isFinite(numerator) && Number.isFinite(denominator)) ||
    denominator <= 0 ||
    numerator < 0 ||
    numerator > denominator
  ) {
    return null;
  }
  return (numerator / denominator) * 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT TYPE
// ═══════════════════════════════════════════════════════════════════════════

// Contact with relations
export type ContactWithMeta = {
  id: string;

  // Email channel
  email: string | null;
  emailStatus: EmailStatus | null;
  emailVerifiedAt: Date | null;
  emailUnsubscribedAt: Date | null;
  emailBouncedAt: Date | null;
  emailComplainedAt: Date | null;
  emailSuppressedAt: Date | null;
  lastEmailSentAt: Date | null;
  lastEmailOpenedAt: Date | null;
  lastEmailClickedAt: Date | null;
  emailsSent: number;
  emailsOpened: number;
  emailsClicked: number;

  // SMS channel
  phone: string | null;
  smsStatus: SmsStatus | null;
  smsConsentedAt: Date | null;
  smsOptedOutAt: Date | null;
  smsInvalidAt: Date | null;
  lastSmsSentAt: Date | null;
  lastSmsClickedAt: Date | null;
  smsSent: number;
  smsClicked: number;

  // Contact details
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  preferredChannel: PreferredChannel | null;

  // Shared
  properties: Record<string, unknown>;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  topics?: {
    topicId: string;
    topicName: string;
    status: string;
    subscribedAt: Date | null;
  }[];

  // Deprecated fields (for backwards compatibility)
  /** @deprecated Use emailStatus instead */
  status: ContactStatus;
  /** @deprecated Use emailVerifiedAt instead */
  confirmedAt: Date | null;
  /** @deprecated Use emailUnsubscribedAt instead */
  unsubscribedAt: Date | null;
  /** @deprecated Use emailBouncedAt instead */
  bouncedAt: Date | null;
  /** @deprecated Use emailComplainedAt instead */
  complainedAt: Date | null;
};

// ═══════════════════════════════════════════════════════════════════════════
// RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ListContactsResult =
  | {
      success: true;
      contacts: ContactWithMeta[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { success: false; error: string };

export type GetContactResult =
  | { success: true; contact: ContactWithMeta }
  | { success: false; error: string };

export type CreateContactResult =
  | { success: true; contact: ContactWithMeta }
  | { success: false; error: string };

export type UpdateContactResult =
  | { success: true; contact: ContactWithMeta }
  | { success: false; error: string };

export type DeleteContactResult =
  | { success: true }
  | { success: false; error: string };

export type ImportContactsResult =
  | {
      success: true;
      created: number;
      updated: number;
      skipped: number;
      errors: Array<{ row: number; error: string }>;
    }
  | { success: false; error: string };
