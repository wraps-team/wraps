/**
 * One status palette for the whole emails surface (audit finding F12).
 *
 * The list and the detail page each carried their own map, so the same status
 * was a different colour depending on which page you were on - `sent` grey on
 * the list and blue on the detail page, `opened` blue then purple, `clicked`
 * purple then indigo. Colour was the only thing carrying severity at a glance,
 * and it meant two different things.
 *
 * Two further defects are closed here:
 * - Neither map had a fallback, so a status outside the union made
 *   `config.icon` undefined and blanked the whole table. `getEmailStatusConfig`
 *   always returns something.
 * - The detail page's map had no `dark:` variants at all. One `tone.text` is
 *   shared by the badge label and the timeline icon, so a colour cannot be
 *   defined for one theme and forgotten for the other.
 */

import {
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  type LucideIcon,
  Mail,
  MousePointerClick,
  XCircle,
} from "lucide-react";
import type { EmailStatus } from "../types";

const UNDERSCORES = /_/g;
const WHITESPACE = /\s+/g;

export type EmailStatusTone = {
  /** Tinted surface and border for a badge. */
  surface: string;
  /** Text colour, light and dark. Shared by the badge and the timeline icon. */
  text: string;
};

export type EmailStatusConfig = {
  icon: LucideIcon;
  label: string;
  tone: EmailStatusTone;
};

/** A status we do not recognise is neutral, not invisible and not a crash. */
const UNKNOWN_TONE: EmailStatusTone = {
  surface: "bg-muted border-border",
  text: "text-muted-foreground",
};

const STATUS_CONFIG: Record<EmailStatus, EmailStatusConfig> = {
  sent: {
    icon: Clock,
    label: "Sent",
    // Neutral by semantics as well as by colour: accepted by SES, no outcome
    // reported yet.
    tone: { surface: "bg-muted border-border", text: "text-muted-foreground" },
  },
  delivered: {
    icon: CheckCircle2,
    label: "Delivered",
    tone: {
      surface: "bg-green-500/10 border-green-500/20",
      text: "text-green-700 dark:text-green-400",
    },
  },
  opened: {
    icon: Mail,
    label: "Opened",
    tone: {
      surface: "bg-blue-500/10 border-blue-500/20",
      text: "text-blue-700 dark:text-blue-400",
    },
  },
  clicked: {
    icon: MousePointerClick,
    label: "Clicked",
    tone: {
      surface: "bg-purple-500/10 border-purple-500/20",
      text: "text-purple-700 dark:text-purple-400",
    },
  },
  bounced: {
    icon: XCircle,
    label: "Bounced",
    tone: {
      surface: "bg-orange-500/10 border-orange-500/20",
      text: "text-orange-700 dark:text-orange-400",
    },
  },
  suppressed: {
    icon: Ban,
    label: "Suppressed",
    tone: {
      surface: "bg-amber-500/10 border-amber-500/20",
      text: "text-amber-700 dark:text-amber-400",
    },
  },
  complained: {
    icon: XCircle,
    label: "Complained",
    tone: {
      surface: "bg-red-500/10 border-red-500/20",
      text: "text-red-700 dark:text-red-400",
    },
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    tone: {
      surface: "bg-red-500/10 border-red-500/20",
      text: "text-red-700 dark:text-red-400",
    },
  },
  rejected: {
    icon: XCircle,
    label: "Rejected",
    tone: {
      surface: "bg-red-500/10 border-red-500/20",
      text: "text-red-700 dark:text-red-400",
    },
  },
  rendering_failure: {
    icon: XCircle,
    label: "Rendering failure",
    tone: {
      surface: "bg-red-500/10 border-red-500/20",
      text: "text-red-700 dark:text-red-400",
    },
  },
  delivery_delay: {
    icon: Clock,
    label: "Delivery delay",
    tone: {
      surface: "bg-yellow-500/10 border-yellow-500/20",
      text: "text-yellow-700 dark:text-yellow-400",
    },
  },
};

/**
 * SES event names as the timeline stores them, mapped to the status they mean.
 * The timeline keeps the raw SES event type ("Send", "Rendering Failure"), so
 * without this the detail page looked every event up by a key its own map did
 * not have and rendered it with no colour at all.
 */
const STATUS_ALIASES: Record<string, EmailStatus> = {
  bounce: "bounced",
  click: "clicked",
  complaint: "complained",
  delivery: "delivered",
  deliverydelay: "delivery_delay",
  open: "opened",
  reject: "rejected",
  renderingfailure: "rendering_failure",
  send: "sent",
  suppress: "suppressed",
};

/** "Rendering_failure" -> "Rendering failure". Never a raw enum on screen. */
export function humanizeEmailStatus(status: string): string {
  const words = status
    .replace(UNDERSCORES, " ")
    .replace(WHITESPACE, " ")
    .trim()
    .toLowerCase();
  if (words.length === 0) {
    return "Unknown";
  }
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The `EmailStatus` a raw value means, or `null` if we do not know it. */
export function normalizeEmailStatus(status: string): EmailStatus | null {
  const key = status.trim().toLowerCase().replace(WHITESPACE, "_");
  if (key in STATUS_CONFIG) {
    return key as EmailStatus;
  }
  return STATUS_ALIASES[key.replace(UNDERSCORES, "")] ?? null;
}

/**
 * Total: every string has a rendering. An unrecognised status gets a neutral
 * badge carrying its own name, which is strictly more useful than the blank
 * table the previous `Record` lookup produced.
 */
export function getEmailStatusConfig(status: string): EmailStatusConfig {
  const normalized = normalizeEmailStatus(status);
  if (normalized) {
    return STATUS_CONFIG[normalized];
  }
  return {
    icon: CircleDashed,
    label: humanizeEmailStatus(status),
    tone: UNKNOWN_TONE,
  };
}
