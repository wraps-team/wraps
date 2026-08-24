export type EmailStatus =
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "rejected"
  | "rendering_failure"
  | "delivery_delay"
  | "suppressed";

export type EmailEvent = {
  type: EmailStatus;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

export type Email = {
  id: string;
  messageId: string;
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  status: EmailStatus;
  sentAt: number;
  events: EmailEvent[];
  tags?: Record<string, string>;
};

export type EmailListItem = {
  id: string;
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  status: EmailStatus;
  sentAt: number;
  lastActivityAt: number;
  eventCount: number;
  hasOpened: boolean;
  hasClicked: boolean;
};

/** One AWS account's event-feed health, for the banners above the list. */
export type EmailFeedAccount = {
  /** Masked, e.g. "1234...9012". Multi-account orgs must name the account. */
  maskedAccountId: string;
  /** ISO timestamp the feed was first detected stale, or null when healthy. */
  eventFeedStaleSince: string | null;
  /** False when `last_event_received_at IS NULL` - no event has ever arrived. */
  hasEverReceivedEvents: boolean;
  /** ISO timestamp of the most recent event actually received, or null when
   * `hasEverReceivedEvents` is false. */
  lastEventReceivedAt: string | null;
};

export type EmailListFeed = {
  /**
   * Does this organization have any email send on record, in any window?
   * Carried here so the list can tell an empty window from an empty history
   * without a second round trip.
   */
  hasEverSent: boolean;
  accounts: EmailFeedAccount[];
};

export type EmailListWindow = {
  days: number;
  /** ISO. The window the server actually applied, not the one requested. */
  from: string;
  to: string;
};

export type EmailListResponse = {
  items: EmailListItem[];
  /** Opaque keyset cursor for the next page, or null at the end of the set. */
  nextCursor: string | null;
  window: EmailListWindow;
  feed: EmailListFeed;
};
