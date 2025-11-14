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
  | "delivery_delay";

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
  eventCount: number;
  hasOpened: boolean;
  hasClicked: boolean;
};
