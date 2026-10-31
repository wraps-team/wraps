/**
 * SES event shapes as EventBridge delivers them to the webhook, and the pure
 * helpers that turn one event into the fields an SDK (direct SES) send row
 * stores. Split out of routes/webhooks.ts; nothing here touches the database.
 */

import { isSuppressionBounceSubType } from "@wraps/core/bounce-classification";
import type { MessageSendDiagnosticInput } from "@wraps/db";
import {
  extractBounceDiagnostic,
  normalizeFeedbackType,
} from "./bounce-diagnostics";

// SES event types we care about
export type SesEventType =
  | "Send"
  | "Delivery"
  | "Open"
  | "Click"
  | "Bounce"
  | "Complaint"
  | "Reject"
  | "Rendering Failure"
  | "DeliveryDelay"
  | "Suppressed";

// SDK sends (direct SES, `transactional` rows with no contact) are linked to a
// contact by recipient address for these events. Delivery is handled separately
// (it clears soft_bounced by address inside the delivery transaction).
export const CONTACT_LINKED_EVENTS = new Set<SesEventType>([
  "Bounce",
  "Complaint",
  "Suppressed",
]);

// EventBridge envelope structure for SES events
export type EventBridgeEvent = {
  version: string;
  id: string;
  "detail-type": string;
  source: string;
  account: string;
  time: string;
  region: string;
  detail: {
    eventType: SesEventType;
    mail?: {
      messageId: string;
      timestamp: string;
      source: string;
      destination: string[];
      commonHeaders?: {
        subject?: string;
      };
      tags?: Record<string, string[]>;
    };
    // Event-specific data
    delivery?: {
      timestamp: string;
      recipients: string[];
    };
    // SES also sends `ipAddress` on open/click. We deliberately don't read or
    // store it — it's recipient personal data we have no feature for.
    open?: {
      timestamp: string;
      userAgent?: string;
    };
    click?: {
      timestamp: string;
      link: string;
      userAgent?: string;
    };
    bounce?: {
      bounceType: string;
      bounceSubType: string;
      timestamp: string;
      // status and diagnosticCode are the receiver's SMTP diagnostic. SES sends
      // them per recipient; they are read here and stored as a diagnostic row.
      bouncedRecipients: Array<{
        emailAddress: string;
        status?: string;
        diagnosticCode?: string;
      }>;
    };
    complaint?: {
      timestamp: string;
      complainedRecipients: Array<{ emailAddress: string }>;
      complaintFeedbackType?: string;
    };
    // Suppression event data (from transformed Lambda events)
    suppression?: {
      reason: string; // "Suppressed" or "OnAccountSuppressionList"
      timestamp: string;
      suppressedRecipients: Array<{ emailAddress: string }>;
    };
    // Rendering failure data (SES template variable missing, etc.)
    failure?: {
      errorMessage: string;
      templateName: string;
    };
  };
};

/**
 * Derive the persisted status + event timestamps for an SDK send (direct SES)
 * from whichever lifecycle event arrives first. SES does NOT guarantee event
 * ordering, so the row may be materialized by a Delivery/Bounce that precedes
 * its Send event. Returns null for events that shouldn't create a standalone
 * log row on their own (Open, Click, Reject, DeliveryDelay, Rendering Failure).
 */
export function sdkLogLifecycleFields(
  eventType: SesEventType,
  detail: EventBridgeEvent["detail"]
): {
  status: "sent" | "delivered" | "bounced" | "complained" | "suppressed";
  deliveredAt?: Date;
  bouncedAt?: Date;
  bounceType?: string;
  bounceSubType?: string;
  complainedAt?: Date;
  suppressedAt?: Date;
} | null {
  switch (eventType) {
    case "Send":
      return { status: "sent" };
    case "Delivery":
      return {
        status: "delivered",
        deliveredAt: detail.delivery?.timestamp
          ? new Date(detail.delivery.timestamp)
          : undefined,
      };
    case "Bounce":
      return {
        status: "bounced",
        bouncedAt: detail.bounce?.timestamp
          ? new Date(detail.bounce.timestamp)
          : undefined,
        bounceType: detail.bounce?.bounceType,
        bounceSubType: detail.bounce?.bounceSubType,
      };
    case "Complaint":
      return {
        status: "complained",
        complainedAt: detail.complaint?.timestamp
          ? new Date(detail.complaint.timestamp)
          : undefined,
      };
    case "Suppressed":
      return {
        status: "suppressed",
        suppressedAt: detail.suppression?.timestamp
          ? new Date(detail.suppression.timestamp)
          : undefined,
      };
    default:
      return null;
  }
}

/**
 * The diagnostic an SDK-path Bounce or Complaint stores when its event creates
 * the messageSend row. Null for every other event, and for suppression subtypes:
 * those are not recorded as bounces (see processBounce).
 */
export function sdkDiagnosticFor(
  eventType: SesEventType,
  detail: EventBridgeEvent["detail"],
  recipient: string
): Omit<MessageSendDiagnosticInput, "organizationId" | "messageSendId"> | null {
  if (eventType === "Bounce") {
    if (isSuppressionBounceSubType(detail.bounce?.bounceSubType)) {
      return null;
    }
    return {
      eventType: "bounce",
      ...extractBounceDiagnostic(detail.bounce?.bouncedRecipients, recipient),
      feedbackType: null,
    };
  }
  if (eventType === "Complaint") {
    return {
      eventType: "complaint",
      enhancedStatus: null,
      diagnosticCode: null,
      reasonKey: null,
      feedbackType: normalizeFeedbackType(
        detail.complaint?.complaintFeedbackType
      ),
    };
  }
  return null;
}
