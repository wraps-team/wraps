// Contacts types and constants - shared between server actions and client components

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL STATUS
// ═══════════════════════════════════════════════════════════════════════════

export const EMAIL_STATUSES = [
  "active",
  "unsubscribed",
  "bounced",
  "complained",
] as const;

export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  active: "Active",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  complained: "Complained",
};

export const EMAIL_STATUS_COLORS: Record<EmailStatus, string> = {
  active: "bg-green-100 text-green-800",
  unsubscribed: "bg-gray-100 text-gray-800",
  bounced: "bg-red-100 text-red-800",
  complained: "bg-red-100 text-red-800",
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
  pending_consent: "bg-yellow-100 text-yellow-800",
  opted_in: "bg-green-100 text-green-800",
  opted_out: "bg-gray-100 text-gray-800",
  invalid: "bg-red-100 text-red-800",
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
};

/** @deprecated Use EMAIL_STATUS_COLORS instead */
export const CONTACT_STATUS_COLORS: Record<ContactStatus, string> = {
  pending_confirmation: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  unsubscribed: "bg-gray-100 text-gray-800",
  bounced: "bg-red-100 text-red-800",
  complained: "bg-red-100 text-red-800",
};

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
  | { success: true; imported: number; skipped: number; errors: string[] }
  | { success: false; error: string };
