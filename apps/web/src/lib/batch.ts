/**
 * Batch Send Types and Helpers
 */

// Status types matching the database enum
export const BATCH_STATUSES = [
  "draft",
  "scheduled",
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

// Channel types
export const CHANNELS = ["email", "sms"] as const;
export type Channel = (typeof CHANNELS)[number];

// Status display labels
export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  queued: "Queued",
  processing: "Sending",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

// Status colors for badges
export const BATCH_STATUS_COLORS: Record<BatchStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-purple-100 text-purple-700",
  queued: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

/** A paused broadcast keeps status 'processing' — batchSendStatusEnum has no
 *  'paused' value on purpose (see plan 163). Callers render the paused
 *  presentation when this returns non-null. */
export function getPausedPresentation(
  status: string,
  pausedReason: string | null
): { label: string; color: string; explanation: string } | null {
  if (status !== "processing" || !pausedReason) {
    return null;
  }
  const color = "bg-amber-100 text-amber-800";
  if (pausedReason === "daily_quota") {
    return {
      label: "Paused — daily quota",
      color,
      explanation:
        "This account has sent its full SES 24-hour quota. Sending resumes automatically as the rolling window frees up.",
    };
  }
  if (pausedReason === "quota_reserve") {
    return {
      label: "Paused — quota reserve",
      color,
      explanation:
        "Sending is held back so transactional email keeps its reserved quota. It resumes automatically as quota frees up.",
    };
  }
  return {
    label: "Paused",
    color,
    explanation: "Sending is paused and will resume automatically.",
  };
}

/** A `completed` broadcast that sent nothing is not a success. batchSendStatusEnum
 *  has no value for it — like getPausedPresentation, this synthesises the
 *  presentation instead. Callers render this in place of the status badge when
 *  it returns non-null. */
export function getZeroSendPresentation(
  status: string,
  sent: number
): { label: string; color: string } | null {
  if (status !== "completed" || sent > 0) {
    return null;
  }
  return {
    label: "Completed — nothing sent",
    color: "bg-amber-100 text-amber-800",
  };
}

// Channel display
export const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  sms: "SMS",
};

// Batch send with metadata
export type BatchSendWithMeta = {
  id: string;
  name: string | null;
  channel: Channel;
  status: BatchStatus;
  // Email-specific
  subject: string | null;
  previewText: string | null;
  from: string | null;
  fromName: string | null;
  replyTo: string | null;
  templateId: string | null;
  templateName?: string;
  // Draft configuration — only populated by single-batch loads (getBatchSend),
  // which is what the draft editor reloads from. The list view omits them to
  // keep row payloads small.
  htmlContent?: string | null;
  variableMappings?: VariableMapping[] | null;
  audienceType?: AudienceType | null;
  topicId?: string | null;
  segmentId?: string | null;
  // Progress
  totalRecipients: number;
  processedRecipients: number;
  sent: number;
  delivered: number;
  failed: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  // Error
  errorMessage: string | null;
  /** Non-null while the worker is re-enqueueing without sending. Set by the
   *  batch-sender; `'quota_reserve'` = held back to protect transactional mail,
   *  `'daily_quota'` = the account's SES 24h quota is spent. Cleared on the
   *  first chunk that actually sends. */
  pausedReason: string | null;
  /** Last chunk the worker completed. Used to show how long a pause has run. */
  lastChunkAt: Date | null;
  // Timing
  scheduledFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  // Created by
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  // AWS Account
  awsAccount: {
    id: string;
    name: string;
    region: string;
  } | null;
};

// Recipient filter types
export type AudienceType = "all" | "topic" | "segment";

export type RecipientFilter = {
  audienceType: AudienceType;
  topicId?: string;
  segmentId?: string;
};

// Content type for email
export type ContentType = "template" | "html";

// Variable mapping types
export type VariableSource =
  | { type: "static"; value: string }
  | { type: "contact"; field: string }; // e.g., "firstName", "customFields.dashboardUrl"

export type VariableMapping = {
  variableName: string; // e.g., "dashboardUrl"
  source: VariableSource;
};

export type ExtractedVariable = {
  name: string;
  label?: string;
  fallback?: string;
  isKnown: boolean; // true for contact.firstName, organization.name, etc.
  category: "contact" | "organization" | "system" | "custom";
};

// Create batch input
export type CreateBatchInput = {
  name?: string;
  channel?: Channel;
  // Recipient targeting
  recipientFilter?: RecipientFilter;
  // Content type
  contentType?: ContentType;
  // Email-specific
  subject?: string;
  previewText?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  templateId?: string;
  htmlContent?: string;
  // Variable mappings for custom variables
  variableMappings?: VariableMapping[];
  // SMS-specific (Phase 3)
  body?: string;
  senderId?: string;
  // AWS account
  awsAccountId: string;
  // Scheduling
  scheduledFor?: Date;
};

// Draft batch inputs: everything optional — drafts can be empty skeletons.
// awsAccountId is optional on drafts (users may save before picking an account),
// but is required at promote time.
export type CreateDraftBatchInput = Partial<
  Omit<CreateBatchInput, "awsAccountId" | "scheduledFor">
> & {
  awsAccountId?: string;
  /** `null` clears a schedule already stored on the draft. */
  scheduledFor?: Date | null;
};

export type UpdateDraftBatchInput = CreateDraftBatchInput;

// Result types
export type CreateBatchResult =
  | {
      success: true;
      batch: BatchSendWithMeta;
      /** Set when the send will pause partway to protect the quota reserve. */
      warning?: string;
    }
  | {
      success: false;
      error: string;
    };

export type ListBatchesResult =
  | {
      success: true;
      batches: BatchSendWithMeta[];
      total: number;
    }
  | {
      success: false;
      error: string;
    };

export type GetBatchResult =
  | {
      success: true;
      batch: BatchSendWithMeta;
    }
  | {
      success: false;
      error: string;
    };

export type CancelBatchResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

// Draft lifecycle result types (all share the same `{ success, batch? | error }`
// shape so call sites can branch uniformly on `result.success`).
export type SaveDraftBatchResult =
  | { success: true; batch: BatchSendWithMeta }
  | { success: false; error: string };

export type UpdateDraftBatchResult =
  | { success: true; batch: BatchSendWithMeta }
  | { success: false; error: string };

export type PromoteDraftBatchResult =
  | { success: true; batch: BatchSendWithMeta; warning?: string }
  | { success: false; error: string };

export type DeleteDraftBatchResult =
  | { success: true }
  | { success: false; error: string };

export type DuplicateBatchResult =
  | { success: true; batch: BatchSendWithMeta }
  | { success: false; error: string };

// Sample contact for audience preview
export type SampleContact = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
};

export type GetSampleContactsResult =
  | {
      success: true;
      contacts: SampleContact[];
      totalCount: number;
    }
  | {
      success: false;
      error: string;
    };

export type CheckTemplateVariableCoverageResult =
  | {
      success: true;
      allFail: boolean;
      missingCount: number;
      totalSampled: number;
      totalRecipients: number;
      missingVariables: string[];
    }
  | {
      success: false;
      error: string;
    };

// Result type for the pre-confirmation send-duration estimate. `available`
// distinguishes "quota data couldn't be read" (fail open, render nothing)
// from a real estimate — it is never an error condition on its own, which is
// why this has no `success: false` variant driven by unavailability.
export type CheckSendDurationResult =
  | {
      success: true;
      available: false;
    }
  | {
      success: true;
      available: true;
      /**
       * Non-null only when the audience, plus recipients still unsent on
       * other in-flight broadcasts on this AWS account, exceeds a full
       * day's capacity.
       */
      estimatedDays: number | null;
      dailyCapacity: number;
      /** Other queued/processing email broadcasts on this AWS account. */
      inFlightBatches: number;
      /** Their combined unsent remainder — the quota this send has to share. */
      inFlightRecipients: number;
    }
  | {
      success: false;
      error: string;
    };

// Helper to calculate progress percentage
export function calculateProgress(batch: BatchSendWithMeta): number {
  if (batch.totalRecipients === 0) {
    return 0;
  }
  return Math.round((batch.processedRecipients / batch.totalRecipients) * 100);
}

// Helper to calculate delivery rate
export function calculateDeliveryRate(batch: BatchSendWithMeta): number {
  if (batch.sent === 0) {
    return 0;
  }
  return Math.round((batch.delivered / batch.sent) * 100);
}

// Helper to calculate open rate (email only)
export function calculateOpenRate(batch: BatchSendWithMeta): number {
  if (batch.delivered === 0) {
    return 0;
  }
  return Math.round((batch.opened / batch.delivered) * 100);
}

// Helper to calculate click rate
export function calculateClickRate(batch: BatchSendWithMeta): number {
  if (batch.delivered === 0) {
    return 0;
  }
  return Math.round((batch.clicked / batch.delivered) * 100);
}

// Helper to format duration
export function formatDuration(
  startedAt: Date | null,
  completedAt: Date | null
): string {
  if (!startedAt) {
    return "-";
  }
  const end = completedAt ?? new Date();
  const durationMs = end.getTime() - startedAt.getTime();

  if (durationMs < 1000) {
    return "<1s";
  }
  if (durationMs < 60_000) {
    return `${Math.round(durationMs / 1000)}s`;
  }
  if (durationMs < 3_600_000) {
    return `${Math.round(durationMs / 60_000)}m`;
  }
  return `${Math.round(durationMs / 3_600_000)}h`;
}
