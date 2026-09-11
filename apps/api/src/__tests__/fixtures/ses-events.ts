/**
 * SES Event Fixtures
 *
 * Factory functions that produce EventBridge-wrapped SES events matching the
 * shape parsed by routes/webhooks.ts. All fixtures default to a sensible happy
 * path; override any field via the `overrides` param.
 */

type Mail = {
  messageId: string;
  timestamp: string;
  source: string;
  destination: string[];
  commonHeaders?: { subject?: string };
  tags?: Record<string, string[]>;
};

type BaseOverrides = {
  id?: string;
  time?: string;
  account?: string;
  region?: string;
  mail?: Partial<Mail>;
};

const DEFAULT_ACCOUNT = "123456789012";
const DEFAULT_MESSAGE_ID = "ses-msg-001";

function makeMail(overrides: Partial<Mail> = {}): Mail {
  return {
    messageId: DEFAULT_MESSAGE_ID,
    timestamp: new Date().toISOString(),
    source: "noreply@test.com",
    destination: ["user@example.com"],
    ...overrides,
  };
}

function baseEnvelope(overrides: BaseOverrides = {}) {
  return {
    version: "0",
    id: overrides.id ?? "event-1",
    "detail-type": "Email Sending Events",
    source: "aws.ses",
    account: overrides.account ?? DEFAULT_ACCOUNT,
    time: overrides.time ?? new Date().toISOString(),
    region: overrides.region ?? "us-east-1",
  };
}

export function buildBounceEvent(
  overrides: BaseOverrides & {
    bounceType?: string;
    bounceSubType?: string;
    bouncedAt?: string;
    recipients?: string[];
  } = {}
) {
  const bouncedAt = overrides.bouncedAt ?? new Date().toISOString();
  return {
    ...baseEnvelope(overrides),
    detail: {
      eventType: "Bounce" as const,
      mail: makeMail(overrides.mail),
      bounce: {
        bounceType: overrides.bounceType ?? "Permanent",
        bounceSubType: overrides.bounceSubType ?? "General",
        timestamp: bouncedAt,
        bouncedRecipients: (overrides.recipients ?? ["user@example.com"]).map(
          (emailAddress) => ({ emailAddress })
        ),
      },
    },
  };
}

export function buildComplaintEvent(
  overrides: BaseOverrides & {
    complainedAt?: string;
    recipients?: string[];
    complaintFeedbackType?: string;
  } = {}
) {
  const complainedAt = overrides.complainedAt ?? new Date().toISOString();
  return {
    ...baseEnvelope(overrides),
    detail: {
      eventType: "Complaint" as const,
      mail: makeMail(overrides.mail),
      complaint: {
        timestamp: complainedAt,
        complainedRecipients: (
          overrides.recipients ?? ["user@example.com"]
        ).map((emailAddress) => ({ emailAddress })),
        complaintFeedbackType: overrides.complaintFeedbackType ?? "abuse",
      },
    },
  };
}

export function buildDeliveryEvent(
  overrides: BaseOverrides & {
    deliveredAt?: string;
    recipients?: string[];
  } = {}
) {
  const deliveredAt = overrides.deliveredAt ?? new Date().toISOString();
  return {
    ...baseEnvelope(overrides),
    detail: {
      eventType: "Delivery" as const,
      mail: makeMail(overrides.mail),
      delivery: {
        timestamp: deliveredAt,
        recipients: overrides.recipients ?? ["user@example.com"],
      },
    },
  };
}

export function buildOpenEvent(
  overrides: BaseOverrides & {
    openedAt?: string;
    userAgent?: string;
    ipAddress?: string;
  } = {}
) {
  const openedAt = overrides.openedAt ?? new Date().toISOString();
  return {
    ...baseEnvelope(overrides),
    detail: {
      eventType: "Open" as const,
      mail: makeMail(overrides.mail),
      open: {
        timestamp: openedAt,
        userAgent:
          overrides.userAgent ??
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        ipAddress: overrides.ipAddress ?? "203.0.113.42",
      },
    },
  };
}

export function buildClickEvent(
  overrides: BaseOverrides & {
    clickedAt?: string;
    link?: string;
    userAgent?: string;
    ipAddress?: string;
  } = {}
) {
  const clickedAt = overrides.clickedAt ?? new Date().toISOString();
  return {
    ...baseEnvelope(overrides),
    detail: {
      eventType: "Click" as const,
      mail: makeMail(overrides.mail),
      click: {
        timestamp: clickedAt,
        link: overrides.link ?? "https://example.com/cta",
        userAgent:
          overrides.userAgent ??
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        ipAddress: overrides.ipAddress ?? "198.51.100.10",
      },
    },
  };
}

export function buildRejectEvent(
  overrides: BaseOverrides & {
    reason?: string;
  } = {}
) {
  return {
    ...baseEnvelope(overrides),
    detail: {
      eventType: "Reject" as const,
      mail: makeMail(overrides.mail),
      reject: {
        reason: overrides.reason ?? "Bad content",
      },
    },
  };
}

export function buildSuppressionEvent(
  overrides: BaseOverrides & {
    reason?: string;
    suppressedAt?: string;
    recipients?: string[];
  } = {}
) {
  const suppressedAt = overrides.suppressedAt ?? new Date().toISOString();
  return {
    ...baseEnvelope(overrides),
    detail: {
      eventType: "Suppressed" as const,
      mail: makeMail(overrides.mail),
      suppression: {
        reason: overrides.reason ?? "OnAccountSuppressionList",
        timestamp: suppressedAt,
        suppressedRecipients: (
          overrides.recipients ?? ["user@example.com"]
        ).map((emailAddress) => ({ emailAddress })),
      },
    },
  };
}

export function buildRenderingFailureEvent(
  overrides: BaseOverrides & {
    errorMessage?: string;
    templateName?: string;
  } = {}
) {
  return {
    ...baseEnvelope(overrides),
    detail: {
      eventType: "Rendering Failure" as const,
      mail: makeMail(overrides.mail),
      failure: {
        errorMessage: overrides.errorMessage ?? "Missing template variable",
        templateName: overrides.templateName ?? "welcome-email",
      },
    },
  };
}
